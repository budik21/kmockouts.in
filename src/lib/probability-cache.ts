/**
 * Probability cache: read/write cached probabilities from PostgreSQL.
 * Probabilities are pre-calculated and stored so homepage/group pages
 * don't need to run expensive scenario enumeration at render time.
 */

import { query, getPool } from './db';
import { GroupId } from './types';
import { ALL_GROUPS } from './constants';
import { calculateGroupProbabilities, calculateAllProbabilities, calculateAffectedProbabilities, cacheProbabilities, cacheBestThirdProbabilities, cacheQualificationThreshold } from '../engine/probability';

export interface CachedTeamProb {
  teamId: number;
  groupId: string;
  probFirst: number;
  probSecond: number;
  probThird: number;
  probThirdQual: number;
  probOut: number;
  calculatedAt: string;
}

interface CacheRow {
  group_id: string;
  team_id: number;
  prob_first: number;
  prob_second: number;
  prob_third: number;
  prob_third_qual: number;
  prob_out: number;
  calculated_at: string;
}

function rowToProb(r: CacheRow): CachedTeamProb {
  return {
    teamId: r.team_id,
    groupId: r.group_id,
    probFirst: r.prob_first,
    probSecond: r.prob_second,
    probThird: r.prob_third,
    probThirdQual: r.prob_third_qual,
    probOut: r.prob_out,
    calculatedAt: r.calculated_at,
  };
}

/**
 * Get cached probabilities for a single group.
 * Returns a Map<teamId, CachedTeamProb> or null if no cache exists.
 */
export async function getCachedGroupProbs(groupId: GroupId): Promise<Map<number, CachedTeamProb> | null> {
  const rows = await query<CacheRow>(
    'SELECT * FROM probability_cache WHERE group_id = $1',
    [groupId]
  );

  if (rows.length === 0) return null;

  const map = new Map<number, CachedTeamProb>();
  for (const r of rows) {
    map.set(r.team_id, rowToProb(r));
  }
  return map;
}

/**
 * Get cached probabilities for ALL groups.
 * Returns Map<groupId, Map<teamId, CachedTeamProb>>.
 */
export async function getAllCachedProbs(): Promise<Map<string, Map<number, CachedTeamProb>>> {
  const rows = await query<CacheRow>('SELECT * FROM probability_cache');

  const result = new Map<string, Map<number, CachedTeamProb>>();

  for (const r of rows) {
    if (!result.has(r.group_id)) {
      result.set(r.group_id, new Map());
    }
    result.get(r.group_id)!.set(r.team_id, rowToProb(r));
  }
  return result;
}

/**
 * Get cached probabilities for ALL groups, computing any missing ones on-the-fly.
 * This ensures probabilities always display, even before the first explicit recalculation.
 */
export async function getAllCachedProbsOrCompute(): Promise<Map<string, Map<number, CachedTeamProb>>> {
  const cached = await getAllCachedProbs();

  // If we have all 12 groups cached, return directly
  if (cached.size >= ALL_GROUPS.length) return cached;

  // Compute missing groups
  for (const gid of ALL_GROUPS) {
    if (!cached.has(gid)) {
      const summaries = await calculateGroupProbabilities(gid as GroupId);
      await cacheProbabilities(gid as GroupId, summaries);
    }
  }

  // Re-read full cache
  return getAllCachedProbs();
}

/**
 * Recalculate and cache probabilities for all groups.
 * Uses full cross-group calculation (includes best-third Monte Carlo).
 * Called after match results change (scraper, scenario apply, etc.)
 */
export async function recalculateAllProbabilities(): Promise<void> {
  const { results, bestThird } = await calculateAllProbabilities();

  for (const groupId of ALL_GROUPS) {
    const summaries = results.get(groupId)!;
    await cacheProbabilities(groupId as GroupId, summaries);
  }

  // Cache per-group best-third probabilities for the best-third page
  await cacheBestThirdProbabilities(bestThird.groupProbabilities);

  // Cache qualification threshold (what stats are needed for 8th place)
  if (bestThird.qualificationThreshold) {
    await cacheQualificationThreshold(bestThird.qualificationThreshold);
  }
}

/**
 * Recalculate and cache for a single group.
 */
export async function recalculateGroupProbabilities(groupId: GroupId): Promise<void> {
  const summaries = await calculateGroupProbabilities(groupId);
  await cacheProbabilities(groupId, summaries);
}

/**
 * Update only the prob_third_qual column for teams in groups other than `changedGroupId`,
 * using freshly-computed per-team best-third probabilities. Used as a cheap follow-up
 * after a single-group scenario recalc — the other groups' within-group probabilities
 * don't change, but cross-group best-third qualification probability does.
 */
async function updateProbThirdQualForUnchangedGroups(
  changedGroupId: GroupId,
  teamProbabilities: Map<number, number>,
): Promise<void> {
  if (teamProbabilities.size === 0) return;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [teamId, prob] of teamProbabilities) {
      await client.query(
        `UPDATE probability_cache
         SET prob_third_qual = $1, calculated_at = TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         WHERE team_id = $2 AND group_id <> $3`,
        [prob, teamId, changedGroupId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Recalculate probabilities after a single match result change:
 *  - Re-enumerate scenarios for the affected group only (writes full cache for it).
 *  - Run cross-group best-third Monte Carlo with fresh data from all groups.
 *  - Patch prob_third_qual for the other 11 groups (their within-group probs are unchanged).
 *  - Refresh best-third cache and qualification threshold.
 * Much cheaper than recalculateAllProbabilities when only one group is affected.
 */
export async function recalculateAffectedProbabilities(changedGroupId: GroupId): Promise<void> {
  const { changedGroupSummaries, bestThird } = await calculateAffectedProbabilities(changedGroupId);

  await cacheProbabilities(changedGroupId, changedGroupSummaries);
  await updateProbThirdQualForUnchangedGroups(changedGroupId, bestThird.teamProbabilities);
  await cacheBestThirdProbabilities(bestThird.groupProbabilities);
  if (bestThird.qualificationThreshold) {
    await cacheQualificationThreshold(bestThird.qualificationThreshold);
  }
}

/**
 * Load every group's teams + matches and shape them into the input shape
 * `buildBestThirdSnapshot` expects. Used both by the per-group pregenerate
 * cascade and by the cross-group regen helper after a group transitions to
 * fully-decided state.
 */
async function loadAllGroupsForSnapshot(): Promise<import('../engine/best-third-snapshot').GroupSnapshotInput[]> {
  const result: import('../engine/best-third-snapshot').GroupSnapshotInput[] = [];
  for (const gid of ALL_GROUPS) {
    const teamRows = await query<{
      id: number; name: string; short_name: string; country_code: string; group_id: string;
      is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null;
    }>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]);
    const matchRows = await query<{
      id: number; group_id: string; round: number;
      home_team_id: number; away_team_id: number;
      home_goals: number | null; away_goals: number | null;
      home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
      away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
      venue: string; kick_off: string; status: string;
    }>('SELECT * FROM match WHERE group_id = $1', [gid]);
    const teams = teamRows.map(r => ({
      id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
      groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
      externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
    }));
    const allMatches = matchRows.map(r => ({
      id: r.id, groupId: r.group_id as GroupId, round: r.round,
      homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
      homeGoals: r.home_goals, awayGoals: r.away_goals,
      homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
      awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
      venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
    }));
    const played = allMatches.filter(m => m.status === 'FINISHED');
    result.push({
      groupId: gid,
      teams,
      playedMatches: played,
      totalMatches: allMatches.length,
    });
  }
  return result;
}

/**
 * Pre-generate AI scenario summaries for every team in a group at every
 * position their position probability is > 0 and < 100. Populates the
 * `ai_summary_cache` table so subsequent team-detail page renders hit the
 * cache instead of triggering a fresh Claude API call (which can take 15s
 * and, on timeout, would leave nothing cached — causing every visitor to
 * pay the latency). Called from the admin match-update endpoint after
 * probability recalc completes.
 */
export interface PregenerateOptions {
  /** Restrict regeneration to a single team within the group. */
  teamId?: number;
  /** Skip cache lookup and regenerate every position regardless. */
  force?: boolean;
  /** Bypass env kill-switch + DB feature flag (superadmin path). */
  ignoreFlags?: boolean;
  /** Usage accumulator filled during generation. */
  usage?: import('../engine/scenario-summary-ai').AiUsageStats;
  /** Diagnostic trace — when provided, every AI call writes its inputs/outputs here. */
  trace?: import('./match-update-trace').MatchUpdateTrace;
  /**
   * Fast-lane flag: generate ONLY the per-position scenario summaries and stop
   * before the (slow, rate-limit-heavy) group + team article cascade. The admin
   * match-update request sets this so the save stays fast and reliable; the
   * standalone scraper later calls this function WITHOUT the flag, at which
   * point the scenario summaries are already cached (cache hits, no API calls)
   * and only the articles are generated — paced, off the request budget.
   */
  skipArticles?: boolean;
}

/**
 * A team currently sitting 3rd whose group is still early — fewer than 2 of
 * its own matches played — has the most volatile best-third fate and the most
 * expendable article in the post-save AI fan-out. Defer its team article until
 * it has 2 matches behind it. This trims the burst of Claude calls triggered
 * by a single result on a cold cache, which would otherwise exceed the
 * Anthropic per-minute output-token limit and time out.
 */
function shouldDeferThirdPlaceTeamArticle(
  position: number | undefined,
  playedCount: number,
): boolean {
  return position === 3 && playedCount < 2;
}

export async function pregenerateTeamScenarioSummaries(
  groupId: GroupId,
  options: PregenerateOptions = {},
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  if (!options.ignoreFlags) {
    const { isFeatureEnabled, isAiGenerationEnabledByEnv } = await import('./feature-flags');
    if (!isAiGenerationEnabledByEnv()) {
      console.log(`[pregenerate] Skipping scenario AI (AI_PREDICTIONS_ENABLED env off) for group ${groupId}`);
      return;
    }
    if (!(await isFeatureEnabled('ai_predictions', true))) {
      console.log(`[pregenerate] Skipping scenario AI (ai_predictions flag off) for group ${groupId}`);
      return;
    }
  }

  // Lazy imports to avoid circular dependencies and to keep this helper
  // out of the hot render path when it's not used.
  const { calculateStandings } = await import('../engine/standings');
  const { enumerateGroupScenarios } = await import('../engine/scenarios');
  const { generateAiScenarioSummaries } = await import('../engine/scenario-summary-ai');
  const { explainTiebreakers } = await import('../engine/tiebreaker-explain');
  const { buildBestThirdSnapshot } = await import('../engine/best-third-snapshot');

  const teamRows = await query<{
    id: number; name: string; short_name: string; country_code: string; group_id: string;
    is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null;
  }>('SELECT * FROM team WHERE group_id = $1 ORDER BY id', [groupId]);

  const matchRows = await query<{
    id: number; group_id: string; round: number;
    home_team_id: number; away_team_id: number;
    home_goals: number | null; away_goals: number | null;
    home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
    away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
    venue: string; kick_off: string; status: string;
  }>('SELECT * FROM match WHERE group_id = $1 ORDER BY round, kick_off', [groupId]);

  const teams = teamRows.map(r => ({
    id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
    groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
    externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
  }));
  const allMatches = matchRows.map(r => ({
    id: r.id, groupId: r.group_id as GroupId, round: r.round,
    homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
    homeGoals: r.home_goals, awayGoals: r.away_goals,
    homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
    awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
    venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
  }));

  const played = allMatches.filter(m => m.status === 'FINISHED');
  const remaining = allMatches.filter(m => m.status !== 'FINISHED');

  // AI summaries are only rendered once every team has played at least once.
  const allTeamsPlayed = teams.every(t => played.some(m => m.homeTeamId === t.id || m.awayTeamId === t.id));
  if (!allTeamsPlayed) {
    return;
  }
  // remaining.length === 0 ⇒ group is fully decided. Skip granular
  // per-position scenario AI (no scenarios to predict — every team is at
  // 100% / 0% on its final position) but still cascade into the group +
  // team articles so the on-site commentary updates from "X must beat Y"
  // to a past-tense wrap-up instead of disappearing.
  const isWrapUp = remaining.length === 0;

  const standings = calculateStandings({ teams, matches: played });
  const currentStandings = standings.map(s => ({
    teamName: s.team.name,
    points: s.points,
    gd: s.goalsFor - s.goalsAgainst,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    position: s.position,
  }));

  // Tiebreaker explanations — only meaningful once every match in the group
  // is finished (i.e. the order between equal-points teams is final). For
  // in-progress groups the natural sort (pts → GD → goals) plus the
  // per-position scenarios already explains everything; injecting partial
  // tiebreaker reasoning would mislead the article.
  const tiebreakerNotes = isWrapUp
    ? explainTiebreakers(standings, played)
    : [];

  // Cross-group best-third snapshot — built from EVERY group's current
  // standings, not just this one. Fed into both the group + team article
  // prompts so the AI can describe a 3rd-placed team's best-third chances
  // in concrete snapshot terms rather than treating a 100% probability as
  // a guaranteed outcome before the table is locked. Errors during the
  // collection step are swallowed so the article generation still proceeds.
  let bestThirdSnapshotForPrompt: import('../engine/group-article-ai').BestThirdSnapshotForPrompt | undefined;
  try {
    const groupSnapshots = await loadAllGroupsForSnapshot();
    const snapshot = buildBestThirdSnapshot(groupSnapshots);
    bestThirdSnapshotForPrompt = {
      isFinal: snapshot.isFinal,
      groupsFullyPlayed: snapshot.groupsFullyPlayed,
      rows: snapshot.rows.map(r => ({
        rank: r.rank,
        groupId: r.groupId,
        teamName: r.teamName,
        points: r.points,
        gd: r.goalDifference,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        groupFullyPlayed: r.groupFullyPlayed,
        snapshotStatus: r.snapshotStatus,
      })),
    };
  } catch (err) {
    console.error(`[pregenerate] Best-third snapshot collection failed for group ${groupId}:`, err);
    options.trace?.errors.push({
      step: `best-third-snapshot:${groupId}`,
      message: String(err),
    });
  }

  const summaries = enumerateGroupScenarios(teams, played, remaining);
  const remainingMatchesInfo = remaining.map((m, i) => ({
    matchIndex: i,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
    awayTeamName: teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
  }));

  const targetTeams = options.teamId
    ? teams.filter(t => t.id === options.teamId)
    : teams;

  console.log(`[pregenerate] Generating scenario AI summaries for group ${groupId} (${targetTeams.length} team${targetTeams.length === 1 ? '' : 's'})${options.force ? ' [FORCE]' : ''}`);

  // Fire all teams in parallel. Each call internally fans out across
  // positions (also in parallel), but every actual Claude API request is
  // gated by the process-wide semaphore in lib/claude-concurrency.ts, so
  // the real concurrency stays bounded regardless of how many teams or
  // groups are in flight at once.
  //
  // Capture the fresh in-memory results here. The article cascade below must
  // use these directly rather than re-reading `ai_summary_cache`, because the
  // cache can hold STALE entries from a previous group state: when a team
  // moves to 0% or 100% at a position, `generateAiScenarioSummaries` returns
  // a hardcoded "Guaranteed" (or skips the position) without overwriting the
  // old row, so a query of the table mixes fresh patterns with leftover ones
  // that contradict the new probabilities. Feeding those leftovers to the
  // article AI under "use these as the source of truth" produces articles
  // that talk about matches the team has already played.
  const freshGranularByTeam = new Map<number, { [pos: number]: string }>();
  if (!isWrapUp) {
    await Promise.allSettled(
      targetTeams.map(async team => {
        const teamSummary = summaries.find(s => s.teamId === team.id);
        if (!teamSummary) return;
        try {
          const result = await generateAiScenarioSummaries({
            teamId: team.id,
            teamName: team.name,
            groupId: groupId,
            outcomePatternsByPosition: teamSummary.outcomePatternsByPosition,
            probabilities: teamSummary.positionProbabilities,
            remainingMatches: remainingMatchesInfo,
            currentStandings,
          }, {
            force: options.force,
            ignoreFlags: options.ignoreFlags,
            usage: options.usage,
          });
          freshGranularByTeam.set(team.id, result);

          // Detect positions that SHOULD have produced an AI summary but didn't
          // (timed out / rate-limited inside generateAiScenarioSummaries, where
          // the failure is swallowed). Surface to the trace so the slow-lane
          // drainer re-queues the job and retries just the missing ones.
          const missingPositions = [1, 2, 3, 4].filter(p => {
            const prob = teamSummary.positionProbabilities[p] ?? 0;
            if (prob <= 0 || prob >= 100) return false;
            if ((teamSummary.outcomePatternsByPosition[p] ?? []).length === 0) return false;
            return !result[p];
          });
          if (missingPositions.length > 0) {
            options.trace?.errors.push({
              step: `scenario-summaries-incomplete:${team.name}`,
              message: `${missingPositions.length} position(s) failed to generate: ${missingPositions.join(', ')}`,
            });
          }

          // Capture the granular scenario summaries into the diagnostic trace
          // so the admin e-mail shows what each team was told for each position.
          if (options.trace) {
            for (const [posStr, html] of Object.entries(result)) {
              const pos = Number(posStr);
              options.trace.scenarioSummaries.push({
                teamId: team.id,
                teamName: team.name,
                position: pos,
                probability: teamSummary.positionProbabilities[pos] ?? 0,
                output: html,
                // 100% positions return a hardcoded "Guaranteed." without an API call.
                cacheHit: (teamSummary.positionProbabilities[pos] ?? 0) === 100,
              });
            }
          }
        } catch (err) {
          console.error(`[pregenerate] Team scenario AI failed for ${team.name}:`, err);
          options.trace?.errors.push({
            step: `scenario-summaries:${team.name}`,
            message: String(err),
          });
        }
      }),
    );

    console.log(`[pregenerate] Team scenario AI summaries done for group ${groupId}`);
  } else {
    console.log(`[pregenerate] Group ${groupId} fully decided — skipping per-position scenario AI, jumping to wrap-up articles`);
  }

  // Fast lane stops here: scenario summaries are now generated + cached. The
  // group + team articles (slow, rate-limit-heavy) are left to the scraper's
  // slow-lane drainer, which calls this function again without skipArticles —
  // the scenarios above are cache hits by then, so only the articles run.
  if (options.skipArticles) {
    console.log(`[pregenerate] skipArticles — scenario summaries done for group ${groupId}, deferring articles to slow lane`);
    return;
  }

  // Cascade: synthesize the in-memory per-team summaries into:
  //   1. A whole-group article (skipped on partial single-team regen).
  //   2. Per-team articles, one per team, written from that team's POV.
  // Both consume `freshGranularByTeam` — never read `ai_summary_cache` here
  // (see comment above on why that table can hold stale rows).
  try {
    // Played matches with actual scorelines — fed into both article prompts
    // so the model never has to guess past results from goal difference.
    const playedMatchesForArticles = played.map(m => ({
      homeTeam: teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
      awayTeam: teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
      homeGoals: m.homeGoals ?? 0,
      awayGoals: m.awayGoals ?? 0,
    }));

    // 1. Group article — only on whole-group regen.
    if (!options.teamId) {
      try {
        const { pregenerateGroupArticle } = await import('../engine/group-article-ai');

        const articleTeams = teams.map(t => {
          const teamSummary = summaries.find(s => s.teamId === t.id);
          return {
            teamName: t.name,
            probabilities: teamSummary?.positionProbabilities ?? { 1: 0, 2: 0, 3: 0, 4: 0 },
            granularSummariesByPosition: freshGranularByTeam.get(t.id) ?? {},
          };
        });

        await pregenerateGroupArticle(
          {
            groupId,
            currentStandings,
            playedMatches: playedMatchesForArticles,
            remainingMatches: remaining.map(m => ({
              homeTeam: teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
              awayTeam: teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
            })),
            teams: articleTeams,
            tiebreakerNotes,
            bestThirdSnapshot: bestThirdSnapshotForPrompt,
          },
          {
            force: options.force,
            ignoreFlags: options.ignoreFlags,
            // AiUsageStats and the article usage type are structurally identical,
            // so the granular accumulator doubles as the article one — admin
            // dashboard ends up reporting combined token spend + call count.
            usage: options.usage,
            trace: options.trace,
          },
        );

        console.log(`[pregenerate] Group article done for ${groupId}`);
      } catch (err) {
        console.error(`[pregenerate] Group article generation failed for ${groupId}:`, err);
      }
    }

    // 2. Per-team articles. Generated for either the single targeted team or
    // every team in the group. Best-third qualification probability comes
    // from probability_cache, which the caller has already refreshed.
    try {
      const { pregenerateTeamArticle } = await import('../engine/team-article-ai');

      const probRows = await query<{ team_id: number; prob_third_qual: number }>(
        'SELECT team_id, prob_third_qual FROM probability_cache WHERE group_id = $1',
        [groupId],
      );
      const bestThirdProbByTeam = new Map<number, number>();
      for (const r of probRows) {
        bestThirdProbByTeam.set(r.team_id, r.prob_third_qual);
      }

      const allTeamArticleTargets = options.teamId
        ? teams.filter(t => t.id === options.teamId)
        : teams;

      // Skip the article for any team that is currently 3rd but has played
      // fewer than 2 of its matches — see shouldDeferThirdPlaceTeamArticle.
      const teamArticleTargets = allTeamArticleTargets.filter(t => {
        const position = currentStandings.find(s => s.teamName === t.name)?.position;
        const playedCount = played.filter(m => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
        if (shouldDeferThirdPlaceTeamArticle(position, playedCount)) {
          console.log(`[pregenerate] Deferring team article for ${t.name} (group ${groupId}) — currently 3rd with ${playedCount}/2 matches played`);
          return false;
        }
        return true;
      });

      const remainingForCtx = (teamId: number) => remaining.map(m => ({
        homeTeam: teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
        awayTeam: teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
        isTeamMatch: m.homeTeamId === teamId || m.awayTeamId === teamId,
      }));

      await Promise.allSettled(
        teamArticleTargets.map(t => {
          const teamSummary = summaries.find(s => s.teamId === t.id);
          return pregenerateTeamArticle(
            {
              groupId,
              teamId: t.id,
              teamName: t.name,
              currentStandings,
              playedMatches: playedMatchesForArticles.map((pm, i) => ({
                ...pm,
                isTeamMatch: played[i].homeTeamId === t.id || played[i].awayTeamId === t.id,
              })),
              remainingMatches: remainingForCtx(t.id),
              probabilities: teamSummary?.positionProbabilities ?? { 1: 0, 2: 0, 3: 0, 4: 0 },
              bestThirdQualProb: bestThirdProbByTeam.get(t.id) ?? 0,
              granularSummariesByPosition: freshGranularByTeam.get(t.id) ?? {},
              tiebreakerNotes,
              bestThirdSnapshot: bestThirdSnapshotForPrompt,
            },
            {
              force: options.force,
              ignoreFlags: options.ignoreFlags,
              usage: options.usage,
              trace: options.trace,
            },
          ).catch(err => {
            console.error(`[pregenerate] Team article failed for ${t.name}:`, err);
            options.trace?.errors.push({
              step: `team-article-cascade:${t.name}`,
              message: String(err),
            });
            return null;
          });
        }),
      );

      console.log(`[pregenerate] Team articles done for group ${groupId} (${teamArticleTargets.length} team${teamArticleTargets.length === 1 ? '' : 's'})`);
    } catch (err) {
      console.error(`[pregenerate] Team article generation failed for ${groupId}:`, err);
    }
  } catch (err) {
    console.error(`[pregenerate] Article cascade failed for ${groupId}:`, err);
  }
}

/**
 * Internal: regenerate the group article AND the 3rd-placed team article for
 * EVERY OTHER group (relative to `changedGroupId`), against a freshly built
 * cross-group best-third snapshot.
 *
 * Two callers fan into this:
 *   1. `pregenerateAfterGroupClosure` — fires after a group transitions to
 *      fully-decided; processes EVERY other group (decided + in-progress)
 *      because the snapshot's `isFinal` flag has changed for everyone.
 *      Opts: `decidedOnly: false`.
 *   2. `pregenerateThirdPlacedInOtherDecidedGroups` — fires after any other
 *      match-result save that did NOT close a group; processes ONLY OTHER
 *      groups that are already fully-decided, because only those groups'
 *      3rd-place team's `bestThirdSnapshot` can have shifted underneath
 *      them (in-progress groups will refresh on their own next save).
 *      Opts: `decidedOnly: true`.
 *
 * Per-position scenario summaries are NOT regenerated here — they are
 * independent of best-third snapshot and would just duplicate cache writes.
 * The 3rd-placed team article reads its scenario summaries from cache (or
 * falls back to "(none — already decided)" for wrap-up groups).
 *
 * Returns the list of 3rd-placed teams that had their article regenerated,
 * so the caller can surface them in the diagnostic e-mail.
 */
async function regenerateOtherGroupArticlesAgainstSnapshot(
  changedGroupId: GroupId,
  opts: PregenerateOptions & {
    /** True ⇒ skip OTHER groups that still have remaining matches. */
    decidedOnly: boolean;
    /** Used as the prefix for trace error step labels. */
    traceLabelPrefix: string;
  },
): Promise<{ regeneratedThirdPlacedTeams: Array<{ groupId: string; teamId: number; teamName: string }> }> {
  if (!process.env.ANTHROPIC_API_KEY) return { regeneratedThirdPlacedTeams: [] };

  if (!opts.ignoreFlags) {
    const { isFeatureEnabled, isAiGenerationEnabledByEnv } = await import('./feature-flags');
    if (!isAiGenerationEnabledByEnv()) {
      console.log(`[pregenerate] Skipping ${opts.traceLabelPrefix} regen (AI_PREDICTIONS_ENABLED env off) for changed group ${changedGroupId}`);
      return { regeneratedThirdPlacedTeams: [] };
    }
    if (!(await isFeatureEnabled('ai_predictions', true))) {
      console.log(`[pregenerate] Skipping ${opts.traceLabelPrefix} regen (ai_predictions flag off) for changed group ${changedGroupId}`);
      return { regeneratedThirdPlacedTeams: [] };
    }
  }

  const { calculateStandings } = await import('../engine/standings');
  const { explainTiebreakers } = await import('../engine/tiebreaker-explain');
  const { buildBestThirdSnapshot } = await import('../engine/best-third-snapshot');
  const { enumerateGroupScenarios } = await import('../engine/scenarios');
  const { getCachedAiScenarioSummaries } = await import('../engine/scenario-summary-ai');
  const { pregenerateGroupArticle } = await import('../engine/group-article-ai');
  const { pregenerateTeamArticle } = await import('../engine/team-article-ai');

  console.log(`[pregenerate] ${opts.traceLabelPrefix} regen kicked off — changed group: ${changedGroupId}, decidedOnly: ${opts.decidedOnly}`);

  // Build the cross-group best-third snapshot once from current DB state.
  const allGroups = await loadAllGroupsForSnapshot();
  const snapshot = buildBestThirdSnapshot(allGroups);
  const snapshotForPrompt: import('../engine/group-article-ai').BestThirdSnapshotForPrompt = {
    isFinal: snapshot.isFinal,
    groupsFullyPlayed: snapshot.groupsFullyPlayed,
    rows: snapshot.rows.map(r => ({
      rank: r.rank,
      groupId: r.groupId,
      teamName: r.teamName,
      points: r.points,
      gd: r.goalDifference,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      groupFullyPlayed: r.groupFullyPlayed,
      snapshotStatus: r.snapshotStatus,
    })),
  };

  // Per-team best-third qualification probabilities across every group —
  // already refreshed by `recalculateAffectedProbabilities` in the parent
  // cascade. Load all rows once and index by team.
  const probRows = await query<{
    team_id: number; group_id: string; prob_first: number; prob_second: number;
    prob_third: number; prob_out: number; prob_third_qual: number;
  }>('SELECT team_id, group_id, prob_first, prob_second, prob_third, prob_out, prob_third_qual FROM probability_cache');
  const probsByTeam = new Map<number, { p1: number; p2: number; p3: number; p4: number; thirdQual: number }>();
  for (const r of probRows) {
    probsByTeam.set(r.team_id, {
      p1: r.prob_first,
      p2: r.prob_second,
      p3: r.prob_third,
      p4: r.prob_out,
      thirdQual: r.prob_third_qual,
    });
  }

  // Need full match lists per group (played + remaining + match details) to
  // build the article contexts. Load them all in one pass.
  const matchRowsAll = await query<{
    id: number; group_id: string; round: number;
    home_team_id: number; away_team_id: number;
    home_goals: number | null; away_goals: number | null;
    home_yc: number; home_yc2: number; home_rc_direct: number; home_yc_rc: number;
    away_yc: number; away_yc2: number; away_rc_direct: number; away_yc_rc: number;
    venue: string; kick_off: string; status: string;
  }>('SELECT * FROM match');
  const matchesByGroup = new Map<string, typeof matchRowsAll>();
  for (const r of matchRowsAll) {
    const arr = matchesByGroup.get(r.group_id) ?? [];
    arr.push(r);
    matchesByGroup.set(r.group_id, arr);
  }

  const targetGroups = allGroups.filter(g => {
    if (g.groupId === changedGroupId) return false;
    if (opts.decidedOnly) {
      // Only fully-decided OTHER groups. A group is "decided" when every
      // scheduled match has a FINISHED status (i.e. there are no remaining
      // matches left to play).
      return g.totalMatches > 0 && g.playedMatches.length === g.totalMatches;
    }
    return true;
  });

  // Collected as each per-group regen succeeds — surfaced in the trace so
  // the diagnostic e-mail can show which 3rd-placed teams from OTHER
  // groups had their article rewritten because of this save.
  const regeneratedThirdPlacedTeams: Array<{ groupId: string; teamId: number; teamName: string }> = [];

  // Fan out group + 3rd-place-team article regen across the target groups.
  // Promise.allSettled so a single failed regen does not block the others.
  await Promise.allSettled(targetGroups.map(async g => {
    try {
      const gAllMatchRows = matchesByGroup.get(g.groupId) ?? [];
      const gAllMatches = gAllMatchRows.map(r => ({
        id: r.id, groupId: r.group_id as GroupId, round: r.round,
        homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
        homeGoals: r.home_goals, awayGoals: r.away_goals,
        homeYc: r.home_yc, homeYc2: r.home_yc2, homeRcDirect: r.home_rc_direct, homeYcRc: r.home_yc_rc,
        awayYc: r.away_yc, awayYc2: r.away_yc2, awayRcDirect: r.away_rc_direct, awayYcRc: r.away_yc_rc,
        venue: r.venue, kickOff: r.kick_off, status: r.status as 'FINISHED' | 'LIVE' | 'SCHEDULED',
      }));
      const played = gAllMatches.filter(m => m.status === 'FINISHED');
      const remaining = gAllMatches.filter(m => m.status !== 'FINISHED');

      const standings = calculateStandings({ teams: g.teams, matches: played });
      const currentStandings = standings.map(s => ({
        teamName: s.team.name,
        points: s.points,
        gd: s.goalsFor - s.goalsAgainst,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        position: s.position,
      }));
      const isWrapUp = remaining.length === 0;
      const tiebreakerNotes = isWrapUp ? explainTiebreakers(standings, played) : [];

      const playedMatchesForArticles = played.map(m => ({
        homeTeam: g.teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
        awayTeam: g.teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
        homeGoals: m.homeGoals ?? 0,
        awayGoals: m.awayGoals ?? 0,
      }));
      const remainingForGroup = remaining.map(m => ({
        homeTeam: g.teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
        awayTeam: g.teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
      }));

      // Per-team scenario summaries — read from cache for in-progress groups,
      // empty for fully-decided groups (the article generator handles that).
      const groupScenarios = enumerateGroupScenarios(g.teams, played, remaining);
      const remainingMatchesInfo = remaining.map((m, i) => ({
        matchIndex: i,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeTeamName: g.teams.find(t => t.id === m.homeTeamId)?.name ?? '?',
        awayTeamName: g.teams.find(t => t.id === m.awayTeamId)?.name ?? '?',
      }));

      const granularByTeam = new Map<number, { [pos: number]: string }>();
      if (!isWrapUp) {
        await Promise.allSettled(g.teams.map(async t => {
          const ts = groupScenarios.find(s => s.teamId === t.id);
          if (!ts) return;
          try {
            const cached = await getCachedAiScenarioSummaries({
              teamId: t.id,
              teamName: t.name,
              groupId: g.groupId,
              outcomePatternsByPosition: ts.outcomePatternsByPosition,
              probabilities: ts.positionProbabilities,
              remainingMatches: remainingMatchesInfo,
              currentStandings,
            });
            granularByTeam.set(t.id, cached);
          } catch {
            granularByTeam.set(t.id, {});
          }
        }));
      }

      const articleTeams = g.teams.map(t => {
        const ts = groupScenarios.find(s => s.teamId === t.id);
        return {
          teamName: t.name,
          probabilities: ts?.positionProbabilities ?? { 1: 0, 2: 0, 3: 0, 4: 0 },
          granularSummariesByPosition: granularByTeam.get(t.id) ?? {},
        };
      });

      // (1) Force-regen the group article against the fresh snapshot.
      await pregenerateGroupArticle(
        {
          groupId: g.groupId,
          currentStandings,
          playedMatches: playedMatchesForArticles,
          remainingMatches: remainingForGroup,
          teams: articleTeams,
          tiebreakerNotes,
          bestThirdSnapshot: snapshotForPrompt,
        },
        {
          force: true,
          ignoreFlags: opts.ignoreFlags,
          usage: opts.usage,
          trace: opts.trace,
        },
      ).catch(err => {
        console.error(`[pregenerate] ${opts.traceLabelPrefix} regen — group article failed for ${g.groupId}:`, err);
        opts.trace?.errors.push({
          step: `${opts.traceLabelPrefix}-group-article:${g.groupId}`,
          message: String(err),
        });
      });

      // (2) Force-regen the current 3rd-place team's article. Their best-
      // third standing is what shifts most when another group closes — and
      // for already-decided OTHER groups it is the ONLY thing that can shift.
      const third = standings.find(s => s.position === 3);
      const thirdPlayedCount = third
        ? played.filter(m => m.homeTeamId === third.team.id || m.awayTeamId === third.team.id).length
        : 0;
      if (third && shouldDeferThirdPlaceTeamArticle(3, thirdPlayedCount)) {
        console.log(`[pregenerate] ${opts.traceLabelPrefix} regen — deferring 3rd-place team article for ${third.team.name} (group ${g.groupId}): only ${thirdPlayedCount}/2 matches played`);
      } else if (third) {
        const t = third.team;
        const ts = groupScenarios.find(s => s.teamId === t.id);
        const teamProb = probsByTeam.get(t.id);
        await pregenerateTeamArticle(
          {
            groupId: g.groupId,
            teamId: t.id,
            teamName: t.name,
            currentStandings,
            playedMatches: playedMatchesForArticles.map((pm, i) => ({
              ...pm,
              isTeamMatch: played[i].homeTeamId === t.id || played[i].awayTeamId === t.id,
            })),
            remainingMatches: remaining.map(m => ({
              homeTeam: g.teams.find(team => team.id === m.homeTeamId)?.name ?? '?',
              awayTeam: g.teams.find(team => team.id === m.awayTeamId)?.name ?? '?',
              isTeamMatch: m.homeTeamId === t.id || m.awayTeamId === t.id,
            })),
            probabilities: ts?.positionProbabilities ?? { 1: 0, 2: 0, 3: 0, 4: 0 },
            bestThirdQualProb: teamProb?.thirdQual ?? 0,
            granularSummariesByPosition: granularByTeam.get(t.id) ?? {},
            tiebreakerNotes,
            bestThirdSnapshot: snapshotForPrompt,
          },
          {
            force: true,
            ignoreFlags: opts.ignoreFlags,
            usage: opts.usage,
            trace: opts.trace,
          },
        ).catch(err => {
          console.error(`[pregenerate] ${opts.traceLabelPrefix} regen — team article failed for ${t.name}:`, err);
          opts.trace?.errors.push({
            step: `${opts.traceLabelPrefix}-team-article:${t.name}`,
            message: String(err),
          });
        });
        regeneratedThirdPlacedTeams.push({
          groupId: g.groupId,
          teamId: t.id,
          teamName: t.name,
        });
      }
    } catch (err) {
      console.error(`[pregenerate] ${opts.traceLabelPrefix} regen failed for group ${g.groupId}:`, err);
      opts.trace?.errors.push({
        step: `${opts.traceLabelPrefix}-group:${g.groupId}`,
        message: String(err),
      });
    }
  }));

  console.log(`[pregenerate] ${opts.traceLabelPrefix} regen done (changed: ${changedGroupId}; regenerated ${regeneratedThirdPlacedTeams.length} 3rd-placed teams)`);
  return { regeneratedThirdPlacedTeams };
}

/**
 * Cross-group regeneration triggered when a group transitions to fully-decided
 * (every match in that group is FINISHED for the first time). Force-regenerates
 * the group article AND the current 3rd-placed team's article for EVERY OTHER
 * group — both decided and in-progress — because the snapshot's `isFinal` flag
 * has just changed for everyone.
 *
 * The affected group itself is intentionally skipped: the normal cascade
 * inside `pregenerateTeamScenarioSummaries` already regenerated its articles
 * against the same fresh snapshot (the read inside this helper is from the
 * same DB state).
 *
 * Cost: 11 group articles + up to 11 team articles = ≤22 AI calls (gated by
 * the 6-slot Claude semaphore). Triggered at most 12 times per tournament.
 */
export async function pregenerateAfterGroupClosure(
  closedGroupId: GroupId,
  options: PregenerateOptions = {},
): Promise<void> {
  const { regeneratedThirdPlacedTeams } = await regenerateOtherGroupArticlesAgainstSnapshot(
    closedGroupId,
    { ...options, decidedOnly: false, traceLabelPrefix: 'after-closure' },
  );
  // Surface in the diagnostic e-mail. Mode is `closure-covered` because in
  // the closure path the closure regen pass IS the cross-group 3rd-place
  // refresh; there is no separate snapshot-shift run for this save.
  if (options.trace) {
    options.trace.crossGroupThirdPlaceRegen = {
      mode: 'closure-covered',
      regeneratedTeams: regeneratedThirdPlacedTeams,
    };
  }
}

/**
 * Cross-group regeneration triggered after a match-result save that did NOT
 * close a group. Every result can shift the cross-group best-third ranking,
 * which is the cross-group input into the article prompt for any group's
 * 3rd-placed team. For OTHER groups that are already fully-decided, the
 * 3rd-placed team is fixed but its `bestThirdSnapshot` context has just
 * shifted underneath it — without a force-regen the team page would show a
 * stale article describing the old ranking.
 *
 * In-progress OTHER groups are intentionally NOT refreshed here: their
 * 3rd-placed team is still a moving target, and their article will be
 * regenerated naturally on the next match-result save inside that group.
 *
 * Worst case (every other group decided ⇒ 11 decided OTHER groups): 11
 * group articles + 11 team articles = 22 AI calls, gated by the 6-slot
 * Claude semaphore. This is bounded by the caller's separate AI-phase
 * time budget.
 */
export async function pregenerateThirdPlacedInOtherDecidedGroups(
  changedGroupId: GroupId,
  options: PregenerateOptions = {},
): Promise<void> {
  const { regeneratedThirdPlacedTeams } = await regenerateOtherGroupArticlesAgainstSnapshot(
    changedGroupId,
    { ...options, decidedOnly: true, traceLabelPrefix: 'snapshot-shift' },
  );
  if (options.trace) {
    options.trace.crossGroupThirdPlaceRegen = {
      mode: regeneratedThirdPlacedTeams.length > 0 ? 'snapshot-shift' : 'no-decided-others',
      regeneratedTeams: regeneratedThirdPlacedTeams,
    };
  }
}

/**
 * Pre-generate AI summaries for all best-third teams.
 * Called after probability recalculation so summaries are ready
 * when users visit the page (instead of generating on first load).
 */
export async function pregenerateBestThirdSummaries(): Promise<void> {
  const { isFeatureEnabled, isAiGenerationEnabledByEnv } = await import('./feature-flags');
  if (!isAiGenerationEnabledByEnv()) {
    console.log('[pregenerate] Skipping best-third AI (AI_PREDICTIONS_ENABLED env off)');
    return;
  }
  if (!(await isFeatureEnabled('ai_predictions', true))) {
    console.log('[pregenerate] Skipping best-third AI (ai_predictions flag off)');
    return;
  }

  // Lazy imports to avoid circular dependencies
  const { calculateStandings } = await import('../engine/standings');
  const { compareThirdPlaced } = await import('../engine/best-third');
  const { generateBestThirdSummaries } = await import('../engine/best-third-summary-ai');
  type BestThirdTeamContext = import('../engine/best-third-summary-ai').BestThirdTeamContext;
  const { getCachedQualificationThreshold } = await import('../engine/probability');

  // Check preconditions: all 12 groups must have results, all teams ≥2 matches
  let allTeamsPlayedTwo = true;
  let hasRemainingMatches = false;
  let groupsWithMatches = 0;

  interface ThirdEntry { groupId: string; teamId: number; teamName: string; points: number; goalDifference: number; goalsFor: number; standing: ReturnType<typeof calculateStandings>[number]; remainingOpponent: string | null; }
  const thirdPlaced: ThirdEntry[] = [];

  for (const gid of ALL_GROUPS) {
    const teamRows = await query<{ id: number; name: string; short_name: string; country_code: string; group_id: string; is_placeholder: boolean; external_id: string | null; fifa_ranking: number | null }>(
      'SELECT * FROM team WHERE group_id = $1 ORDER BY id', [gid]
    );
    const finishedRows = await query<{ id: number; group_id: string; round: number; home_team_id: number; away_team_id: number; home_goals: number | null; away_goals: number | null; status: string }>(
      "SELECT id, group_id, round, home_team_id, away_team_id, home_goals, away_goals, status FROM match WHERE group_id = $1 AND status = 'FINISHED' ORDER BY round", [gid]
    );
    const allMatchRows = await query<{ id: number; status: string; home_team_id: number; away_team_id: number }>(
      'SELECT id, status, home_team_id, away_team_id FROM match WHERE group_id = $1', [gid]
    );

    if (finishedRows.length > 0) groupsWithMatches++;
    if (allMatchRows.length > finishedRows.length) hasRemainingMatches = true;

    const teams = teamRows.map(r => ({
      id: r.id, name: r.name, shortName: r.short_name, countryCode: r.country_code,
      groupId: r.group_id as GroupId, isPlaceholder: r.is_placeholder,
      externalId: r.external_id ?? undefined, fifaRanking: r.fifa_ranking ?? undefined,
    }));
    const matches = finishedRows.map(r => ({
      id: r.id, groupId: r.group_id as GroupId, round: r.round,
      homeTeamId: r.home_team_id, awayTeamId: r.away_team_id,
      homeGoals: r.home_goals, awayGoals: r.away_goals,
      homeYc: 0, homeYc2: 0, homeRcDirect: 0, homeYcRc: 0,
      awayYc: 0, awayYc2: 0, awayRcDirect: 0, awayYcRc: 0,
      venue: '', kickOff: '', status: r.status as 'FINISHED',
    }));

    if (allTeamsPlayedTwo) {
      for (const t of teams) {
        const cnt = matches.filter(m => m.homeTeamId === t.id || m.awayTeamId === t.id).length;
        if (cnt < 2) { allTeamsPlayedTwo = false; break; }
      }
    }

    const standings = calculateStandings({ teams, matches });
    const third = standings.find(s => s.position === 3);
    if (third) {
      // Find remaining match opponent
      const remaining = allMatchRows.find(m => m.status !== 'FINISHED' && (m.home_team_id === third.team.id || m.away_team_id === third.team.id));
      let remainingOpponent: string | null = null;
      if (remaining) {
        const oppId = remaining.home_team_id === third.team.id ? remaining.away_team_id : remaining.home_team_id;
        const opp = teams.find(t => t.id === oppId);
        remainingOpponent = opp?.name ?? null;
      }
      thirdPlaced.push({
        groupId: gid, teamId: third.team.id, teamName: third.team.name,
        points: third.points, goalDifference: third.goalDifference, goalsFor: third.goalsFor,
        standing: third, remainingOpponent,
      });
    }
  }

  if (groupsWithMatches < 12 || !allTeamsPlayedTwo || !hasRemainingMatches) {
    console.log('[pregenerate] Skipping AI summaries — preconditions not met');
    return;
  }

  // Sort by FIFA criteria
  thirdPlaced.sort((a, b) => compareThirdPlaced(a.standing, b.standing));

  // Load per-team probabilities and threshold
  const [allTeamProbs, qualificationThreshold] = await Promise.all([
    getAllCachedProbs(),
    getCachedQualificationThreshold(),
  ]);

  const aiTeams: BestThirdTeamContext[] = thirdPlaced.map((tp, i) => {
    const groupCache = allTeamProbs.get(tp.groupId);
    let qualProb = 0;
    if (groupCache) {
      const teamProb = groupCache.get(tp.teamId);
      if (teamProb && teamProb.probThirdQual > 0) qualProb = teamProb.probThirdQual;
    }
    return {
      teamName: tp.teamName,
      teamId: tp.teamId,
      groupId: tp.groupId,
      currentRank: i + 1,
      points: tp.points,
      goalDifference: tp.goalDifference,
      goalsFor: tp.goalsFor,
      qualProbability: qualProb,
      remainingMatch: tp.remainingOpponent ? { opponent: tp.remainingOpponent } : null,
    };
  });

  console.log(`[pregenerate] Generating AI summaries for ${aiTeams.length} best-third teams...`);
  await generateBestThirdSummaries(aiTeams, qualificationThreshold);
  console.log('[pregenerate] AI summaries done');
}
