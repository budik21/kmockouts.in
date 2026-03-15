import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { GroupId, TeamRow, MatchRow } from '@/lib/types';
import { ALL_GROUPS } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group')?.toUpperCase() as GroupId | undefined;

    if (groupId && !ALL_GROUPS.includes(groupId)) {
      return NextResponse.json({ error: 'Invalid group. Use A-L.' }, { status: 400 });
    }

    // Build team lookup
    const teamRows = await query<TeamRow>('SELECT * FROM team');
    const teamMap = new Map(teamRows.map((t) => [t.id, { id: t.id, name: t.name, shortName: t.short_name, countryCode: t.country_code }]));

    let matchRows: MatchRow[];
    if (groupId) {
      matchRows = await query<MatchRow>('SELECT * FROM match WHERE group_id = $1 ORDER BY kick_off', [groupId]);
    } else {
      matchRows = await query<MatchRow>('SELECT * FROM match ORDER BY kick_off');
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
  } catch (error) {
    console.error('GET /api/matches error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
