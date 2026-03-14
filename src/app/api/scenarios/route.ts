import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface ScenarioMeta {
  id: number;
  name: string;
  description: string;
  matchCount: number;
}

/**
 * GET /api/scenarios
 * List all available scenarios from data/scenarios/*.json
 */
export async function GET() {
  const scenariosDir = path.join(process.cwd(), 'data', 'scenarios');

  if (!fs.existsSync(scenariosDir)) {
    return NextResponse.json({ scenarios: [], active: null });
  }

  const files = fs.readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const scenarios: ScenarioMeta[] = [];

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(scenariosDir, file), 'utf-8'));
      scenarios.push({
        id: content.id,
        name: content.name,
        description: content.description,
        matchCount: content.results?.length ?? 0,
      });
    } catch {
      // skip malformed files
    }
  }

  // Check which scenario is currently active (stored in a simple flag file)
  const flagPath = path.join(scenariosDir, '.active');
  let active: number | null = null;
  if (fs.existsSync(flagPath)) {
    const val = fs.readFileSync(flagPath, 'utf-8').trim();
    active = val === '0' ? null : parseInt(val, 10);
  }

  return NextResponse.json({ scenarios, active });
}
