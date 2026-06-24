/**
 * LOCAL DEV ONLY. Puts the database into the state "all groups finished, right
 * before the first play-off match" so the play-off pick'em can be exercised:
 *   1. Enables the `playoff_pickem` feature flag.
 *   2. Marks every group-stage match FINISHED with a deterministic score
 *      (better FIFA rank wins 2-0; ties → home wins 1-0).
 *   3. Rebuilds the knockout bracket (R32 from final standings via Annex C).
 *
 * Tipping windows are schedule-based (top-4 lock 1h before the first KO match,
 * match tips 5 min before kick-off) — all in the future, so everything is open.
 *
 * Run: node --env-file=.env --import tsx scripts/simulate-playoff-ready.mjs
 */
import { query, queryOne, closeDb } from '../src/lib/db.ts';
import { recomputeKnockoutBracket } from '../src/engine/knockout-sync.ts';
import { recalculateAllPlayoffPoints } from '../src/lib/knockout-recalc.ts';
import { getPlayoffTeams, getKnockoutMatches } from '../src/lib/playoff-data.ts';
import { playoffPicksLockAtMs, isPlayoffPicksLocked, firstKnockoutKickOffMs } from '../src/lib/playoff-lock.ts';

// 1. Enable the feature flag.
await query("UPDATE feature_flag SET enabled = true, updated_at = NOW() WHERE key = 'playoff_pickem'");
console.log('✅ feature flag playoff_pickem = true');

// 2. Finish every group match with a deterministic score.
const matches = await query(
  `SELECT m.id, m.home_team_id, m.away_team_id,
          ht.fifa_ranking AS home_rank, at.fifa_ranking AS away_rank
   FROM match m
   JOIN team ht ON ht.id = m.home_team_id
   JOIN team at ON at.id = m.away_team_id`,
);
let finished = 0;
for (const m of matches) {
  // Lower FIFA ranking number = stronger. Missing rank = treat as weakest.
  const hr = m.home_rank ?? 9999;
  const ar = m.away_rank ?? 9999;
  let hg, ag;
  if (hr < ar) { hg = 2; ag = 0; }
  else if (ar < hr) { hg = 0; ag = 2; }
  else { hg = 1; ag = 0; } // tie on ranking → home edge
  await query(
    `UPDATE match SET home_goals = $1, away_goals = $2, status = 'FINISHED', last_scraped = NOW() WHERE id = $3`,
    [hg, ag, m.id],
  );
  finished++;
}
console.log(`✅ marked ${finished} group matches FINISHED`);

// 3. Rebuild bracket + rescore play-off predictions.
const written = await recomputeKnockoutBracket();
await recalculateAllPlayoffPoints();
console.log(`✅ knockout bracket rebuilt (${written} matches)`);

// Report state.
const teams = await getPlayoffTeams();
const kms = await getKnockoutMatches();
const r32 = kms.filter((m) => m.round === 'r32');
const r32Known = r32.filter((m) => m.participantsKnown).length;
const firstKo = firstKnockoutKickOffMs();
const lockAt = playoffPicksLockAtMs();
console.log('—');
console.log('play-off teams:', teams.length, '(expect 32)');
console.log('R32 with both participants:', r32Known, '/', r32.length, '(expect 16/16)');
console.log('sample R32:', r32.slice(0, 4).map((m) => `#${m.matchNumber} ${m.homeTeam?.shortName}–${m.awayTeam?.shortName}`).join(', '));
console.log('first KO kick-off:', firstKo ? new Date(firstKo).toISOString() : 'n/a');
console.log('top-4 picks lock at:', lockAt ? new Date(lockAt).toISOString() : 'n/a');
console.log('top-4 picks locked right now?', isPlayoffPicksLocked(), '(expect false)');

await closeDb();
console.log('\n🎉 Ready. Sign in via Dev login and open /pickem/playoff');
