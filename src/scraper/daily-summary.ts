/**
 * Daily summary e-mail for the superadmin.
 * Runs once a day from the scraper cron and reports activity in the last 24h:
 *   - headline metrics (new vs total users, tips, leagues; engagement gaps)
 *   - tip distribution for matches kicking off in the next 24h
 *   - new pick'em leagues created
 *   - detailed list of newly registered users
 *
 * Fire-and-forget: never throws. A missing RESEND_API_KEY just logs and skips.
 */

import { Resend } from 'resend';
import { query, queryOne } from '../lib/db';
import { SUPERADMIN_EMAIL } from '../lib/superadmin';
import {
  buildDailySummaryEmail,
  type NewLeagueSummary,
  type NewUserSummary,
  type UpcomingMatchTips,
} from '../lib/email-templates/daily-summary';

interface NewLeagueRow {
  code: string;
  name: string;
  created_at: Date;
  owner_email: string;
  owner_name: string;
}

interface NewUserRow {
  email: string;
  name: string;
  created_at: Date;
  joined_league_count: string;
}

interface CountRow {
  cnt: string;
}

interface ReadinessRow {
  upcoming_count: string;
  ready_users: string;
  not_ready_users: string;
}

interface UpcomingMatchRow {
  id: number;
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
}

interface TopScoreRow {
  match_id: number;
  home_goals: number;
  away_goals: number;
  cnt: string;
}

const WINDOW_HOURS = 24;

export async function sendDailySummaryEmail(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('  [daily-summary] RESEND_API_KEY not set — skipping');
    return;
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

  const newLeagueRows = await query<NewLeagueRow>(
    `SELECT l.code,
            l.name,
            l.created_at,
            u.email AS owner_email,
            u.name  AS owner_name
       FROM pickem_league l
       JOIN tipster_user u ON u.id = l.owner_user_id
      WHERE l.created_at >= NOW() - ($1 || ' hours')::INTERVAL
      ORDER BY l.created_at DESC`,
    [String(WINDOW_HOURS)],
  );

  const totalLeaguesRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt FROM pickem_league`,
  );

  // --- Headline counts: users and tips, new-in-window vs all-time ----------
  const newUsersRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt
       FROM tipster_user
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL`,
    [String(WINDOW_HOURS)],
  );

  const totalUsersRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt FROM tipster_user`,
  );

  const newTipsRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt
       FROM tip
      WHERE created_at >= NOW() - ($1 || ' hours')::INTERVAL`,
    [String(WINDOW_HOURS)],
  );

  const totalTipsRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt FROM tip`,
  );

  // Registered users who have never placed a tip.
  const usersWithoutTipRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt
       FROM tipster_user u
      WHERE NOT EXISTS (SELECT 1 FROM tip t WHERE t.user_id = u.id)`,
  );

  // Readiness for the next 24h: a user is "ready" only when they have a tip for
  // every match kicking off within the window; otherwise they are "not ready".
  const readinessRow = await queryOne<ReadinessRow>(
    `WITH upcoming AS (
       SELECT id FROM match
        WHERE status = 'SCHEDULED'
          AND kick_off::timestamptz >= NOW()
          AND kick_off::timestamptz < NOW() + ($1 || ' hours')::INTERVAL
     ),
     n AS (SELECT COUNT(*)::int AS total FROM upcoming),
     per_user AS (
       SELECT u.id,
              COUNT(t.match_id) FILTER (WHERE t.match_id IN (SELECT id FROM upcoming)) AS tipped
         FROM tipster_user u
         LEFT JOIN tip t ON t.user_id = u.id
        GROUP BY u.id
     )
     SELECT (SELECT total FROM n)::text AS upcoming_count,
            COUNT(*) FILTER (WHERE (SELECT total FROM n) > 0 AND tipped >= (SELECT total FROM n))::text AS ready_users,
            COUNT(*) FILTER (WHERE (SELECT total FROM n) > 0 AND tipped <  (SELECT total FROM n))::text AS not_ready_users
       FROM per_user`,
    [String(WINDOW_HOURS)],
  );

  // Per-match tip distribution for matches kicking off in the next 24h.
  const upcomingMatchRows = await query<UpcomingMatchRow>(
    `SELECT m.id,
            m.kick_off,
            ht.name         AS home_name,
            ht.short_name   AS home_short,
            ht.country_code AS home_cc,
            at.name         AS away_name,
            at.short_name   AS away_short,
            at.country_code AS away_cc,
            COUNT(t.id)::text AS total_tips,
            COUNT(t.id) FILTER (WHERE t.home_goals > t.away_goals)::text AS home_wins,
            COUNT(t.id) FILTER (WHERE t.home_goals = t.away_goals)::text AS draws,
            COUNT(t.id) FILTER (WHERE t.home_goals < t.away_goals)::text AS away_wins
       FROM match m
       JOIN team ht ON ht.id = m.home_team_id
       JOIN team at ON at.id = m.away_team_id
       LEFT JOIN tip t ON t.match_id = m.id
      WHERE m.status = 'SCHEDULED'
        AND m.kick_off::timestamptz >= NOW()
        AND m.kick_off::timestamptz < NOW() + ($1 || ' hours')::INTERVAL
      GROUP BY m.id, m.kick_off, ht.name, ht.short_name, ht.country_code,
               at.name, at.short_name, at.country_code
      ORDER BY m.kick_off::timestamptz`,
    [String(WINDOW_HOURS)],
  );

  // Most frequently tipped exact scoreline per upcoming match (ties broken by
  // the lower home then away goals, so the result is deterministic).
  const topScoreRows = upcomingMatchRows.length === 0
    ? []
    : await query<TopScoreRow>(
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
        [upcomingMatchRows.map((m) => m.id)],
      );

  const topScoreByMatch = new Map(
    topScoreRows.map((r) => [r.match_id, r]),
  );

  const newUserRows = await query<NewUserRow>(
    `SELECT u.email,
            u.name,
            u.created_at,
            COALESCE(m.cnt, 0)::text AS joined_league_count
       FROM tipster_user u
       LEFT JOIN (
         SELECT user_id, COUNT(*) AS cnt
           FROM pickem_league_member
          GROUP BY user_id
       ) m ON m.user_id = u.id
      WHERE u.created_at >= NOW() - ($1 || ' hours')::INTERVAL
      ORDER BY u.created_at ASC`,
    [String(WINDOW_HOURS)],
  );

  const newLeagues: NewLeagueSummary[] = newLeagueRows.map((r) => ({
    code: r.code,
    name: r.name,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    createdAt: r.created_at,
  }));

  const newUsers: NewUserSummary[] = newUserRows.map((r) => ({
    email: r.email,
    name: r.name,
    createdAt: r.created_at,
    joinedLeagueCount: parseInt(r.joined_league_count, 10) || 0,
  }));

  const num = (v: string | undefined | null) => parseInt(v ?? '0', 10) || 0;

  const upcomingMatches: UpcomingMatchTips[] = upcomingMatchRows.map((r) => {
    const top = topScoreByMatch.get(r.id);
    return {
      homeName: r.home_name,
      homeShort: r.home_short,
      homeCc: r.home_cc,
      awayName: r.away_name,
      awayShort: r.away_short,
      awayCc: r.away_cc,
      kickOff: new Date(r.kick_off),
      totalTips: num(r.total_tips),
      homeWins: num(r.home_wins),
      draws: num(r.draws),
      awayWins: num(r.away_wins),
      topScore: top
        ? { homeGoals: top.home_goals, awayGoals: top.away_goals, count: num(top.cnt) }
        : null,
    };
  });

  const { subject, html } = buildDailySummaryEmail({
    windowStart,
    windowEnd,
    newUsers24h: num(newUsersRow?.cnt),
    totalUsers: num(totalUsersRow?.cnt),
    newTips24h: num(newTipsRow?.cnt),
    totalTips: num(totalTipsRow?.cnt),
    usersWithoutTip: num(usersWithoutTipRow?.cnt),
    upcomingMatchCount: num(readinessRow?.upcoming_count),
    usersNotReady: num(readinessRow?.not_ready_users),
    usersReady: num(readinessRow?.ready_users),
    newLeaguesCount: newLeagues.length,
    totalLeagues: num(totalLeaguesRow?.cnt),
    upcomingMatches,
    newLeagues,
    newUsers,
  });

  const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to: SUPERADMIN_EMAIL,
    subject,
    html,
  });

  console.log(
    `  [daily-summary] sent: ${newUsers.length} new users, ` +
    `${num(newTipsRow?.cnt)} new tips, ${newLeagues.length} new leagues, ` +
    `${upcomingMatches.length} upcoming matches`,
  );
}
