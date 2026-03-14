import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GroupId, TeamRow, MatchRow } from '@/lib/types';
import { ALL_GROUPS } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('group')?.toUpperCase() as GroupId | undefined;

  if (groupId && !ALL_GROUPS.includes(groupId)) {
    return NextResponse.json({ error: 'Invalid group. Use A-L.' }, { status: 400 });
  }

  const db = getDb();

  // Build team lookup
  const teamRows = db.prepare('SELECT * FROM team').all() as TeamRow[];
  const teamMap = new Map(teamRows.map((t) => [t.id, { id: t.id, name: t.name, shortName: t.short_name, countryCode: t.country_code }]));

  let matchRows: MatchRow[];
  if (groupId) {
    matchRows = db.prepare('SELECT * FROM match WHERE group_id = ? ORDER BY kick_off').all(groupId) as MatchRow[];
  } else {
    matchRows = db.prepare('SELECT * FROM match ORDER BY kick_off').all() as MatchRow[];
  }

  const matches = matchRows.map((m) => ({
    id: m.id,
    groupId: m.group_id,
    round: m.round,
    homeTeam: teamMap.get(m.home_team_id),
    awayTeam: teamMap.get(m.away_team_id),
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
    venue: m.venue,
    kickOff: m.kick_off,
    status: m.status,
  }));

  return NextResponse.json({ matches });
}
