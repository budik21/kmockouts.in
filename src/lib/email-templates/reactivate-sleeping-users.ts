import { SITE_URL } from '@/lib/seo';

export interface ReactivationEmailData {
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

export const REACTIVATION_SUBJECT =
  'knockouts.in: The World Cup is about to kick off — your tips are waiting ⚽';

/**
 * "Reactivate sleeping users" campaign e-mail: sent to tipsters who signed up
 * for the Pick'em but have placed at most one tip. One big CTA pointing to
 * the tips page. Visual shell matches the tip-result e-mail.
 */
export function buildReactivationEmail(data: ReactivationEmailData): TemplateOutput {
  const tipsUrl = `${SITE_URL}/pickem/tips`;
  const leaderboardUrl = `${SITE_URL}/pickem/leaderboard`;
  const settingsUrl = `${SITE_URL}/pickem/tips?tab=settings`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(REACTIVATION_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#6f003c,#b3005f);color:#ffffff;padding:22px 28px;">
              <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">Knockouts.in · Pick&rsquo;em</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">Hi ${esc(data.userName || 'there')}!</div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:36px 28px 8px;">
              <div style="font-size:84px;line-height:1;">⚽</div>
              <h1 style="font-size:22px;margin:18px 0 0;color:#111827;">The whistle is about to blow &mdash; and your card is nearly blank.</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 4px;">
              <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">
                The 2026 FIFA World Cup kicks off any moment now &mdash; and your
                Pick&rsquo;em predictions are still missing. Don&rsquo;t let the opening
                games pass you by while everyone else is racking up points.
              </p>
              <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">
                It takes just a couple of minutes: pick your scores and hit save. An exact
                score is worth <strong>4&nbsp;points</strong>, the correct winner gets you
                <strong>1&nbsp;point</strong> &mdash; every match is a chance to climb.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:16px 28px 36px;">
              <a href="${tipsUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">Place your tips now</a>
              <div style="margin-top:14px;">
                <a href="${leaderboardUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">See the Leaderboard &rarr;</a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:16px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              You received this e-mail because you signed up for the Pick&rsquo;em on
              Knockouts.in. Manage your
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

  return { subject: REACTIVATION_SUBJECT, html };
}
