import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface RecalcRow {
  group_id: string;
  started_at: string | null;
}

export async function GET() {
  try {
    const rows = await query<RecalcRow>(
      'SELECT group_id, started_at FROM recalc_status WHERE is_recalculating = true',
    );

    // Auto-clear stale flags (older than 5 minutes)
    const now = Date.now();
    const active: string[] = [];

    for (const r of rows) {
      if (r.started_at) {
        const elapsed = now - new Date(r.started_at).getTime();
        if (elapsed > 5 * 60 * 1000) {
          // Stale — clear it
          await query('UPDATE recalc_status SET is_recalculating = false WHERE group_id = $1', [r.group_id]);
          continue;
        }
      }
      active.push(r.group_id);
    }

    return NextResponse.json({ recalculating: active });
  } catch {
    return NextResponse.json({ recalculating: [] });
  }
}
