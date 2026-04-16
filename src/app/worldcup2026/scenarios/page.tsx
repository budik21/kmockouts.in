import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';
import ScenarioPicker from '@/app/components/ScenarioPicker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Test Scenarios',
  description:
    'Internal testing tool — switch between match data snapshots to preview the tournament at different stages.',
  // Internal/admin tool — keep out of search engines.
  robots: { index: false, follow: false },
};

export interface ScenarioMeta {
  id: number;
  name: string;
  description: string;
  matchCount: number;
}

function readScenarios(): { scenarios: ScenarioMeta[]; active: number | null } {
  const scenariosDir = path.join(process.cwd(), 'data', 'scenarios');
  const files = fs
    .readdirSync(scenariosDir)
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
      // skip malformed
    }
  }

  const flagPath = path.join(scenariosDir, '.active');
  let active: number | null = null;
  if (fs.existsSync(flagPath)) {
    const val = fs.readFileSync(flagPath, 'utf-8').trim();
    const n = parseInt(val, 10);
    active = !isNaN(n) && n > 0 ? n : null;
  }

  return { scenarios, active };
}

export default function ScenariosPage() {
  const { scenarios, active } = readScenarios();

  return (
    <main className="container py-4">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/admin/dashboard">Admin</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Scenarios
          </li>
        </ol>
      </nav>

      <div className="mb-4">
        <h1 className="mb-1">Test Scenarios</h1>
        <p className="text-muted mb-0">
          Select a match data scenario to explore the tournament at different stages.
          Switching scenarios updates all results, recalculates probabilities, and regenerates AI commentary.
        </p>
      </div>

      <ScenarioPicker scenarios={scenarios} active={active} />
    </main>
  );
}