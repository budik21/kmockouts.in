import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { recalculateAllProbabilities } from '@/lib/probability-cache';

export const dynamic = 'force-dynamic';

interface ScenarioResult {
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number;
  away_goals: number;
  home_yc: number;
  home_rc_direct: number;
  away_yc: number;
  away_rc_direct: number;
  status: string;
}

/**
 * POST /api/scenarios/apply
 * Body: { scenarioId: number }  (0 = reset to clean state)
 *
 * Applies a scenario by updating match results in the DB.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scenarioId: number = body.scenarioId;

    const db = getDb();
    const scenariosDir = path.join(process.cwd(), 'data', 'scenarios');
    const flagPath = path.join(scenariosDir, '.active');

    if (scenarioId === 0) {
      // Reset: set all matches back to SCHEDULED with no scores
      db.prepare(`
        UPDATE match
        SET home_goals = NULL, away_goals = NULL,
            home_yc = 0, home_rc_direct = 0,
            away_yc = 0, away_rc_direct = 0,
            status = 'SCHEDULED', last_scraped = NULL
      `).run();

      // Recalculate probabilities for clean state
      recalculateAllProbabilities();

      // Save active flag
      fs.writeFileSync(flagPath, '0');

      return NextResponse.json({ success: true, message: 'Reset to clean state', active: null });
    }

    // Load scenario file
    const scenarioFile = path.join(scenariosDir, `scenario-${scenarioId}.json`);
    if (!fs.existsSync(scenarioFile)) {
      return NextResponse.json({ error: `Scenario ${scenarioId} not found` }, { status: 404 });
    }

    const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
    const results: ScenarioResult[] = scenario.results ?? [];

    // First, reset ALL matches to SCHEDULED
    db.prepare(`
      UPDATE match
      SET home_goals = NULL, away_goals = NULL,
          home_yc = 0, home_rc_direct = 0,
          away_yc = 0, away_rc_direct = 0,
          status = 'SCHEDULED', last_scraped = NULL
    `).run();

    // Then apply scenario results
    const updateStmt = db.prepare(`
      UPDATE match
      SET home_goals = ?, away_goals = ?,
          home_yc = ?, home_rc_direct = ?,
          away_yc = ?, away_rc_direct = ?,
          status = ?, last_scraped = datetime('now')
      WHERE group_id = ? AND round = ? AND home_team_id = ? AND away_team_id = ?
    `);

    const applyAll = db.transaction(() => {
      for (const r of results) {
        updateStmt.run(
          r.home_goals, r.away_goals,
          r.home_yc ?? 0, r.home_rc_direct ?? 0,
          r.away_yc ?? 0, r.away_rc_direct ?? 0,
          r.status ?? 'FINISHED',
          r.group_id, r.round, r.home_team_id, r.away_team_id
        );
      }
    });

    applyAll();

    // Recalculate probabilities after applying scenario
    recalculateAllProbabilities();

    // Save active flag
    fs.writeFileSync(flagPath, String(scenarioId));

    return NextResponse.json({
      success: true,
      message: `Applied scenario ${scenarioId}: ${scenario.name}`,
      active: scenarioId,
      matchesApplied: results.length,
    });
  } catch (error) {
    console.error('Apply scenario error:', error);
    return NextResponse.json({ error: 'Failed to apply scenario' }, { status: 500 });
  }
}
