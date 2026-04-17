import { query } from '../src/lib/db.ts';

const allMatches = await query("SELECT group_id, status FROM match");
const teams = await query("SELECT id, group_id FROM team");

const byGroup = {};
for (const m of allMatches) {
  if (!byGroup[m.group_id]) byGroup[m.group_id] = { all: 0, finished: 0 };
  byGroup[m.group_id].all++;
  if (m.status === 'FINISHED') byGroup[m.group_id].finished++;
}

const groups = Object.keys(byGroup).sort();
console.log("Group | Finished/Total");
for (const g of groups) {
  console.log(`${g}     | ${byGroup[g].finished}/${byGroup[g].all}`);
}

let groupsWithMatches = 0;
let hasRemainingMatches = false;

for (const g of groups) {
  if (byGroup[g].finished > 0) groupsWithMatches++;
  if (byGroup[g].all > byGroup[g].finished) hasRemainingMatches = true;
}

const matchRows = await query("SELECT home_team_id, away_team_id FROM match WHERE status='FINISHED'");
const playCount = {};
for (const t of teams) playCount[t.id] = 0;
for (const m of matchRows) {
  playCount[m.home_team_id]++;
  playCount[m.away_team_id]++;
}
const teamsWithLessThan2 = teams.filter(t => playCount[t.id] < 2).length;
const allTeamsPlayedTwo = teamsWithLessThan2 === 0;

console.log("\n=== CONDITIONS ===");
console.log("groupsWithMatches:", groupsWithMatches, "(showTable needs >=12)");
console.log("showTable:", groupsWithMatches >= 12);
console.log("allTeamsPlayedTwo:", allTeamsPlayedTwo, `(${teamsWithLessThan2} teams with <2 finished matches)`);
console.log("hasRemainingMatches:", hasRemainingMatches);
console.log("\n=> AI summaries enabled:", (groupsWithMatches >= 12) && allTeamsPlayedTwo);

// Check ai_summary_cache table
try {
  const cached = await query("SELECT COUNT(*) as c FROM ai_summary_cache WHERE group_id='B3'");
  console.log("\nAI cache rows for B3:", cached[0].c);
} catch (e) {
  console.log("\nAI cache check failed:", e.message);
}

// Check if ANTHROPIC_API_KEY is set
console.log("ANTHROPIC_API_KEY set:", !!process.env.ANTHROPIC_API_KEY);

process.exit(0);
