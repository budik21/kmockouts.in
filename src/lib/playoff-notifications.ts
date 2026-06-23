import { Resend } from 'resend';
import { query } from './db';
import { buildPlayoffResultEmail } from './email-templates/playoff-result';
import { ROUND_LABELS, KnockoutRoundName } from './knockout-bracket';

interface KoTipRow {
  tip_id: number;
  email: string;
  user_name: string;
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
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

/** A user keeps play-off result e-mails as long as they haven't muted all tip notifications. */
function wantsEmail(r: KoTipRow): boolean {
  return r.notify_exact_score || r.notify_winner_only || r.notify_wrong_tip;
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
       u.notify_exact_score, u.notify_winner_only, u.notify_wrong_tip,
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
