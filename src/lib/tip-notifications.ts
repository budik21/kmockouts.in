import { Resend } from 'resend';
import { buildTipResultEmail, type TipResultEmailData } from './email-templates/tip-result';
import { query } from './db';
import type { TipTransition } from './tip-recalc';
import { getCachedTeamArticle } from '@/engine/team-article-ai';

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

  await resend.emails.send({
    from,
    to: payload.user.email,
    subject,
    html,
  });

  return 'sent';
}

interface TransitionRow {
  tip_id: number;
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

/**
 * Shared send loop: takes joined tip+user+match+team rows and sends one
 * tip-result e-mail per row, respecting the per-user opt-in. Returns a
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

  const results: TipEmailDispatchResult[] = [];
  await Promise.allSettled(
    rows.map(async (r) => {
      const base = {
        tipId: r.tip_id,
        userName: r.user_name,
        userEmail: r.email,
        points: r.new_points,
      };
      if (r.new_points !== 0 && r.new_points !== 1 && r.new_points !== 4) {
        results.push({ ...base, outcome: 'skipped', reason: `points=${r.new_points} not a scorable result` });
        return;
      }
      const points = r.new_points as 0 | 1 | 4;
      const user = {
        email: r.email,
        name: r.user_name,
        notify_exact_score: r.notify_exact_score,
        notify_winner_only: r.notify_winner_only,
        notify_wrong_tip: r.notify_wrong_tip,
      };
      if (!hasKey) {
        results.push({ ...base, outcome: 'disabled', reason: 'RESEND_API_KEY missing' });
        return;
      }
      if (!shouldSend(user, points)) {
        results.push({ ...base, outcome: 'skipped', reason: skipReason(points) });
        return;
      }
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
          },
        });
        results.push({ ...base, outcome: 'sent' });
      } catch (err) {
        console.error('[tip-notifications] send failed for tip', r.tip_id, err);
        results.push({ ...base, outcome: 'failed', reason: String(err) });
      }
    }),
  );
  return results;
}

/**
 * Slow-lane dispatch: send tip-result e-mails for every scored tip on a match
 * that has not been notified yet (`points IS NOT NULL AND notified_at IS NULL`).
 * Called by the scraper drainer AFTER the match's articles are regenerated, so
 * the e-mails embed fresh articles. Idempotent: tips that were actually decided
 * (sent or skipped by preference) get `notified_at` stamped, so a job retry
 * never re-sends. 'failed'/'disabled' tips are left unstamped to retry later.
 */
export async function dispatchTipResultEmailsForMatch(matchId: number): Promise<TipEmailDispatchResult[]> {
  const hasKey = !!process.env.RESEND_API_KEY;

  const rows = await query<TransitionRow>(
    `SELECT
       t.id AS tip_id,
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
  if (rows.length === 0) return [];

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

  return results;
}
