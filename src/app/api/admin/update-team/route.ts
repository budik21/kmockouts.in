import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/admin/update-team
 * Body: { teamId: number, name: string, shortName: string, countryCode: string }
 *
 * Updates a placeholder team once playoff results are known.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, name, shortName, countryCode } = body;

    if (!teamId || !name || !shortName) {
      return NextResponse.json(
        { error: 'teamId, name, and shortName are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Verify team exists and is a placeholder
    const team = db.prepare('SELECT * FROM team WHERE id = ?').get(teamId) as { is_placeholder: number } | undefined;
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Update team
    db.prepare(`
      UPDATE team
      SET name = ?, short_name = ?, country_code = ?, is_placeholder = 0
      WHERE id = ?
    `).run(name, shortName, countryCode ?? '', teamId);

    // Clear probability cache for this team's group
    db.prepare(`
      DELETE FROM probability_cache
      WHERE team_id = ? OR group_id = (SELECT group_id FROM team WHERE id = ?)
    `).run(teamId, teamId);

    return NextResponse.json({
      success: true,
      message: `Team ${teamId} updated to ${name} (${shortName})`,
    });
  } catch (error) {
    console.error('Update team error:', error);
    return NextResponse.json(
      { error: 'Failed to update team' },
      { status: 500 }
    );
  }
}
