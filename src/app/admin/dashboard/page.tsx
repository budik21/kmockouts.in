import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { signOut } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { listFeatureFlags, isAiGenerationEnabledByEnv } from '@/lib/feature-flags';
import DashboardTabs from '../components/DashboardTabs';
import type { ScenarioMeta } from '@/app/worldcup2026/scenarios/page';

interface AdminMatchRow {
  id: number;
  group_id: string;
  round: number;
  home_team_id: number;
  away_team_id: number;
  home_goals: number | null;
  away_goals: number | null;
  home_yc: number;
  home_yc2: number;
  home_rc_direct: number;
  home_yc_rc: number;
  away_yc: number;
  away_yc2: number;
  away_rc_direct: number;
  away_yc_rc: number;
  venue: string;
  kick_off: string;
  status: string;
  home_name: string;
  home_short: string;
  home_cc: string;
  away_name: string;
  away_short: string;
  away_cc: string;
}

export interface AdminMatch {
  id: number;
  groupId: string;
  round: number;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc: number;
  homeYc2: number;
  homeRcDirect: number;
  homeYcRc: number;
  awayYc: number;
  awayYc2: number;
  awayRcDirect: number;
  awayYcRc: number;
  venue: string;
  kickOff: string;
  status: string;
  homeTeam: { name: string; shortName: string; countryCode: string };
  awayTeam: { name: string; shortName: string; countryCode: string };
}

export interface PickemStatsRow {
  total: string;
  with_consent: string;
  without_consent: string;
}

export const dynamic = 'force-dynamic';

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

export default async function AdminDashboardPage() {
  await requireAdmin();

  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  const isSuperadmin = session?.user?.email === SUPERADMIN_EMAIL;
  const { scenarios, active: activeScenario } = readScenarios();

  const featureFlags = isSuperadmin ? await listFeatureFlags() : [];

  // Flags that are hard-locked off by an env var take precedence over the DB
  // value — the toggle is shown off + disabled with a warning. DB state is
  // preserved so it reappears when the env var is re-enabled.
  const envLocks: Record<string, string> = {};
  if (!isAiGenerationEnabledByEnv()) {
    envLocks.ai_predictions =
      'AI_PREDICTIONS_ENABLED is off in the environment. Toggle is locked — no Claude generation will run regardless of this flag. Set AI_PREDICTIONS_ENABLED=true on Railway to unlock.';
  }

  let envDocsHtml = '';
  if (isSuperadmin) {
    let raw: string;
    try {
      raw = fs.readFileSync(
        path.join(process.cwd(), 'docs', 'env-variables.md'),
        'utf-8',
      );
    } catch {
      raw = '# Environment Variables\n\nDocumentation file `docs/env-variables.md` is missing from the deployment.';
    }
    envDocsHtml = await marked.parse(raw, { gfm: true, breaks: false });
  }

  const [matchRows, statsRows, adminUserRows] = await Promise.all([
    query<AdminMatchRow>(`
      SELECT m.*,
        ht.name as home_name, ht.short_name as home_short, ht.country_code as home_cc,
        at2.name as away_name, at2.short_name as away_short, at2.country_code as away_cc
      FROM match m
      JOIN team ht ON m.home_team_id = ht.id
      JOIN team at2 ON m.away_team_id = at2.id
      ORDER BY m.kick_off, m.group_id, m.id
    `),
    query<PickemStatsRow>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE tips_public = true)::text AS with_consent,
        COUNT(*) FILTER (WHERE tips_public = false)::text AS without_consent
      FROM tipster_user
    `),
    query<{ email: string }>(`
      SELECT email FROM admin_user ORDER BY email
    `),
  ]);

  const matches: AdminMatch[] = matchRows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    round: r.round,
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    homeGoals: r.home_goals,
    awayGoals: r.away_goals,
    homeYc: r.home_yc,
    homeYc2: r.home_yc2,
    homeRcDirect: r.home_rc_direct,
    homeYcRc: r.home_yc_rc,
    awayYc: r.away_yc,
    awayYc2: r.away_yc2,
    awayRcDirect: r.away_rc_direct,
    awayYcRc: r.away_yc_rc,
    venue: r.venue,
    kickOff: r.kick_off,
    status: r.status,
    homeTeam: { name: r.home_name, shortName: r.home_short, countryCode: r.home_cc },
    awayTeam: { name: r.away_name, shortName: r.away_short, countryCode: r.away_cc },
  }));

  const stats = statsRows[0] ?? { total: '0', with_consent: '0', without_consent: '0' };
  const adminEmails = adminUserRows.map((r) => r.email);

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h1 style={{ color: 'var(--wc-text)', fontSize: '1.5rem', margin: 0 }}>
          Admin Dashboard
        </h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/admin' });
          }}
        >
          <button
            type="submit"
            className="btn btn-sm"
            style={{
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              border: '1px solid var(--wc-border)',
            }}
          >
            Sign out
          </button>
        </form>
      </div>

      <DashboardTabs
        initialMatches={matches}
        pickemsStats={stats}
        isSuperadmin={isSuperadmin}
        adminEmails={adminEmails}
        superadminEmail={SUPERADMIN_EMAIL}
        scenarios={scenarios}
        activeScenario={activeScenario}
        featureFlags={featureFlags}
        envLocks={envLocks}
        envDocsHtml={envDocsHtml}
      />
    </div>
  );
}
