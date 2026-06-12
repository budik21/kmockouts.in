import { Resend } from 'resend';
import { buildTipResultEmail, type TipResultEmailData } from './email-templates/tip-result';
import { query, queryOne } from './db';
import type { TipTransition } from './tip-recalc';
import { getCachedTeamArticle } from '@/engine/team-article-ai';
import { TIP_LOCK_LEAD_MS } from './tip-lock';

export interface NotifyUser {
  email: string;
  name: string;
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
}

export interface NotifyPayload {
  user: NotifyUser;
  points: 0 | 1 | 4;
  data: Omit<TipResultEmailData, 'userName' | 'points'>;
}

function shouldSend(user: NotifyUser, points: 0 | 1 | 4): boolean {
  if (points === 4) return user.notify_exact_score;
  if (points === 1) return user.notify_winner_only;
  return user.notify_wrong_tip;
}

/** Human-readable reason why a recipient was skipped, for the diagnostic e-mail. */
function skipReason(points: 0 | 1 | 4): string {
  if (points === 4) return 'exact-score notifications off';
  if (points === 1) return 'winner-only notifications off';
  return 'wrong-tip notifications off';
}

/**
 * Per-recipient outcome of a tip-result e-mail dispatch. Returned by
 * `dispatchTipResultEmails` so the caller (the match-update cascade) can fold
 * it into the superadmin diagnostic e-mail and see exactly what happened to
 * each notification.
 */
export interface TipEmailDispatchResult {
  tipId: number;
  userName: string;
  userEmail: string;
  points: number | null;
  outcome: 'sent' | 'skipped' | 'disabled' | 'failed';
  reason?: string;
}

/**
 * Send a single tip-result e-mail if the user opted in.
 * Returns 'skipped' when the user has the relevant toggle off,
 * 'disabled' when Resend is not configured, or 'sent' on success.
 */
export async function sendTipResultEmail(payload: NotifyPayload): Promise<'sent' | 'skipped' | 'disabled'> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 'disabled';
  if (!shouldSend(payload.user, payload.points)) return 'skipped';

  const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
  const resend = new Resend(apiKey);

  const { subject, html } = buildTipResultEmail({
    userName: payload.user.name,
    points: payload.points,
    ...payload.data,
  });

  // Resend does NOT throw on API-level rejections (unverified domain, invalid
  // recipient, sandbox-only sending, …) — it returns `{ data, error }`. If we
  // ignore `error` we'd mark the tip notified without anything being sent. Throw
  // so the dispatcher records 'failed' (and leaves notified_at unset to retry).
  const { data, error } = await resend.emails.send({
    from,
    to: payload.user.email,
    subject,
    html,
  });
  if (error) {
    throw new Error(`Resend rejected: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!data?.id) {
    throw new Error('Resend returned no message id');
  }

  return 'sent';
}

interface TransitionRow {
  tip_id: number;
  user_id: number;
  tip_home_goals: number;
  tip_away_goals: number;
  new_points: number;
  email: string;
  user_name: string;
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
  match_id: number;
  match_group_id: string;
  kick_off: string;
  home_goals: number;
  away_goals: number;
  home_team_id: number;
  home_team_name: string;
  home_country_code: string;
  away_team_id: number;
  away_team_name: string;
  away_country_code: string;
}

/**
 * Send tip-result e-mails for transitions where a tip was just scored
 * (oldPoints was NULL and newPoints is 0/1/4). Respects per-user opt-in.
 * Individual failures are captured (not thrown) so one bad recipient cannot
 * abort the rest. Returns a per-recipient outcome list for the diagnostic
 * e-mail.
 */
export async function dispatchTipResultEmails(transitions: TipTransition[]): Promise<TipEmailDispatchResult[]> {
  const firstScored = transitions.filter(
    (t) => t.oldPoints === null && t.newPoints !== null,
  );
  const hasKey = !!process.env.RESEND_API_KEY;
  console.log(
    `[tip-notifications] transitions=${transitions.length} firstScored=${firstScored.length} resendKey=${hasKey ? 'set' : 'missing'}`,
  );
  if (firstScored.length === 0) return [];

  const tipIds = firstScored.map((t) => t.tipId);

  const rows = await query<TransitionRow>(
    `SELECT
       t.id AS tip_id,
       t.user_id AS user_id,
       t.home_goals AS tip_home_goals,
       t.away_goals AS tip_away_goals,
       t.points AS new_points,
       u.email,
       u.name AS user_name,
       u.notify_exact_score,
       u.notify_winner_only,
       u.notify_wrong_tip,
       m.id AS match_id,
       m.group_id AS match_group_id,
       m.kick_off,
       m.home_goals,
       m.away_goals,
       ht.id AS home_team_id,
       ht.name AS home_team_name,
       ht.country_code AS home_country_code,
       at.id AS away_team_id,
       at.name AS away_team_name,
       at.country_code AS away_country_code
     FROM tip t
     JOIN tipster_user u ON u.id = t.user_id
     JOIN match m ON m.id = t.match_id
     JOIN team ht ON ht.id = m.home_team_id
     JOIN team at ON at.id = m.away_team_id
     WHERE t.id = ANY($1::int[])`,
    [tipIds],
  );

  return sendTipEmailsForRows(rows, hasKey);
}

/** Per-user standings snapshot embedded in the tip-result e-mail. */
interface UserStandings {
  points: number;
  exact: number;
  outcome: number;
  wrong: number;
  showTipNudge: boolean;
  global: { rank: number; total: number } | null;
  leagues: Array<{ name: string; code: string; rank: number; memberCount: number }>;
}

/**
 * Load the tip totals, global-leaderboard rank and every league rank for the
 * given users so the tip-result e-mail can show "where you stand" with a medal
 * for podium finishes. Three queries:
 *   1. Per-user tip totals (points + exact/correct/missed/pending) — NOT
 *      filtered by tips_public, so private users still get their totals and the
 *      "no tips lined up" nudge.
 *   2. Global rank via a window over the public leaderboard (same ordering as
 *      the site: points DESC, exact DESC, outcome DESC, tips ASC, name ASC).
 *      Private users (tips_public = false) get global: null.
 *   3. Each league's rank + member count, with the league code for the link.
 * Ranks/points come from the same recalc that runs before e-mails dispatch
 * (recalculateAllTipPoints → recalculateLeagueStandings), so they're current.
 */
async function loadStandingsForUsers(userIds: number[]): Promise<Map<number, UserStandings>> {
  const result = new Map<number, UserStandings>();
  if (userIds.length === 0) return result;
  for (const id of userIds) {
    result.set(id, { points: 0, exact: 0, outcome: 0, wrong: 0, showTipNudge: false, global: null, leagues: [] });
  }

  // Is there at least one match still open for tipping? Mirrors isTipLocked:
  // a match is tippable while it's SCHEDULED and kick-off is more than
  // TIP_LOCK_LEAD_MS away. Global (same for everyone), so query it once. When
  // none remain (tournament over) we never show the "go tip more" nudge.
  const lockThreshold = new Date(Date.now() + TIP_LOCK_LEAD_MS).toISOString();
  const openRow = await queryOne<{ open: boolean }>(
    `SELECT EXISTS(
        SELECT 1 FROM match
         WHERE status = 'SCHEDULED' AND kick_off > $1
     ) AS open`,
    [lockThreshold],
  );
  const openMatchesExist = openRow?.open ?? false;

  // 1. Per-user totals (all tips, regardless of public/private).
  const totalRows = await query<{
    user_id: number;
    exact_count: string;
    outcome_count: string;
    wrong_count: string;
    pending_count: string;
    total_points: string;
  }>(
    `SELECT
        t.user_id,
        COUNT(*) FILTER (WHERE t.points = 4)    AS exact_count,
        COUNT(*) FILTER (WHERE t.points = 1)    AS outcome_count,
        COUNT(*) FILTER (WHERE t.points = 0)    AS wrong_count,
        COUNT(*) FILTER (WHERE t.points IS NULL) AS pending_count,
        COALESCE(SUM(CASE WHEN t.points IS NOT NULL THEN t.points ELSE 0 END), 0) AS total_points
      FROM tip t
      WHERE t.user_id = ANY($1::int[])
      GROUP BY t.user_id`,
    [userIds],
  );
  for (const r of totalRows) {
    const entry = result.get(r.user_id);
    if (entry) {
      entry.points = parseInt(r.total_points, 10);
      entry.exact = parseInt(r.exact_count, 10);
      entry.outcome = parseInt(r.outcome_count, 10);
      entry.wrong = parseInt(r.wrong_count, 10);
      // Nudge only when nothing is in flight AND there's still something to tip.
      entry.showTipNudge = parseInt(r.pending_count, 10) === 0 && openMatchesExist;
    }
  }

  // 2. Global leaderboard rank (public users only).
  const globalRows = await query<{ user_id: number; rank: string; total: string }>(
    `WITH agg AS (
        SELECT
          u.id AS user_id,
          u.name AS user_name,
          COUNT(t.id)                             AS total_tips,
          COUNT(t.id) FILTER (WHERE t.points = 4) AS exact_count,
          COUNT(t.id) FILTER (WHERE t.points = 1) AS outcome_count,
          COALESCE(SUM(CASE WHEN t.points IS NOT NULL THEN t.points ELSE 0 END), 0) AS total_points
        FROM tipster_user u
        LEFT JOIN tip t ON t.user_id = u.id
        WHERE u.tips_public = true
        GROUP BY u.id, u.name
        HAVING COUNT(t.id) > 0
     ),
     ranked AS (
        SELECT
          user_id,
          ROW_NUMBER() OVER (
            ORDER BY total_points DESC, exact_count DESC, outcome_count DESC,
                     total_tips ASC, user_name ASC
          ) AS rank,
          COUNT(*) OVER () AS total
        FROM agg
     )
     SELECT user_id, rank, total FROM ranked WHERE user_id = ANY($1::int[])`,
    [userIds],
  );
  for (const r of globalRows) {
    const entry = result.get(r.user_id);
    if (entry) entry.global = { rank: parseInt(r.rank, 10), total: parseInt(r.total, 10) };
  }

  // 3. Per-league rank + member count.
  const leagueRows = await query<{ user_id: number; name: string; code: string; rank: number; member_count: string }>(
    `SELECT
        s.user_id,
        l.name,
        l.code,
        s.rank,
        (SELECT COUNT(*) FROM pickem_league_standings s2 WHERE s2.league_id = s.league_id) AS member_count
      FROM pickem_league_standings s
      JOIN pickem_league l ON l.id = s.league_id
      WHERE s.user_id = ANY($1::int[])
      ORDER BY s.user_id, s.rank ASC, l.name ASC`,
    [userIds],
  );
  for (const r of leagueRows) {
    const entry = result.get(r.user_id);
    if (entry) {
      entry.leagues.push({ name: r.name, code: r.code, rank: r.rank, memberCount: parseInt(r.member_count, 10) });
    }
  }

  return result;
}

// The outbound e-mail API is rate-limited (~5 requests/second in production).
// With dozens of tipsters an unbounded Promise.allSettled fires every send in
// one burst and gets throttled mid-run, so actual sends go out in batches of
// SEND_BATCH_SIZE with a SEND_BATCH_DELAY_MS pause between batches.
const SEND_BATCH_SIZE = 5;
const SEND_BATCH_DELAY_MS = 2000;

/**
 * Shared send loop: takes joined tip+user+match+team rows and sends one
 * tip-result e-mail per row, respecting the per-user opt-in. Sends are paced
 * in small batches to stay under the e-mail API rate limit. Returns a
 * per-recipient outcome list. Team articles are loaded with
 * `ignorePending: true` so the e-mail always embeds the freshly-generated
 * article even while the group's AI job is still 'processing'.
 */
async function sendTipEmailsForRows(rows: TransitionRow[], hasKey: boolean): Promise<TipEmailDispatchResult[]> {
  const uniqueTeamIds = Array.from(
    new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id])),
  );
  const articleEntries = await Promise.all(
    uniqueTeamIds.map(async (id) => {
      const article = await getCachedTeamArticle(id, { ignorePending: true });
      return [id, article] as const;
    }),
  );
  const articleByTeamId = new Map(articleEntries);

  // Current global + per-league standings for everyone being e-mailed, so each
  // message can show "where you stand" with a podium medal.
  const uniqueUserIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const standingsByUserId = await loadStandingsForUsers(uniqueUserIds);

  const results: TipEmailDispatchResult[] = [];

  // Classify every row first; only rows that actually trigger an e-mail API
  // call go through the paced batches below, so skipped/disabled rows don't
  // burn batch slots or delay real sends.
  const sendable: Array<{ row: TransitionRow; user: NotifyUser; points: 0 | 1 | 4 }> = [];
  for (const r of rows) {
    const base = {
      tipId: r.tip_id,
      userName: r.user_name,
      userEmail: r.email,
      points: r.new_points,
    };
    if (r.new_points !== 0 && r.new_points !== 1 && r.new_points !== 4) {
      results.push({ ...base, outcome: 'skipped', reason: `points=${r.new_points} not a scorable result` });
      continue;
    }
    const points = r.new_points as 0 | 1 | 4;
    const user: NotifyUser = {
      email: r.email,
      name: r.user_name,
      notify_exact_score: r.notify_exact_score,
      notify_winner_only: r.notify_winner_only,
      notify_wrong_tip: r.notify_wrong_tip,
    };
    if (!hasKey) {
      results.push({ ...base, outcome: 'disabled', reason: 'RESEND_API_KEY missing' });
      continue;
    }
    if (!shouldSend(user, points)) {
      results.push({ ...base, outcome: 'skipped', reason: skipReason(points) });
      continue;
    }
    sendable.push({ row: r, user, points });
  }

  for (let i = 0; i < sendable.length; i += SEND_BATCH_SIZE) {
    const batch = sendable.slice(i, i + SEND_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async ({ row: r, user, points }) => {
        const base = {
          tipId: r.tip_id,
          userName: r.user_name,
          userEmail: r.email,
          points: r.new_points,
        };
        try {
          const homeArticle = articleByTeamId.get(r.home_team_id) ?? undefined;
          const awayArticle = articleByTeamId.get(r.away_team_id) ?? undefined;
          await sendTipResultEmail({
            user,
            points,
            data: {
              match: {
                groupId: r.match_group_id,
                kickOff: typeof r.kick_off === 'string' ? r.kick_off : new Date(r.kick_off).toISOString(),
                homeGoals: r.home_goals,
                awayGoals: r.away_goals,
              },
              tip: {
                homeGoals: r.tip_home_goals,
                awayGoals: r.tip_away_goals,
              },
              homeTeam: { id: r.home_team_id, name: r.home_team_name, countryCode: r.home_country_code },
              awayTeam: { id: r.away_team_id, name: r.away_team_name, countryCode: r.away_country_code },
              homeArticle: homeArticle
                ? { headline: homeArticle.headline, lede: homeArticle.lede }
                : undefined,
              awayArticle: awayArticle
                ? { headline: awayArticle.headline, lede: awayArticle.lede }
                : undefined,
              standings: standingsByUserId.get(r.user_id),
            },
          });
          results.push({ ...base, outcome: 'sent' });
        } catch (err) {
          console.error('[tip-notifications] send failed for tip', r.tip_id, err);
          results.push({ ...base, outcome: 'failed', reason: String(err) });
        }
      }),
    );
    if (i + SEND_BATCH_SIZE < sendable.length) {
      await new Promise((resolve) => setTimeout(resolve, SEND_BATCH_DELAY_MS));
    }
  }
  // Per-recipient outcome in the log, so the reason (skipped toggle, Resend
  // rejection, …) is visible without waiting for the diagnostic e-mail.
  for (const r of results) {
    console.log(`[tip-notifications] tip ${r.tipId} ${r.userEmail} pts=${r.points} → ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`);
  }
  return results;
}

/**
 * Slow-lane dispatch: send tip-result e-mails for every scored tip on a match
 * that has not been notified yet (`points IS NOT NULL AND notified_at IS NULL`).
 * Called by the scraper drainer on EVERY pass — as soon as BOTH match teams'
 * articles are cached it sends (so the e-mail embeds them); until then it
 * defers (returns `deferred > 0`, leaving notified_at NULL to retry next pass),
 * UNLESS `force` is set (the final/give-up pass) so tipsters are notified even
 * if an article never generated. Idempotent: only 'sent'/'skipped' tips get
 * `notified_at` stamped, so it never re-sends.
 */
export async function dispatchTipResultEmailsForMatch(
  matchId: number,
  opts: { force?: boolean } = {},
): Promise<{ results: TipEmailDispatchResult[]; deferred: number }> {
  const hasKey = !!process.env.RESEND_API_KEY;

  const rows = await query<TransitionRow>(
    `SELECT
       t.id AS tip_id,
       t.user_id AS user_id,
       t.home_goals AS tip_home_goals,
       t.away_goals AS tip_away_goals,
       t.points AS new_points,
       u.email,
       u.name AS user_name,
       u.notify_exact_score,
       u.notify_winner_only,
       u.notify_wrong_tip,
       m.id AS match_id,
       m.group_id AS match_group_id,
       m.kick_off,
       m.home_goals,
       m.away_goals,
       ht.id AS home_team_id,
       ht.name AS home_team_name,
       ht.country_code AS home_country_code,
       at.id AS away_team_id,
       at.name AS away_team_name,
       at.country_code AS away_country_code
     FROM tip t
     JOIN tipster_user u ON u.id = t.user_id
     JOIN match m ON m.id = t.match_id
     JOIN team ht ON ht.id = m.home_team_id
     JOIN team at ON at.id = m.away_team_id
     WHERE t.match_id = $1 AND t.points IS NOT NULL AND t.notified_at IS NULL`,
    [matchId],
  );

  console.log(
    `[tip-notifications] dispatchForMatch match=${matchId} pending=${rows.length} resendKey=${hasKey ? 'set' : 'missing'}`,
  );
  if (rows.length === 0) return { results: [], deferred: 0 };

  // The e-mail embeds both match teams' articles. Until those exist, defer the
  // send (unless forced on the final pass) so tipsters get the article version
  // rather than a bare result. notified_at stays NULL, so a later pass retries.
  if (!opts.force && hasKey) {
    const [homeArticle, awayArticle] = await Promise.all([
      getCachedTeamArticle(rows[0].home_team_id, { ignorePending: true }),
      getCachedTeamArticle(rows[0].away_team_id, { ignorePending: true }),
    ]);
    if (!homeArticle || !awayArticle) {
      console.log(`[tip-notifications] match ${matchId}: ${rows.length} tip e-mail(s) deferred — match articles not ready yet`);
      return { results: [], deferred: rows.length };
    }
  }

  const results = await sendTipEmailsForRows(rows, hasKey);

  // Stamp notified_at for tips that were actually decided (sent or
  // preference-skipped). Leave 'failed'/'disabled' unstamped so a later run retries.
  const decidedTipIds = results
    .filter((r) => r.outcome === 'sent' || r.outcome === 'skipped')
    .map((r) => r.tipId);
  if (decidedTipIds.length > 0) {
    await query(
      `UPDATE tip SET notified_at = NOW() WHERE id = ANY($1::int[])`,
      [decidedTipIds],
    );
  }

  return { results, deferred: 0 };
}
