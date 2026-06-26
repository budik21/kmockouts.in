/**
 * LOCAL DEV ONLY. Sets the play-off up so the FIRST round (Round of 32) is
 * already played with RANDOM results, and the SECOND round (Round of 16) is
 * open for manual result entry via the admin UI.
 *
 *   1. Enables the `playoff_pickem` feature flag.
 *   2. Clears any previously entered knockout results (back to SCHEDULED).
 *   3. Rebuilds the bracket so R32 participants are resolved from the final
 *      group standings (Annex C).
 *   4. Writes a random, decisive result for every R32 match (73–88): a clear
 *      90' winner most of the time, otherwise a goalless extra time + a penalty
 *      shoot-out, so a winner is always determined.
 *   5. Propagates the R32 winners into the R16 fixtures and rescbores tips.
 *
 * After this, open /admin (Play-off tab) to enter R16 results, and watch them
 * appear on /worldcup2026/knockout-bracket.
 *
 * Run: node --env-file=.env --import tsx scripts/simulate-r32-played.mjs
 */
import { query, closeDb } from '../src/lib/db.ts';
import { recomputeKnockoutBracket } from '../src/engine/knockout-sync.ts';
import { recalculateAllPlayoffPoints } from '../src/lib/knockout-recalc.ts';
import { getKnockoutMatches } from '../src/lib/playoff-data.ts';

function rand(n) {
  return Math.floor(Math.random() * n);
}

/** A random, always-decisive knockout result. */
function randomResult() {
  const a = rand(4); // 0..3
  const b = rand(4);
  if (a !== b) {
    // Decided in regulation.
    return { homeGoals: a, awayGoals: b, homeGoalsEt: null, awayGoalsEt: null, homePens: null, awayPens: null };
  }
  // Level after 90' → goalless extra time → penalty shoot-out.
  let ph = 3 + rand(3); // 3..5
  let pa = 3 + rand(3);
  if (ph === pa) pa = ph === 5 ? ph - 1 : ph + 1; // never level on pens
  return { homeGoals: a, awayGoals: b, homeGoalsEt: a, awayGoalsEt: b, homePens: ph, awayPens: pa };
}

// 1. Feature flag on.
await query("UPDATE feature_flag SET enabled = true, updated_at = NOW() WHERE key = 'playoff_pickem'");
console.log('✅ feature flag playoff_pickem = true');

// 2. Clear any previously entered knockout results.
await query(
  `UPDATE knockout_match
   SET home_goals = NULL, away_goals = NULL, home_goals_et = NULL, away_goals_et = NULL,
       home_pens = NULL, away_pens = NULL, status = 'SCHEDULED', updated_at = NOW()`,
);
await query('UPDATE knockout_tip SET points = NULL, notified_at = NULL');
await query('UPDATE playoff_pick SET points = NULL, notified_at = NULL');
console.log('✅ cleared previous knockout results + tip/pick scores');

// 3. Rebuild the bracket (R32 from standings; later rounds empty until played).
await recomputeKnockoutBracket();

// 4. Random decisive result for every R32 match.
const r32 = (await getKnockoutMatches()).filter((m) => m.round === 'r32');
for (const m of r32) {
  const r = randomResult();
  await query(
    `UPDATE knockout_match
     SET home_goals = $1, away_goals = $2, home_goals_et = $3, away_goals_et = $4,
         home_pens = $5, away_pens = $6, status = 'FINISHED', updated_at = NOW()
     WHERE match_number = $7`,
    [r.homeGoals, r.awayGoals, r.homeGoalsEt, r.awayGoalsEt, r.homePens, r.awayPens, m.matchNumber],
  );
}
console.log(`✅ wrote random results for ${r32.length} R32 matches`);

// 5. Propagate winners into R16 + rescore.
const written = await recomputeKnockoutBracket();
const recalc = await recalculateAllPlayoffPoints();
console.log(`✅ bracket recomputed (${written} matches), tips rescored`, recalc);

// Report.
const all = await getKnockoutMatches();
const byRound = (round) => all.filter((m) => m.round === round);
const fmt = (m) => {
  const r = m.status === 'FINISHED'
    ? ` ${m.homeGoalsEt ?? m.homeGoals}-${m.awayGoalsEt ?? m.awayGoals}${m.homePens != null ? ` (p ${m.homePens}-${m.awayPens})` : ''}`
    : '';
  const adv = m.advancingTeamId
    ? ` → ${m.advancingTeamId === m.homeTeam?.id ? m.homeTeam?.shortName : m.awayTeam?.shortName}`
    : '';
  return `#${m.matchNumber} ${m.homeTeam?.shortName ?? 'TBD'}–${m.awayTeam?.shortName ?? 'TBD'}${r}${adv}`;
};
console.log('\n── Round of 32 (played) ──');
for (const m of byRound('r32')) console.log('  ' + fmt(m));
console.log('\n── Round of 16 (open for you to enter) ──');
for (const m of byRound('r16')) console.log('  ' + fmt(m));

await closeDb();
console.log('\n🎉 R32 played. Enter R16 results at /admin (Play-off tab); bracket at /worldcup2026/knockout-bracket');
