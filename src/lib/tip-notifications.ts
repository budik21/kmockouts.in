import { Resend } from 'resend';
import { buildTipResultEmail, type TipResultEmailData } from './email-templates/tip-result';
import { query } from './db';
import type { TipTransition } from './tip-recalc';

export interface NotifyUser {
  email: string;
  name: string;
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
}

export interface NotifyPayload {
  user: NotifyUser;
  points: 0 | 1 | 4;
  data: Omit<TipResultEmailData, 'userName' | 'points'>;
}

function shouldSend(user: NotifyUser, points: 0 | 1 | 4): boolean {
  if (points === 4) return user.notify_exact_score;
  if (points === 1) return user.notify_winner_only;
  return user.notify_wrong_tip;
}

/**
 * Send a single tip-result e-mail if the user opted in.
 * Returns 'skipped' when the user has the relevant toggle off,
 * 'disabled' when Resend is not configured, or 'sent' on success.
 */
export async function sendTipResultEmail(payload: NotifyPayload): Promise<'sent' | 'skipped' | 'disabled'> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return 'disabled';
  if (!shouldSend(payload.user, payload.points)) return 'skipped';

  const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
  const resend = new Resend(apiKey);

  const { subject, html } = buildTipResultEmail({
    userName: payload.user.name,
    points: payload.points,
    ...payload.data,
  });

  await resend.emails.send({
    from,
    to: payload.user.email,
    subject,
    html,
  });

  return 'sent';
}

interface TransitionRow {
  tip_id: number;
  tip_home_goals: number;
  tip_away_goals: number;
  new_points: number;
  email: string;
  user_name: string;
  notify_exact_score: boolean;
  notify_winner_only: boolean;
  notify_wrong_tip: boolean;
  match_id: number;
  match_group_id: string;
  kick_off: string;
  home_goals: number;
  away_goals: number;
  home_team_id: number;
  home_team_name: string;
  home_country_code: string;
  away_team_id: number;
  away_team_name: string;
  away_country_code: string;
}

/**
 * Send tip-result e-mails for transitions where a tip was just scored
 * (oldPoints was NULL and newPoints is 0/1/4). Respects per-user opt-in.
 * Fire-and-forget: individual failures are logged but do not throw.
 */
export async function dispatchTipResultEmails(transitions: TipTransition[]): Promise<void> {
  const firstScored = transitions.filter(
    (t) => t.oldPoints === null && t.newPoints !== null,
  );
  if (firstScored.length === 0) return;
  if (!process.env.RESEND_API_KEY) return;

  const tipIds = firstScored.map((t) => t.tipId);

  const rows = await query<TransitionRow>(
    `SELECT
       t.id AS tip_id,
       t.home_goals AS tip_home_goals,
       t.away_goals AS tip_away_goals,
       t.points AS new_points,
       u.email,
       u.name AS user_name,
       u.notify_exact_score,
       u.notify_winner_only,
       u.notify_wrong_tip,
       m.id AS match_id,
       m.group_id AS match_group_id,
       m.kick_off,
       m.home_goals,
       m.away_goals,
       ht.id AS home_team_id,
       ht.name AS home_team_name,
       ht.country_code AS home_country_code,
       at.id AS away_team_id,
       at.name AS away_team_name,
       at.country_code AS away_country_code
     FROM tip t
     JOIN tipster_user u ON u.id = t.user_id
     JOIN match m ON m.id = t.match_id
     JOIN team ht ON ht.id = m.home_team_id
     JOIN team at ON at.id = m.away_team_id
     WHERE t.id = ANY($1::int[])`,
    [tipIds],
  );

  await Promise.allSettled(
    rows.map(async (r) => {
      if (r.new_points !== 0 && r.new_points !== 1 && r.new_points !== 4) return;
      try {
        await sendTipResultEmail({
          user: {
            email: r.email,
            name: r.user_name,
            notify_exact_score: r.notify_exact_score,
            notify_winner_only: r.notify_winner_only,
            notify_wrong_tip: r.notify_wrong_tip,
          },
          points: r.new_points as 0 | 1 | 4,
          data: {
            match: {
              groupId: r.match_group_id,
              kickOff: typeof r.kick_off === 'string' ? r.kick_off : new Date(r.kick_off).toISOString(),
              homeGoals: r.home_goals,
              awayGoals: r.away_goals,
            },
            tip: {
              homeGoals: r.tip_home_goals,
              awayGoals: r.tip_away_goals,
            },
            homeTeam: { id: r.home_team_id, name: r.home_team_name, countryCode: r.home_country_code },
            awayTeam: { id: r.away_team_id, name: r.away_team_name, countryCode: r.away_country_code },
          },
        });
      } catch (err) {
        console.error('[tip-notifications] send failed for tip', r.tip_id, err);
      }
    }),
  );
}
