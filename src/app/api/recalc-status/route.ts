import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

interface RecalcRow {
  group_id: string;
  started_at: string | null;
}

interface TipRecalcRow {
  is_recalculating: boolean;
  started_at: string | null;
  last_completed_at: string | null;
}

interface PendingMatchRow {
  id: number;
  home: string;
  away: string;
  home_goals: number | null;
  away_goals: number | null;
}

const STALE_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const rows = await query<RecalcRow>(
      'SELECT group_id, started_at FROM recalc_status WHERE is_recalculating = true',
    );

    const now = Date.now();
    const active: string[] = [];

    for (const r of rows) {
      if (r.started_at) {
        const elapsed = now - new Date(r.started_at).getTime();
        if (elapsed > STALE_MS) {
          await query('UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1', [r.group_id]);
          continue;
        }
      }
      active.push(r.group_id);
    }

    const tipStatus = await queryOne<TipRecalcRow>(
      'SELECT is_recalculating, started_at, last_completed_at FROM tip_recalc_status WHERE id = 1',
    );

    let tipsRecalculating = false;
    if (tipStatus?.is_recalculating) {
      if (tipStatus.started_at && now - new Date(tipStatus.started_at).getTime() > STALE_MS) {
        // Stale flag — clear it
        await query(
          `UPDATE tip_recalc_status
           SET is_recalculating = false, last_completed_at = COALESCE(last_completed_at, NOW())
           WHERE id = 1`,
        );
      } else {
        tipsRecalculating = true;
      }
    }

    let pendingMatches: Array<{ id: number; home: string; away: string; homeGoals: number | null; awayGoals: number | null }> = [];
    if (tipsRecalculating) {
      const pending = await query<PendingMatchRow>(
        `SELECT m.id, ht.name AS home, at.name AS away, m.home_goals, m.away_goals
         FROM match m
         JOIN team ht ON ht.id = m.home_team_id
         JOIN team at ON at.id = m.away_team_id
         CROSS JOIN tip_recalc_status s
         WHERE m.status = 'FINISHED'
           AND (s.last_completed_at IS NULL OR (m.last_scraped IS NOT NULL AND m.last_scraped::timestamptz > s.last_completed_at))
         ORDER BY m.last_scraped DESC NULLS LAST`,
      );
      pendingMatches = pending.map((p) => ({
        id: p.id,
        home: p.home,
        away: p.away,
        homeGoals: p.home_goals,
        awayGoals: p.away_goals,
      }));
    }

    return NextResponse.json({ recalculating: active, tipsRecalculating, pendingMatches });
  } catch {
    return NextResponse.json({ recalculating: [], tipsRecalculating: false, pendingMatches: [] });
  }
}
