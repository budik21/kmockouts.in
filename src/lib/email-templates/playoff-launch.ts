import { SITE_URL } from '@/lib/seo';
import {
  PLAYOFF_PICK_POINTS,
  PLAYOFF_PICK_WRONG_PLACE_POINTS,
  PLAYOFF_PICK_ALL_EXACT_BONUS,
  KO_EXACT_POINTS,
  KO_ADVANCE_POINTS,
} from '@/lib/playoff-scoring';

export interface PlayoffLaunchEmailData {
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

export const PLAYOFF_LAUNCH_SUBJECT =
  'Call the champion 🏆 — Play-off Pick’em is coming';

/**
 * "Play-off Pick'em promo" campaign: announces the launch of the knockout-stage
 * prediction game. One CTA pointing to the play-off landing page. Sent to
 * tipsters who placed at least one group-stage tip. Visual shell matches the
 * other admin campaign e-mails.
 */
export function buildPlayoffLaunchEmail(data: PlayoffLaunchEmailData): TemplateOutput {
  const landingUrl = `${SITE_URL}/pickem/playoff`;
  const leaderboardUrl = `${SITE_URL}/pickem/leaderboard`;
  const settingsUrl = `${SITE_URL}/pickem/tips?tab=settings`;

  const ruleRow = (pts: string, text: string) => `
    <tr>
      <td style="padding:4px 10px 4px 0;vertical-align:top;white-space:nowrap;">
        <span style="display:inline-block;background:#6f003c;color:#ffffff;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px;">${pts}</span>
      </td>
      <td style="padding:4px 0;color:#374151;font-size:14px;line-height:1.5;">${text}</td>
    </tr>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(PLAYOFF_LAUNCH_SUBJECT)}</title>
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
              <div style="font-size:84px;line-height:1;">🏆</div>
              <h1 style="font-size:22px;margin:18px 0 0;color:#111827;">The group stage is wrapping up &mdash; the knockouts are next.</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 4px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                You played the group stage &mdash; now keep going. The <strong>Play-off Pick&rsquo;em</strong>
                lets you call the champion, name the medalists and tip your way through the entire bracket.
              </p>

              <div style="font-weight:700;color:#111827;font-size:15px;margin:0 0 6px;">⚔️ Every knockout match</div>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
                ${ruleRow(`${KO_EXACT_POINTS} pts`, 'Exact score after 90 minutes')}
                ${ruleRow(`${KO_ADVANCE_POINTS} pts`, 'Correctly picking who advances')}
              </table>

              <div style="font-weight:700;color:#111827;font-size:15px;margin:0 0 6px;">🏅 Your top 4</div>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 6px;">
                ${ruleRow(`${PLAYOFF_PICK_POINTS.champion} pts`, '1st place &mdash; champion')}
                ${ruleRow(`${PLAYOFF_PICK_POINTS.runner_up} pts`, '2nd, 3rd &amp; 4th place (each)')}
                ${ruleRow(`${PLAYOFF_PICK_WRONG_PLACE_POINTS} pts`, 'Right team, wrong place (still in the top 4)')}
                ${ruleRow(`+${PLAYOFF_PICK_ALL_EXACT_BONUS}`, '<strong>BONUS</strong> &mdash; all four placings exactly right')}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px 4px;">
              <div style="background:#fbf3f7;border:1px solid #f0d6e2;border-radius:10px;padding:14px 16px;color:#6f003c;font-size:14px;line-height:1.5;">
                🗓️ Tipping goes live the moment the last group match is decided.
                Come back then to make your picks.
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 28px 36px;">
              <a href="${landingUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">See the Play-off Pick&rsquo;em &rarr;</a>
              <div style="margin-top:14px;">
                <a href="${leaderboardUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">See the Leaderboard &rarr;</a>
              </div>
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

  return { subject: PLAYOFF_LAUNCH_SUBJECT, html };
}
