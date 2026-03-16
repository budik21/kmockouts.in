import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne, getPool } from '@/lib/db';

/**
 * POST /api/admin/update-team
 * Body: { teamId: number, name: string, shortName: string, countryCode: string }
 *
 * Updates a placeholder team once playoff results are known.
 */
export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (googleConfigured && !isDev) {
    const session = await auth();
    if (!session?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { teamId, name, shortName, countryCode } = body;

    if (!teamId || !name || !shortName) {
      return NextResponse.json(
        { error: 'teamId, name, and shortName are required' },
        { status: 400 }
      );
    }

    // Verify team exists
    const team = await queryOne<{ is_placeholder: boolean }>('SELECT * FROM team WHERE id = $1', [teamId]);
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const pool = getPool();

    // Update team
    await pool.query(
      `UPDATE team SET name = $1, short_name = $2, country_code = $3, is_placeholder = false WHERE id = $4`,
      [name, shortName, countryCode ?? '', teamId]
    );

    // Clear probability cache for this team's group
    await pool.query(
      `DELETE FROM probability_cache WHERE team_id = $1 OR group_id = (SELECT group_id FROM team WHERE id = $2)`,
      [teamId, teamId]
    );

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
