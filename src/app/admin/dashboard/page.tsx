import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { signOut } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { listFeatureFlags, isAiGenerationEnabledByEnv } from '@/lib/feature-flags';
import { getAiPredictionModelKey } from '@/lib/ai-model-server';
import { ALL_GROUPS } from '@/lib/constants';
import DashboardTabs from '../components/DashboardTabs';
import type { TipsterRow } from '../components/TipstersTab';
import type { LeagueRow } from '../components/LeaguesTab';
import type { TipRow } from '../components/TipsTab';
import type { MatchTipStats } from '../components/PickemMatchesTab';
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

type TabKey = 'matches' | 'scenarios' | 'pickem' | 'users' | 'flags' | 'ai' | 'twitter' | 'env';
const VALID_TABS: TabKey[] = ['matches', 'scenarios', 'pickem', 'users', 'flags', 'ai', 'twitter', 'env'];

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const initialTab: TabKey | undefined = VALID_TABS.includes(sp.tab as TabKey)
    ? (sp.tab as TabKey)
    : undefined;

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

  const aiTeamRows = isSuperadmin
    ? await query<{ id: number; name: string; group_id: string }>(
        'SELECT id, name, group_id FROM team WHERE is_placeholder = false ORDER BY group_id, name',
      )
    : [];
  const aiTeams = aiTeamRows.map(r => ({ id: r.id, name: r.name, groupId: r.group_id }));
  const aiGroups: string[] = [...ALL_GROUPS];
  const aiEnvEnabled = isAiGenerationEnabledByEnv();
  const aiGenerationFlagEnabled = isSuperadmin
    ? (featureFlags.find(f => f.key === 'ai_predictions')?.enabled ?? false)
    : false;
  const aiDisplayFlagEnabled = isSuperadmin
    ? (featureFlags.find(f => f.key === 'ai_predictions_display')?.enabled ?? false)
    : false;
  const aiModel = isSuperadmin ? await getAiPredictionModelKey() : 'haiku';

  const [matchRows, statsRows, adminUserRows, tipsterRows, leagueRows, tipRows] = await Promise.all([
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
    query<{ id: number; name: string; email: string; created_at: string }>(`
      SELECT id, name, email,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM tipster_user
      ORDER BY created_at DESC
    `),
    query<{
      id: number;
      code: string;
      name: string;
      owner_name: string;
      owner_email: string;
      member_count: number;
      created_at: string;
    }>(`
      SELECT l.id, l.code, l.name,
        ou.name AS owner_name, ou.email AS owner_email,
        (SELECT COUNT(*) FROM pickem_league_member m WHERE m.league_id = l.id)::int AS member_count,
        to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM pickem_league l
      JOIN tipster_user ou ON l.owner_user_id = ou.id
      ORDER BY l.created_at DESC
    `),
    query<{
      id: number;
      tipster_name: string;
      home_short: string;
      home_cc: string;
      away_short: string;
      away_cc: string;
      tip_home: number;
      tip_away: number;
      result_home: number | null;
      result_away: number | null;
      status: string;
      points: number | null;
      created_at: string;
    }>(`
      SELECT t.id,
        tu.name AS tipster_name,
        ht.short_name AS home_short, ht.country_code AS home_cc,
        at2.short_name AS away_short, at2.country_code AS away_cc,
        t.home_goals AS tip_home, t.away_goals AS tip_away,
        m.home_goals AS result_home, m.away_goals AS result_away,
        m.status, t.points,
        to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM tip t
      JOIN tipster_user tu ON t.user_id = tu.id
      JOIN match m ON t.match_id = m.id
      JOIN team ht ON m.home_team_id = ht.id
      JOIN team at2 ON m.away_team_id = at2.id
      ORDER BY t.created_at DESC
    `),
  ]);

  // Per-match tip distribution for every group-stage fixture, mirroring the
  // daily-summary aggregation. Feeds the Pick'em → Matches sub-tab (tip counts,
  // home/draw/away share, most-tipped score) and the AI infographic prompt.
  const matchStatsRows = await query<{
    id: number;
    group_id: string;
    round: number;
    kick_off: string;
    home_name: string;
    home_short: string;
    home_cc: string;
    away_name: string;
    away_short: string;
    away_cc: string;
    total_tips: string;
    home_wins: string;
    draws: string;
    away_wins: string;
  }>(
    `SELECT m.id, m.group_id, m.round, m.kick_off,
        ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_cc,
        at2.name AS away_name, at2.short_name AS away_short, at2.country_code AS away_cc,
        COUNT(t.id)::text AS total_tips,
        COUNT(t.id) FILTER (WHERE t.home_goals > t.away_goals)::text AS home_wins,
        COUNT(t.id) FILTER (WHERE t.home_goals = t.away_goals)::text AS draws,
        COUNT(t.id) FILTER (WHERE t.home_goals < t.away_goals)::text AS away_wins
      FROM match m
      JOIN team ht ON m.home_team_id = ht.id
      JOIN team at2 ON m.away_team_id = at2.id
      LEFT JOIN tip t ON t.match_id = m.id
      WHERE m.group_id = ANY($1)
      GROUP BY m.id, m.group_id, m.round, m.kick_off,
        ht.name, ht.short_name, ht.country_code,
        at2.name, at2.short_name, at2.country_code
      ORDER BY m.kick_off, m.group_id, m.id`,
    [[...ALL_GROUPS]],
  );

  // Most frequently tipped exact scoreline per match (ties broken by the lower
  // home then away goals, so the result is deterministic). Mirrors daily-summary.
  const matchTopScoreRows = matchStatsRows.length === 0
    ? []
    : await query<{ match_id: number; home_goals: number; away_goals: number; cnt: string }>(
        `SELECT match_id, home_goals, away_goals, cnt::text AS cnt
           FROM (
             SELECT t.match_id, t.home_goals, t.away_goals,
                    COUNT(*) AS cnt,
                    ROW_NUMBER() OVER (
                      PARTITION BY t.match_id
                      ORDER BY COUNT(*) DESC, t.home_goals ASC, t.away_goals ASC
                    ) AS rn
               FROM tip t
              WHERE t.match_id = ANY($1::int[])
              GROUP BY t.match_id, t.home_goals, t.away_goals
           ) s
          WHERE rn = 1`,
        [matchStatsRows.map((m) => m.id)],
      );

  const topScoreByMatch = new Map(matchTopScoreRows.map((r) => [r.match_id, r]));
  const toInt = (v: string | null | undefined) => parseInt(v ?? '0', 10) || 0;

  const matchTipStats: MatchTipStats[] = matchStatsRows.map((r) => {
    const top = topScoreByMatch.get(r.id);
    return {
      id: r.id,
      groupId: r.group_id,
      round: r.round,
      kickOff: r.kick_off,
      homeName: r.home_name,
      homeShort: r.home_short,
      homeCc: r.home_cc,
      awayName: r.away_name,
      awayShort: r.away_short,
      awayCc: r.away_cc,
      totalTips: toInt(r.total_tips),
      homeWins: toInt(r.home_wins),
      draws: toInt(r.draws),
      awayWins: toInt(r.away_wins),
      topScore: top
        ? { homeGoals: top.home_goals, awayGoals: top.away_goals, count: toInt(top.cnt) }
        : null,
    };
  });

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
  const tipsters: TipsterRow[] = tipsterRows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.created_at,
  }));
  const leagues: LeagueRow[] = leagueRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    memberCount: r.member_count,
    createdAt: r.created_at,
  }));
  const tips: TipRow[] = tipRows.map((r) => ({
    id: r.id,
    tipsterName: r.tipster_name,
    homeShort: r.home_short,
    homeCc: r.home_cc,
    awayShort: r.away_short,
    awayCc: r.away_cc,
    tipHome: r.tip_home,
    tipAway: r.tip_away,
    resultHome: r.result_home,
    resultAway: r.result_away,
    finished: r.status === 'FINISHED' && r.result_home !== null && r.result_away !== null,
    points: r.points,
    createdAt: r.created_at,
  }));

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
        tipsters={tipsters}
        leagues={leagues}
        tips={tips}
        matchTipStats={matchTipStats}
        isSuperadmin={isSuperadmin}
        adminEmails={adminEmails}
        superadminEmail={SUPERADMIN_EMAIL}
        scenarios={scenarios}
        activeScenario={activeScenario}
        featureFlags={featureFlags}
        envLocks={envLocks}
        envDocsHtml={envDocsHtml}
        aiTeams={aiTeams}
        aiGroups={aiGroups}
        aiEnvEnabled={aiEnvEnabled}
        aiGenerationFlagEnabled={aiGenerationFlagEnabled}
        aiDisplayFlagEnabled={aiDisplayFlagEnabled}
        aiModel={aiModel}
        initialTab={initialTab}
      />
    </div>
  );
}
