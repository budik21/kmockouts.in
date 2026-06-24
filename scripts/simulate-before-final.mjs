/**
 * LOCAL DEV ONLY. Brings the bracket to the state "only the 3rd-place match and
 * the final remain": every knockout match through the semifinals is played
 * (home wins 2–1, so the home side advances), and matches 103 + 104 are left
 * SCHEDULED with their participants resolved — ready to be entered in the admin.
 *
 * Run: node --env-file=.env --import tsx scripts/simulate-before-final.mjs
 */
import { query, queryOne, closeDb } from '../src/lib/db.ts';
import { recomputeKnockoutBracket } from '../src/engine/knockout-sync.ts';
import { recalculateAllPlayoffPoints } from '../src/lib/knockout-recalc.ts';
import { getKnockoutMatches } from '../src/lib/playoff-data.ts';

const PLAY_ROUNDS = new Set(['r32', 'r16', 'qf', 'sf']);

// Play every match up to and including the semifinals.
for (let pass = 0; pass < 6; pass++) {
  await recomputeKnockoutBracket();
  const ms = await getKnockoutMatches();
  for (const m of ms) {
    if (PLAY_ROUNDS.has(m.round) && m.participantsKnown && m.status !== 'FINISHED') {
      await query(
        `UPDATE knockout_match SET home_goals=2, away_goals=1,
           home_goals_et=NULL, away_goals_et=NULL, home_pens=NULL, away_pens=NULL,
           status='FINISHED' WHERE match_number=$1`,
        [m.matchNumber],
      );
    }
  }
}

// Leave the third-place match (103) and final (104) unplayed.
await query(
  `UPDATE knockout_match SET home_goals=NULL, away_goals=NULL,
     home_goals_et=NULL, away_goals_et=NULL, home_pens=NULL, away_pens=NULL,
     status='SCHEDULED' WHERE match_number IN (103, 104)`,
);
await recomputeKnockoutBracket();
await recalculateAllPlayoffPoints();

const info = async (n) => {
  const r = await queryOne(
    `SELECT km.status, ht.name h, at.name a FROM knockout_match km
     LEFT JOIN team ht ON ht.id=km.home_team_id LEFT JOIN team at ON at.id=km.away_team_id
     WHERE km.match_number=$1`, [n]);
  return `#${n} ${r.status}: ${r.h ?? '?'} vs ${r.a ?? '?'}`;
};
const sf = await query("SELECT match_number FROM knockout_match WHERE round='sf' AND status='FINISHED'");
console.log('semifinals played:', sf.length, '/ 2');
console.log('To enter in admin (Play-off tab):');
console.log(' ', await info(103), '(3rd place — losers of the semis)');
console.log(' ', await info(104), '(final — winners of the semis)');
console.log('\n🎯 Ready: enter #103 and #104 in /admin → Play-off, then check scoring.');
await closeDb();
