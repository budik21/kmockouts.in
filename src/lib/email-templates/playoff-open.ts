import { SITE_URL } from '@/lib/seo';
import { playoffPicksLockAtMs } from '@/lib/playoff-lock';
import {
  PLAYOFF_PICK_POINTS,
  PLAYOFF_PICK_WRONG_PLACE_POINTS,
  PLAYOFF_PICK_ALL_EXACT_BONUS,
} from '@/lib/playoff-scoring';

export interface PlayoffOpenEmailData {
  userName: string;
}

interface TemplateOutput {
  subject: string;
  html: string;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const PLAYOFF_OPEN_SUBJECT =
  '🏆 Play-off Pick’em is LIVE — tip today to grab the most points';

/**
 * Absolute moment the top-4 picks lock — i.e. the first knockout kick-off,
 * 21:00 Czech time — or null when the knockout schedule has no kick-off yet.
 * Shown in Czech (Europe/Prague) time, the reference timezone for kick-offs.
 */
function lockLabel(): string | null {
  const ms = playoffPicksLockAtMs();
  if (ms === null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Prague' })} Czech time`;
}

/**
 * "Play-off Pick'em is live" campaign: sent the moment the group stage is
 * finished and knockout tipping has opened. Distinct from the earlier
 * "Play-off Pick'em promo" (which only announced it was coming) — this one is
 * an urgent call to act, because the top-4 winner picks (champion + medalists)
 * lock the moment the first knockout match kicks off (21:00 Czech time), which
 * is only ~12–15 hours after this e-mail goes out. Also introduces the three
 * leaderboards and the play-off-only league option. Default recipients:
 * everyone who registered for the group-stage Pick'em but has not yet locked in
 * a top-4 pick. Visual shell matches the other admin campaign e-mails.
 */
export function buildPlayoffOpenEmail(data: PlayoffOpenEmailData): TemplateOutput {
  const playoffUrl = `${SITE_URL}/pickem/playoff`;
  const leaderboardUrl = `${SITE_URL}/pickem/leaderboard`;
  const leaguesUrl = `${SITE_URL}/pickem/leagues`;
  const settingsUrl = `${SITE_URL}/pickem/tips?tab=settings`;
  const lockAt = lockLabel();

  const ruleRow = (pts: string, text: string) => `
    <tr>
      <td style="padding:4px 10px 4px 0;vertical-align:top;white-space:nowrap;">
        <span style="display:inline-block;background:#6f003c;color:#ffffff;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px;">${pts}</span>
      </td>
      <td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.5;">${text}</td>
    </tr>`;

  const boardRow = (emoji: string, name: string, text: string) => `
    <tr>
      <td style="padding:6px 10px 6px 0;vertical-align:top;font-size:18px;line-height:1.3;">${emoji}</td>
      <td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">
        <strong style="color:#111827;">${name}</strong><br/>${text}
      </td>
    </tr>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(PLAYOFF_OPEN_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#6f003c,#b3005f);color:#ffffff;padding:22px 28px;">
              <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">Knockouts.in · Play-off Pick&rsquo;em</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">Hi ${esc(data.userName || 'there')}!</div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:36px 28px 8px;">
              <div style="font-size:84px;line-height:1;">🚀</div>
              <h1 style="font-size:22px;margin:18px 0 0;color:#111827;">The group stage is done &mdash; the Play-off Pick&rsquo;em is now open.</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 4px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                It&rsquo;s live. Go pick your <strong>champion</strong>, name the rest of the
                top 4 and tip your way through the entire knockout bracket.
                <strong>Tip today and you&rsquo;ll bag the most points</strong> &mdash; the top 4
                is the biggest haul on offer, and it locks the moment the first match kicks off.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:4px 28px 4px;">
              <div style="background:#fff4ed;border:1px solid #f7caa6;border-left:4px solid #e8590c;border-radius:10px;padding:16px 18px;color:#7a3408;font-size:14px;line-height:1.55;">
                <div style="font-size:15px;font-weight:700;color:#b34700;margin-bottom:6px;">⏳ Tip today &mdash; your top 4 locks at the first kick-off</div>
                Your <strong>top-4 picks</strong> (champion &amp; medalists) are worth the most points, and they lock <strong>the moment the very first play-off match kicks off</strong>${lockAt ? ` &mdash; <strong>${esc(lockAt)}</strong>` : ''}.
                Miss that whistle and those points are gone &mdash; so lock them in <strong>today</strong>.
                <br/><br/>
                Individual knockout matches stay open until shortly before each match &mdash; but the top 4 won&rsquo;t wait.
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 28px 8px;">
              <a href="${playoffUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">Make your picks now &rarr;</a>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px 4px;">
              <div style="font-weight:700;color:#111827;font-size:15px;margin:0 0 6px;">🏅 How the top 4 scores</div>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;">
                ${ruleRow(`${PLAYOFF_PICK_POINTS.champion} pts`, '1st place &mdash; champion')}
                ${ruleRow(`${PLAYOFF_PICK_POINTS.runner_up} pts`, '2nd, 3rd &amp; 4th place (each)')}
                ${ruleRow(`${PLAYOFF_PICK_WRONG_PLACE_POINTS} pts`, 'Right team, wrong place (still in the top 4)')}
                ${ruleRow(`+${PLAYOFF_PICK_ALL_EXACT_BONUS}`, '<strong>BONUS</strong> &mdash; all four placings exactly right')}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 4px;">
              <div style="font-weight:700;color:#111827;font-size:15px;margin:0 0 6px;">📊 Three leaderboards, automatically</div>
              <p style="margin:0 0 10px;color:#374151;font-size:14px;line-height:1.55;">
                Every leaderboard now splits three ways &mdash; and so does <strong>every league you&rsquo;re already in</strong>, with nothing to set up:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;">
                ${boardRow('🏆', 'Overall', 'Group stage and play-off combined &mdash; the grand total.')}
                ${boardRow('⚽', 'Group stage only', 'Just the points from the group phase.')}
                ${boardRow('🥇', 'Play-off only', 'Just the knockout points &mdash; a clean fresh start for everyone.')}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px 4px;">
              <div style="background:#fbf3f7;border:1px solid #f0d6e2;border-radius:10px;padding:14px 16px;color:#6f003c;font-size:14px;line-height:1.5;">
                💡 Missed the group stage, or want a fresh contest with friends? You can still
                <strong>create a brand-new league</strong> and play <strong>play-off only</strong> &mdash; everyone starts from zero.
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 28px 36px;">
              <a href="${leaderboardUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">See the Leaderboard &rarr;</a>
              <span style="color:#d1d5db;margin:0 8px;">·</span>
              <a href="${leaguesUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">Create a league &rarr;</a>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:16px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              You received this e-mail because you played the Pick&rsquo;em on Knockouts.in. Manage your
              <a href="${settingsUrl}" style="color:#6b7280;text-decoration:underline;">notification settings</a>.
              <br/>
              <a href="${SITE_URL}" style="color:#6b7280;text-decoration:underline;">Knockouts.in</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return { subject: PLAYOFF_OPEN_SUBJECT, html };
}
