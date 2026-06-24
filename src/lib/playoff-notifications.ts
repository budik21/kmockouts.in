import { Resend } from 'resend';
import { query } from './db';
import { buildPlayoffResultEmail } from './email-templates/playoff-result';
import { buildPlayoffAdminRecapEmail, type PlayoffAdminRecap } from './email-templates/playoff-admin-recap';
import { buildTop4ResultEmail, type Top4PickLine } from './email-templates/playoff-top4-result';
import { SUPERADMIN_EMAIL } from './superadmin';
import { ROUND_LABELS, KnockoutRoundName } from './knockout-bracket';
import {
  PLAYOFF_PICK_SLOTS,
  PLAYOFF_PICK_POINTS,
  PLAYOFF_PICK_ALL_EXACT_BONUS,
  PLAYOFF_PICK_LABELS,
  type PlayoffPickSlot,
} from './playoff-scoring';

interface KoTipRow {
  tip_id: number;
  email: string;
  user_name: string;
  notify_playoff: boolean;
  tip_home: number;
  tip_away: number;
  tip_advance_id: number;
  tip_advance_name: string;
  points: number;
  round: string;
  home_name: string; home_cc: string;
  away_name: string; away_cc: string;
  home_goals: number | null; away_goals: number | null;
  home_goals_et: number | null; away_goals_et: number | null;
  home_pens: number | null; away_pens: number | null;
  advancing_id: number | null;
  advancing_name: string | null;
}

const SEND_BATCH_SIZE = 5;
const SEND_BATCH_DELAY_MS = 2000;

/** Play-off result e-mails have their own opt-out toggle. */
function wantsEmail(r: KoTipRow): boolean {
  return r.notify_playoff;
}

function extraLine(r: KoTipRow): string | null {
  const bits: string[] = [];
  if (r.home_goals_et != null && r.away_goals_et != null) bits.push(`AET ${r.home_goals_et}–${r.away_goals_et}`);
  if (r.home_pens != null && r.away_pens != null) bits.push(`pens ${r.home_pens}–${r.away_pens}`);
  return bits.length ? bits.join(', ') : null;
}

export interface PlayoffEmailResult {
  tipId: number;
  email: string;
  outcome: 'sent' | 'skipped' | 'disabled' | 'failed';
  reason?: string;
}

/**
 * Send the result e-mail for every scored, not-yet-notified knockout tip on a
 * match. Idempotent via knockout_tip.notified_at. Best-effort: a single bad
 * recipient never aborts the rest. Synchronous-friendly (no AI-article
 * dependency), so the admin result flow can await it directly.
 */
export async function dispatchKnockoutResultEmails(matchNumber: number): Promise<PlayoffEmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY;
  const hasKey = !!apiKey;

  const rows = await query<KoTipRow>(
    `SELECT
       kt.id AS tip_id, u.email, u.name AS user_name,
       u.notify_playoff,
       kt.home_goals AS tip_home, kt.away_goals AS tip_away,
       kt.advance_team_id AS tip_advance_id, ta.name AS tip_advance_name,
       kt.points,
       km.round,
       ht.name AS home_name, ht.country_code AS home_cc,
       at.name AS away_name, at.country_code AS away_cc,
       km.home_goals, km.away_goals, km.home_goals_et, km.away_goals_et, km.home_pens, km.away_pens,
       km.advancing_team_id AS advancing_id, adv.name AS advancing_name
     FROM knockout_tip kt
     JOIN knockout_match km ON km.match_number = kt.match_number
     JOIN tipster_user u ON u.id = kt.user_id
     JOIN team ht ON ht.id = km.home_team_id
     JOIN team at ON at.id = km.away_team_id
     JOIN team ta ON ta.id = kt.advance_team_id
     LEFT JOIN team adv ON adv.id = km.advancing_team_id
     WHERE kt.match_number = $1 AND kt.points IS NOT NULL AND kt.notified_at IS NULL`,
    [matchNumber],
  );

  console.log(`[playoff-notifications] match=${matchNumber} pending=${rows.length} resendKey=${hasKey ? 'set' : 'missing'}`);
  if (rows.length === 0) return [];

  const results: PlayoffEmailResult[] = [];
  const sendable: KoTipRow[] = [];
  for (const r of rows) {
    if (!hasKey) { results.push({ tipId: r.tip_id, email: r.email, outcome: 'disabled', reason: 'RESEND_API_KEY missing' }); continue; }
    if (!wantsEmail(r)) { results.push({ tipId: r.tip_id, email: r.email, outcome: 'skipped', reason: 'notifications off' }); continue; }
    sendable.push(r);
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
  const resend = hasKey ? new Resend(apiKey) : null;

  for (let i = 0; i < sendable.length; i += SEND_BATCH_SIZE) {
    const batch = sendable.slice(i, i + SEND_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (r) => {
        try {
          const exactHit = r.home_goals != null && r.away_goals != null && r.tip_home === r.home_goals && r.tip_away === r.away_goals;
          const advanceHit = r.advancing_id != null && r.tip_advance_id === r.advancing_id;
          const { subject, html } = buildPlayoffResultEmail({
            userName: r.user_name || 'there',
            roundLabel: ROUND_LABELS[r.round as KnockoutRoundName] ?? r.round,
            homeTeam: { name: r.home_name, countryCode: r.home_cc },
            awayTeam: { name: r.away_name, countryCode: r.away_cc },
            homeGoals: r.home_goals ?? 0,
            awayGoals: r.away_goals ?? 0,
            extraLine: extraLine(r),
            advancingName: r.advancing_name ?? '—',
            tip: { homeGoals: r.tip_home, awayGoals: r.tip_away, advanceName: r.tip_advance_name },
            points: r.points,
            exactHit,
            advanceHit,
          });
          const { data, error } = await resend!.emails.send({ from, to: r.email, subject, html });
          if (error) throw new Error(error.message ?? JSON.stringify(error));
          if (!data?.id) throw new Error('Resend returned no message id');
          results.push({ tipId: r.tip_id, email: r.email, outcome: 'sent' });
        } catch (err) {
          console.error('[playoff-notifications] send failed for tip', r.tip_id, err);
          results.push({ tipId: r.tip_id, email: r.email, outcome: 'failed', reason: String(err) });
        }
      }),
    );
    if (i + SEND_BATCH_SIZE < sendable.length) {
      await new Promise((res) => setTimeout(res, SEND_BATCH_DELAY_MS));
    }
  }

  // Stamp only sent/skipped so failures retry on the next save.
  const decided = results.filter((r) => r.outcome === 'sent' || r.outcome === 'skipped').map((r) => r.tipId);
  if (decided.length > 0) {
    await query('UPDATE knockout_tip SET notified_at = NOW() WHERE id = ANY($1::int[])', [decided]);
  }
  for (const r of results) {
    console.log(`[playoff-notifications] tip ${r.tipId} ${r.email} → ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`);
  }
  return results;
}

const ADMIN_SEND_TIMEOUT_MS = 15_000;

/**
 * Diagnostic recap e-mail to the superadmin after a play-off result is entered
 * — mirrors the group-stage `sendAdminMatchSummary`. Always swallows its own
 * errors so a failed diagnostic never rolls back user-visible state.
 */
export async function sendPlayoffAdminRecap(recap: PlayoffAdminRecap): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[playoff-recap] RESEND_API_KEY missing — skipping admin recap e-mail');
    return;
  }
  try {
    const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
    const { subject, html } = buildPlayoffAdminRecapEmail(recap);
    const resend = new Resend(apiKey);
    await Promise.race([
      resend.emails.send({ from, to: SUPERADMIN_EMAIL, subject, html }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Resend send timed out after ${ADMIN_SEND_TIMEOUT_MS}ms`)), ADMIN_SEND_TIMEOUT_MS),
      ),
    ]);
    console.log(`[playoff-recap] Sent admin recap to ${SUPERADMIN_EMAIL}`);
  } catch (err) {
    console.error('[playoff-recap] Failed to send admin recap:', err);
  }
}

interface KmRow {
  match_number: number; status: string;
  home_team_id: number | null; away_team_id: number | null; advancing_team_id: number | null;
}
interface Top4PickRow {
  user_id: number; email: string; user_name: string; notify_playoff: boolean;
  slot: string; team_id: number; team_name: string; points: number | null;
}

/**
 * Post-final TOP-4 recap e-mail: once BOTH the third-place match (103) and the
 * final (104) are finished, every user who made top-4 picks gets one recap of
 * how their four placings landed. Idempotent via playoff_pick.notified_at, so
 * it's sent exactly once per user; independent of the per-match result e-mails.
 */
export async function dispatchTop4ResultEmails(): Promise<PlayoffEmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY;
  const hasKey = !!apiKey;

  const kmRows = await query<KmRow>(
    `SELECT match_number, status, home_team_id, away_team_id, advancing_team_id
     FROM knockout_match WHERE match_number IN (103, 104)`,
  );
  const byNum = new Map(kmRows.map((r) => [r.match_number, r]));
  const decided = (m?: KmRow) =>
    !!m && m.status === 'FINISHED' && m.advancing_team_id != null && m.home_team_id != null && m.away_team_id != null;
  const final = byNum.get(104);
  const third = byNum.get(103);
  if (!decided(final) || !decided(third)) return []; // top-4 not fully decided yet

  const championId = final!.advancing_team_id!;
  const runnerUpId = final!.home_team_id === championId ? final!.away_team_id! : final!.home_team_id!;
  const thirdId = third!.advancing_team_id!;
  const fourthId = third!.home_team_id === thirdId ? third!.away_team_id! : third!.home_team_id!;
  const placement: Record<PlayoffPickSlot, number> = { champion: championId, runner_up: runnerUpId, third: thirdId, fourth: fourthId };
  const top4 = new Set([championId, runnerUpId, thirdId, fourthId]);

  const nameRows = await query<{ id: number; name: string }>(
    `SELECT id, name FROM team WHERE id = ANY($1::int[])`,
    [[championId, runnerUpId, thirdId, fourthId]],
  );
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const actual = {
    champion: nameById.get(championId) ?? '—',
    runnerUp: nameById.get(runnerUpId) ?? '—',
    third: nameById.get(thirdId) ?? '—',
    fourth: nameById.get(fourthId) ?? '—',
  };

  const rows = await query<Top4PickRow>(
    `SELECT pp.user_id, u.email, u.name AS user_name, u.notify_playoff,
            pp.slot, pp.team_id, t.name AS team_name, pp.points
     FROM playoff_pick pp
     JOIN tipster_user u ON u.id = pp.user_id
     JOIN team t ON t.id = pp.team_id
     WHERE pp.notified_at IS NULL`,
  );

  // Group rows by user; only act on users whose full set of 4 picks is scored.
  const byUser = new Map<number, Top4PickRow[]>();
  for (const r of rows) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r);
    byUser.set(r.user_id, arr);
  }

  const champBonusThreshold = PLAYOFF_PICK_POINTS.champion + PLAYOFF_PICK_ALL_EXACT_BONUS;
  const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
  const resend = hasKey ? new Resend(apiKey) : null;
  const results: PlayoffEmailResult[] = [];

  // Build the per-user payloads first (only complete, scored pick sets).
  const ready: Array<{ userId: number; email: string; userName: string; notify: boolean;
    picks: Top4PickLine[]; total: number; hasBonus: boolean }> = [];
  for (const [userId, userPicks] of byUser) {
    const bySlot = new Map(userPicks.map((p) => [p.slot, p]));
    if (!PLAYOFF_PICK_SLOTS.every((s) => bySlot.get(s) && bySlot.get(s)!.points != null)) continue;
    const champStored = bySlot.get('champion')!.points ?? 0;
    const hasBonus = champStored >= champBonusThreshold;
    const picks: Top4PickLine[] = PLAYOFF_PICK_SLOTS.map((slot) => {
      const p = bySlot.get(slot)!;
      const status = p.team_id === placement[slot] ? 'exact' : top4.has(p.team_id) ? 'in-top4' : 'missed';
      const display = slot === 'champion' && (p.points ?? 0) >= champBonusThreshold
        ? PLAYOFF_PICK_POINTS.champion : (p.points ?? 0);
      return { slot, slotLabel: PLAYOFF_PICK_LABELS[slot], pickedTeam: p.team_name, points: display, status };
    });
    const total = userPicks.reduce((s, p) => s + (p.points ?? 0), 0);
    const first = userPicks[0];
    ready.push({ userId, email: first.email, userName: first.user_name, notify: first.notify_playoff, picks, total, hasBonus });
  }

  console.log(`[playoff-top4] candidates=${ready.length} resendKey=${hasKey ? 'set' : 'missing'}`);

  const sendable: typeof ready = [];
  for (const u of ready) {
    if (!hasKey) { results.push({ tipId: u.userId, email: u.email, outcome: 'disabled', reason: 'RESEND_API_KEY missing' }); continue; }
    if (!u.notify) { results.push({ tipId: u.userId, email: u.email, outcome: 'skipped', reason: 'notifications off' }); continue; }
    sendable.push(u);
  }

  for (let i = 0; i < sendable.length; i += SEND_BATCH_SIZE) {
    const batch = sendable.slice(i, i + SEND_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (u) => {
        try {
          const { subject, html } = buildTop4ResultEmail({
            userName: u.userName || 'there', picks: u.picks, actual, totalPoints: u.total, hasBonus: u.hasBonus,
          });
          const { data, error } = await resend!.emails.send({ from, to: u.email, subject, html });
          if (error) throw new Error(error.message ?? JSON.stringify(error));
          if (!data?.id) throw new Error('Resend returned no message id');
          results.push({ tipId: u.userId, email: u.email, outcome: 'sent' });
        } catch (err) {
          console.error('[playoff-top4] send failed for user', u.userId, err);
          results.push({ tipId: u.userId, email: u.email, outcome: 'failed', reason: String(err) });
        }
      }),
    );
    if (i + SEND_BATCH_SIZE < sendable.length) {
      await new Promise((res) => setTimeout(res, SEND_BATCH_DELAY_MS));
    }
  }

  // Stamp sent/skipped users' pick rows so the recap goes out exactly once.
  const decidedUserIds = results.filter((r) => r.outcome === 'sent' || r.outcome === 'skipped').map((r) => r.tipId);
  if (decidedUserIds.length > 0) {
    await query('UPDATE playoff_pick SET notified_at = NOW() WHERE user_id = ANY($1::int[])', [decidedUserIds]);
  }
  for (const r of results) {
    console.log(`[playoff-top4] user ${r.tipId} ${r.email} → ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`);
  }
  return results;
}
