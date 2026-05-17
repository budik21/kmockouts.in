/**
 * Daily summary e-mail for the superadmin.
 * Runs once a day from the scraper cron and reports activity in the last 24h:
 *   - new pick'em leagues created
 *   - total league joins
 *   - all-time totals (leagues + unique members)
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

  const joinsRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt
       FROM pickem_league_member
      WHERE joined_at >= NOW() - ($1 || ' hours')::INTERVAL`,
    [String(WINDOW_HOURS)],
  );

  const totalLeaguesRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::text AS cnt FROM pickem_league`,
  );

  const uniqueMembersRow = await queryOne<CountRow>(
    `SELECT COUNT(DISTINCT user_id)::text AS cnt FROM pickem_league_member`,
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

  const { subject, html } = buildDailySummaryEmail({
    windowStart,
    windowEnd,
    newLeagues,
    joinsLast24h: parseInt(joinsRow?.cnt ?? '0', 10) || 0,
    totalLeagues: parseInt(totalLeaguesRow?.cnt ?? '0', 10) || 0,
    totalUniqueMembers: parseInt(uniqueMembersRow?.cnt ?? '0', 10) || 0,
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
    `  [daily-summary] sent: ${newLeagues.length} new leagues, ` +
    `${joinsRow?.cnt ?? 0} joins, ${newUsers.length} new users`,
  );
}
