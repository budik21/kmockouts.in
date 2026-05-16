import { Resend } from 'resend';
import { buildLeagueWelcomeEmail } from './email-templates/league-welcome';
import { queryOne } from './db';

interface UserRow {
  email: string;
  name: string;
}

interface CountRow {
  cnt: string;
}

export interface FirstJoinLeague {
  name: string;
  code: string;
}

/**
 * Send a one-time welcome e-mail when a user becomes a member of their FIRST
 * pick'em league — whether they created one, used an invite link, or typed a
 * code. Detection: SELECT COUNT(*) FROM pickem_league_member WHERE user_id=?
 * == 1 right after the INSERT. Fire-and-forget — never throws.
 *
 * The league info (name + 6-char code) is surfaced in the first step of the
 * e-mail so the user sees which league they just landed in.
 */
export async function sendLeagueWelcomeIfFirstJoin(
  userId: number,
  league: FirstJoinLeague,
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const countRow = await queryOne<CountRow>(
      'SELECT COUNT(*)::text AS cnt FROM pickem_league_member WHERE user_id = $1',
      [userId],
    );
    const count = parseInt(countRow?.cnt ?? '0', 10);
    if (count !== 1) return;

    const user = await queryOne<UserRow>(
      'SELECT email, name FROM tipster_user WHERE id = $1',
      [userId],
    );
    if (!user?.email) return;

    const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
    const resend = new Resend(apiKey);
    const { subject, html } = buildLeagueWelcomeEmail({
      userName: user.name ?? '',
      leagueName: league.name,
      leagueCode: league.code,
    });

    await resend.emails.send({
      from,
      to: user.email,
      subject,
      html,
    });
  } catch (err) {
    console.error('[league-welcome] send failed for user', userId, err);
  }
}
