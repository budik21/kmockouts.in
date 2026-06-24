import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { query, queryOne } from '@/lib/db';
import { recomputeKnockoutBracket } from '@/engine/knockout-sync';
import { recalculateAllPlayoffPoints } from '@/lib/knockout-recalc';
import { recalculateLeagueStandings } from '@/lib/league-standings';
import { dispatchKnockoutResultEmails } from '@/lib/playoff-notifications';
import { computeAdvancing } from '@/lib/playoff-scoring';
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
 * and top-4 pick.
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

    const km = await queryOne<{ home_team_id: number | null; away_team_id: number | null }>(
      'SELECT home_team_id, away_team_id FROM knockout_match WHERE match_number = $1',
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

    await query(
      `UPDATE knockout_match
       SET home_goals = $1, away_goals = $2, home_goals_et = $3, away_goals_et = $4,
           home_pens = $5, away_pens = $6, status = $7, updated_at = NOW()
       WHERE match_number = $8`,
      [homeGoals, awayGoals, homeGoalsEt, awayGoalsEt, homePens, awayPens, status, matchNumber],
    );

    // Propagate participants/advancing into later rounds, then rescore.
    await recomputeKnockoutBracket();
    const recalc = await recalculateAllPlayoffPoints();
    await recalculateLeagueStandings(); // leagues now fold in play-off points

    // E-mail tipsters whose tip for THIS match was just scored (idempotent via
    // knockout_tip.notified_at). Only when the match is finished/decided.
    let emailed = 0;
    if (status === 'FINISHED') {
      try {
        const sent = await dispatchKnockoutResultEmails(matchNumber);
        emailed = sent.filter((r) => r.outcome === 'sent').length;
      } catch (err) {
        console.error('[admin] Play-off result e-mails failed:', err);
      }
    }

    expireTags(LEADERBOARD_TAG, WC_TAG);
    try {
      await purgeCloudflareCache([
        `${SITE_URL}/`,
        `${SITE_URL}/pickem/playoff`,
        `${SITE_URL}/pickem/leaderboard`,
        `${SITE_URL}/worldcup2026/knockout-bracket`,
      ]);
    } catch (err) {
      console.error('[admin] Cloudflare purge failed:', err);
    }

    return NextResponse.json({ success: true, recalc, emailed });
  } catch (error) {
    console.error('POST /api/admin/knockout/update error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
