import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { signOut } from '@/lib/auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { listFeatureFlags, isAiGenerationEnabledByEnv, isFeatureEnabled } from '@/lib/feature-flags';
import { getAiPredictionModelKey } from '@/lib/ai-model-server';
import { ALL_GROUPS } from '@/lib/constants';
import { ROUND_LABELS, type KnockoutRoundName } from '@/lib/knockout-bracket';
import DashboardTabs from '../components/DashboardTabs';
import type { TipsterRow } from '../components/TipstersTab';
import type { LeagueRow } from '../components/LeaguesTab';
import type { TipRow } from '../components/TipsTab';
import type { MatchTipStats } from '../components/PickemMatchesTab';
import type { PlayoffTipRow, PlayoffPickRow } from '../components/PlayoffTipsTab';
import type { PlayerRow } from '../components/PlayersTab';
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

type TabKey = 'matches' | 'scenarios' | 'pickem' | 'emails' | 'players' | 'users' | 'flags' | 'ai' | 'twitter' | 'cloudflare' | 'env';
const VALID_TABS: TabKey[] = ['matches', 'scenarios', 'pickem', 'emails', 'players', 'users', 'flags', 'ai', 'twitter', 'cloudflare', 'env'];

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

  // Play-off results tab is shown to all admins only while the feature is live.
  const playoffEnabled = await isFeatureEnabled('playoff_pickem', false);

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

  const [matchRows, statsRows, adminUserRows, tipsterRows, leagueRows, tipRows, playerRows] = await Promise.all([
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
    query<{
      id: number;
      name: string;
      email: string;
      tips_public: boolean;
      notify_exact_score: boolean;
      notify_winner_only: boolean;
      notify_wrong_tip: boolean;
      notify_playoff: boolean;
      group_tips: number;
      playoff_tips: number;
    }>(`
      SELECT tu.id, tu.name, tu.email, tu.tips_public,
        tu.notify_exact_score, tu.notify_winner_only, tu.notify_wrong_tip, tu.notify_playoff,
        COALESCE(g.cnt, 0)::int AS group_tips,
        COALESCE(k.cnt, 0)::int AS playoff_tips
      FROM tipster_user tu
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM tip GROUP BY user_id) g ON g.user_id = tu.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM knockout_tip GROUP BY user_id) k ON k.user_id = tu.id
      ORDER BY tu.name
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

  // ── Play-off (knockout) admin data — built only while the feature is live ──
  // Mirrors the group-stage aggregations above, but reads the knockout_match /
  // knockout_tip / playoff_pick tables. Feeds the Pick'em → Matches and Tips
  // sub-tabs (the Play-off view behind their stage switch).
  let playoffMatchTipStats: MatchTipStats[] = [];
  let playoffTips: PlayoffTipRow[] = [];
  let playoffPicks: PlayoffPickRow[] = [];

  if (playoffEnabled) {
    const koStatsRows = await query<{
      match_number: number;
      round: string;
      kick_off: string;
      home_name: string | null;
      home_short: string | null;
      home_cc: string | null;
      away_name: string | null;
      away_short: string | null;
      away_cc: string | null;
      total_tips: string;
      home_wins: string;
      draws: string;
      away_wins: string;
    }>(
      `SELECT km.match_number, km.round, km.kick_off,
          ht.name AS home_name, ht.short_name AS home_short, ht.country_code AS home_cc,
          at2.name AS away_name, at2.short_name AS away_short, at2.country_code AS away_cc,
          COUNT(kt.id)::text AS total_tips,
          COUNT(kt.id) FILTER (WHERE kt.home_goals > kt.away_goals)::text AS home_wins,
          COUNT(kt.id) FILTER (WHERE kt.home_goals = kt.away_goals)::text AS draws,
          COUNT(kt.id) FILTER (WHERE kt.home_goals < kt.away_goals)::text AS away_wins
        FROM knockout_match km
        LEFT JOIN team ht ON ht.id = km.home_team_id
        LEFT JOIN team at2 ON at2.id = km.away_team_id
        LEFT JOIN knockout_tip kt ON kt.match_number = km.match_number
        GROUP BY km.match_number, km.round, km.kick_off,
          ht.name, ht.short_name, ht.country_code,
          at2.name, at2.short_name, at2.country_code
        ORDER BY km.kick_off, km.match_number`,
    );

    const koTopScoreRows = koStatsRows.length === 0
      ? []
      : await query<{ match_number: number; home_goals: number; away_goals: number; cnt: string }>(
          `SELECT match_number, home_goals, away_goals, cnt::text AS cnt
             FROM (
               SELECT kt.match_number, kt.home_goals, kt.away_goals,
                      COUNT(*) AS cnt,
                      ROW_NUMBER() OVER (
                        PARTITION BY kt.match_number
                        ORDER BY COUNT(*) DESC, kt.home_goals ASC, kt.away_goals ASC
                      ) AS rn
                 FROM knockout_tip kt
                WHERE kt.match_number = ANY($1::int[])
                GROUP BY kt.match_number, kt.home_goals, kt.away_goals
             ) s
            WHERE rn = 1`,
          [koStatsRows.map((m) => m.match_number)],
        );

    const koTopByMatch = new Map(koTopScoreRows.map((r) => [r.match_number, r]));

    playoffMatchTipStats = koStatsRows.map((r) => {
      const top = koTopByMatch.get(r.match_number);
      return {
        id: r.match_number,
        groupId: ROUND_LABELS[r.round as KnockoutRoundName] ?? r.round,
        round: 0,
        kickOff: r.kick_off,
        homeName: r.home_name ?? 'TBD',
        homeShort: r.home_short ?? 'TBD',
        homeCc: r.home_cc ?? '',
        awayName: r.away_name ?? 'TBD',
        awayShort: r.away_short ?? 'TBD',
        awayCc: r.away_cc ?? '',
        totalTips: toInt(r.total_tips),
        homeWins: toInt(r.home_wins),
        draws: toInt(r.draws),
        awayWins: toInt(r.away_wins),
        topScore: top
          ? { homeGoals: top.home_goals, awayGoals: top.away_goals, count: toInt(top.cnt) }
          : null,
        stage: 'knockout',
      };
    });

    const koTipRows = await query<{
      id: number;
      tipster_name: string;
      share_token: string | null;
      tips_public: boolean;
      match_number: number;
      round: string;
      status: string;
      home_short: string | null;
      home_cc: string | null;
      away_short: string | null;
      away_cc: string | null;
      tip_home: number;
      tip_away: number;
      advance_short: string | null;
      advance_cc: string | null;
      result_home: number | null;
      result_away: number | null;
      points: number | null;
      created_at: string;
    }>(
      `SELECT kt.id,
          tu.name AS tipster_name, tu.share_token, tu.tips_public,
          kt.match_number, km.round, km.status,
          ht.short_name AS home_short, ht.country_code AS home_cc,
          at2.short_name AS away_short, at2.country_code AS away_cc,
          kt.home_goals AS tip_home, kt.away_goals AS tip_away,
          adv.short_name AS advance_short, adv.country_code AS advance_cc,
          km.home_goals AS result_home, km.away_goals AS result_away,
          kt.points,
          to_char(kt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM knockout_tip kt
        JOIN tipster_user tu ON kt.user_id = tu.id
        JOIN knockout_match km ON km.match_number = kt.match_number
        LEFT JOIN team ht ON ht.id = km.home_team_id
        LEFT JOIN team at2 ON at2.id = km.away_team_id
        LEFT JOIN team adv ON adv.id = kt.advance_team_id
        ORDER BY kt.created_at DESC`,
    );

    playoffTips = koTipRows.map((r) => ({
      id: r.id,
      tipsterName: r.tipster_name,
      shareToken: r.share_token,
      tipsPublic: r.tips_public,
      matchNumber: r.match_number,
      roundLabel: ROUND_LABELS[r.round as KnockoutRoundName] ?? r.round,
      homeShort: r.home_short,
      homeCc: r.home_cc,
      awayShort: r.away_short,
      awayCc: r.away_cc,
      tipHome: r.tip_home,
      tipAway: r.tip_away,
      advanceShort: r.advance_short,
      advanceCc: r.advance_cc,
      finished: r.status === 'FINISHED' && r.result_home !== null && r.result_away !== null,
      resultHome: r.result_home,
      resultAway: r.result_away,
      points: r.points,
      createdAt: r.created_at,
    }));

    const koPickRows = await query<{
      id: number;
      user_id: number;
      tipster_name: string;
      share_token: string | null;
      tips_public: boolean;
      slot: string;
      team_short: string;
      team_cc: string;
      points: number | null;
      created_at: string;
    }>(
      `SELECT pp.id, pp.user_id,
          tu.name AS tipster_name, tu.share_token, tu.tips_public,
          pp.slot, t.short_name AS team_short, t.country_code AS team_cc,
          pp.points,
          to_char(pp.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM playoff_pick pp
        JOIN tipster_user tu ON pp.user_id = tu.id
        JOIN team t ON t.id = pp.team_id
        ORDER BY pp.created_at DESC`,
    );

    playoffPicks = koPickRows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      tipsterName: r.tipster_name,
      shareToken: r.share_token,
      tipsPublic: r.tips_public,
      slot: r.slot,
      teamShort: r.team_short,
      teamCc: r.team_cc,
      points: r.points,
      createdAt: r.created_at,
    }));
  }

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
  const players: PlayerRow[] = playerRows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    tipsPublic: r.tips_public,
    notifyExactScore: r.notify_exact_score,
    notifyWinnerOnly: r.notify_winner_only,
    notifyWrongTip: r.notify_wrong_tip,
    notifyPlayoff: r.notify_playoff,
    groupTips: r.group_tips,
    playoffTips: r.playoff_tips,
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
        players={players}
        matchTipStats={matchTipStats}
        playoffMatchTipStats={playoffMatchTipStats}
        playoffTips={playoffTips}
        playoffPicks={playoffPicks}
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
        playoffEnabled={playoffEnabled}
        initialTab={initialTab}
      />
    </div>
  );
}
