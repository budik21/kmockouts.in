import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recomputeKnockoutBracket } from '@/engine/knockout-sync';
import { recalculateAllPlayoffPoints } from '@/lib/knockout-recalc';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { dispatchKnockoutResultEmails, dispatchTop4ResultEmails, sendPlayoffAdminRecap, type PlayoffEmailResult } from '@/lib/playoff-notifications';
import { computeAdvancing } from '@/lib/playoff-scoring';
import { ROUND_LABELS, type KnockoutRoundName } from '@/lib/knockout-bracket';
import { expireTags } from '@/lib/cache-expire';
import { LEADERBOARD_TAG, WC_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { SITE_URL } from '@/lib/seo';

interface UpdateBody {
  matchNumber: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeGoalsEt: number | null;
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
  status: string; // SCHEDULED | FINISHED
}

const MAX_GOALS = 19;
const MAX_PENS = 30;

function isValidGoal(v: unknown, max: number): v is number | null {
  return v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max);
}

/**
 * Enter (or clear) a knockout match result: 90' score, extra-time score and
 * penalty shoot-out. On save we derive the advancing team, propagate it into
 * the later rounds (recomputeKnockoutBracket) and rescore every play-off tip
 * and top-4 pick. NO AI runs in this flow. Tipsters who tipped the match get a
 * result e-mail (gated by their notify_playoff toggle); the superadmin gets a
 * diagnostic recap of everything that happened.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  if (!(await isFeatureEnabled('playoff_pickem', false))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body: UpdateBody = await request.json();
    const { matchNumber, homeGoals, awayGoals, homeGoalsEt, awayGoalsEt, homePens, awayPens, status } = body;

    if (!Number.isInteger(matchNumber) || matchNumber < 73 || matchNumber > 104) {
      return NextResponse.json({ error: 'Invalid match number' }, { status: 400 });
    }
    if (!['SCHEDULED', 'FINISHED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (!isValidGoal(homeGoals, MAX_GOALS) || !isValidGoal(awayGoals, MAX_GOALS) ||
        !isValidGoal(homeGoalsEt, MAX_GOALS) || !isValidGoal(awayGoalsEt, MAX_GOALS) ||
        !isValidGoal(homePens, MAX_PENS) || !isValidGoal(awayPens, MAX_PENS)) {
      return NextResponse.json({ error: 'Invalid score value' }, { status: 400 });
    }

    // Extra time is cumulative (it includes the 90' goals), so neither side's
    // ET total can be lower than its 90' score.
    if ((homeGoalsEt != null && homeGoals != null && homeGoalsEt < homeGoals) ||
        (awayGoalsEt != null && awayGoals != null && awayGoalsEt < awayGoals)) {
      return NextResponse.json(
        { error: 'Extra-time score cannot be lower than the 90′ score' },
        { status: 400 },
      );
    }

    const km = await queryOne<{
      home_team_id: number | null; away_team_id: number | null;
      round: string; home_name: string | null; away_name: string | null;
    }>(
      `SELECT km.home_team_id, km.away_team_id, km.round,
              ht.name AS home_name, at.name AS away_name
       FROM knockout_match km
       LEFT JOIN team ht ON ht.id = km.home_team_id
       LEFT JOIN team at ON at.id = km.away_team_id
       WHERE km.match_number = $1`,
      [matchNumber],
    );
    if (!km) {
      return NextResponse.json({ error: 'Knockout match not found — run bracket sync first' }, { status: 404 });
    }

    // When marking FINISHED, make sure the result actually decides a winner.
    if (status === 'FINISHED') {
      if (km.home_team_id == null || km.away_team_id == null) {
        return NextResponse.json({ error: 'Both participants must be known before a result can be saved' }, { status: 400 });
      }
      const advancing = computeAdvancing({
        homeTeamId: km.home_team_id, awayTeamId: km.away_team_id,
        homeGoals, awayGoals, homeGoalsEt, awayGoalsEt, homePens, awayPens,
      });
      if (advancing == null) {
        return NextResponse.json(
          { error: 'Result is level — enter extra time and/or a penalty shoot-out to decide who advances' },
          { status: 400 },
        );
      }
    }

    const startedAt = Date.now();
    const errors: string[] = [];

    await query(
      `UPDATE knockout_match
       SET home_goals = $1, away_goals = $2, home_goals_et = $3, away_goals_et = $4,
           home_pens = $5, away_pens = $6, status = $7, updated_at = NOW()
       WHERE match_number = $8`,
      [homeGoals, awayGoals, homeGoalsEt, awayGoalsEt, homePens, awayPens, status, matchNumber],
    );

    // Propagate participants/advancing into later rounds, then rescore. No AI.
    await recomputeKnockoutBracket();
    const recalc = await recalculateAllPlayoffPoints();

    let leagueRefreshed = true;
    try {
      await recalculateLeagueStandings(); // leagues fold in play-off points
    } catch (err) {
      leagueRefreshed = false;
      errors.push(`league-standings: ${String(err)}`);
    }

    // E-mail tipsters whose tip for THIS match was just scored (idempotent via
    // knockout_tip.notified_at, gated by each user's notify_playoff toggle, and
    // only ever sent to users who actually tipped this match).
    let emailResults: PlayoffEmailResult[] = [];
    if (status === 'FINISHED') {
      try {
        emailResults = await dispatchKnockoutResultEmails(matchNumber);
      } catch (err) {
        errors.push(`emails: ${String(err)}`);
      }
    }

    // Once both the third-place match (103) and the final (104) are in, the
    // top-4 is fully decided — send each picker their post-final TOP-4 recap
    // (idempotent; separate from the per-match result e-mail above).
    let top4Emailed = 0;
    if (status === 'FINISHED' && (matchNumber === 103 || matchNumber === 104)) {
      try {
        const t4 = await dispatchTop4ResultEmails();
        top4Emailed = t4.filter((r) => r.outcome === 'sent').length;
      } catch (err) {
        errors.push(`top4-emails: ${String(err)}`);
      }
    }

    expireTags(LEADERBOARD_TAG, WC_TAG);
    let cloudflarePurged = true;
    let cloudflareError: string | undefined;
    try {
      await purgeCloudflareCache([
        `${SITE_URL}/`,
        `${SITE_URL}/pickem/playoff`,
        `${SITE_URL}/pickem/leaderboard`,
        `${SITE_URL}/worldcup2026/knockout-bracket`,
      ]);
    } catch (err) {
      cloudflarePurged = false;
      cloudflareError = String(err);
      errors.push(`cloudflare: ${String(err)}`);
    }

    // Advancing team name after propagation, for the recap.
    const advRow = await queryOne<{ name: string | null }>(
      `SELECT t.name FROM knockout_match km LEFT JOIN team t ON t.id = km.advancing_team_id WHERE km.match_number = $1`,
      [matchNumber],
    ).catch(() => null);

    const ninety = homeGoals != null && awayGoals != null ? `${homeGoals}–${awayGoals}` : null;
    const extraBits: string[] = [];
    if (homeGoalsEt != null && awayGoalsEt != null) extraBits.push(`AET ${homeGoalsEt}–${awayGoalsEt}`);
    if (homePens != null && awayPens != null) extraBits.push(`pens ${homePens}–${awayPens}`);

    const count = (o: PlayoffEmailResult['outcome']) => emailResults.filter((r) => r.outcome === o).length;
    const sent = count('sent');

    // Diagnostic recap to the superadmin (same pattern as group-stage matches).
    await sendPlayoffAdminRecap({
      matchNumber,
      roundLabel: ROUND_LABELS[km.round as KnockoutRoundName] ?? km.round,
      homeTeam: km.home_name ?? 'TBD',
      awayTeam: km.away_name ?? 'TBD',
      status,
      cleared: status === 'SCHEDULED' && ninety == null,
      ninety,
      extra: extraBits.length ? extraBits.join(' · ') : null,
      advancing: advRow?.name ?? null,
      recalc,
      leagueStandingsRefreshed: leagueRefreshed,
      emails: {
        total: emailResults.length,
        sent,
        skipped: count('skipped'),
        disabled: count('disabled'),
        failed: count('failed'),
        recipients: emailResults.map((r) => ({ email: r.email, outcome: r.outcome, reason: r.reason })),
      },
      top4Emails: top4Emailed,
      cache: { tags: [LEADERBOARD_TAG, WC_TAG], cloudflarePurged, cloudflareError },
      errors,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ success: true, recalc, emailed: sent });
  } catch (error) {
    console.error('POST /api/admin/knockout/update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
