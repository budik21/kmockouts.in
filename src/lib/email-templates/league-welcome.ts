import { SITE_URL } from '@/lib/seo';

const PAYPAL_BUTTON_ID = 'KL6HYXE53XDTG';

export interface LeagueWelcomeEmailData {
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

export function buildLeagueWelcomeEmail(data: LeagueWelcomeEmailData): TemplateOutput {
  const subject = "Welcome to World Cup 2026 Pick'em game!";

  const tipsUrl = `${SITE_URL}/pickem/tips`;
  const notificationsUrl = `${SITE_URL}/me/notifications`;
  const homeUrl = SITE_URL;
  const paypalUrl = `https://www.paypal.com/donate/?hosted_button_id=${PAYPAL_BUTTON_ID}`;

  const firstName = (data.userName || '').trim().split(/\s+/)[0] || 'there';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#6f003c,#b3005f);color:#ffffff;padding:24px 28px;text-align:center;">
              <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Knockouts.in &middot; Pick&rsquo;em</div>
              <div style="font-size:22px;font-weight:700;margin-top:4px;">World Cup 2026 Predictions</div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:40px 28px 12px;">
              <div style="font-size:88px;line-height:1;">&#127919;</div>
              <h1 style="font-size:24px;margin:20px 0 8px;color:#111827;">Welcome aboard, ${esc(firstName)}!</h1>
              <p style="margin:0 auto;max-width:480px;color:#374151;font-size:15px;line-height:1.6;">
                You&rsquo;re officially in. Pick&rsquo;em is our friendly little tipping game for the
                FIFA World Cup 2026 group stage &mdash; here&rsquo;s the gist before you start.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:12px;">How it works</div>
                    <ul style="margin:0;padding-left:20px;color:#1f2937;font-size:14px;line-height:1.65;">
                      <li style="margin-bottom:10px;">You predict scores for all <strong>group-stage matches</strong> &mdash; the first 48 games. No knockouts; the bracket plays itself out.</li>
                      <li style="margin-bottom:10px;">Tips can be entered or changed anytime, but each match&rsquo;s tip <strong>locks at kick-off</strong>.</li>
                      <li style="margin-bottom:10px;">Scoring is simple: <strong>4 points</strong> for the exact score, <strong>1 point</strong> for the correct winner or draw, <strong>0 points</strong> otherwise.</li>
                      <li style="margin-bottom:10px;">Want results delivered? Opt in to <a href="${notificationsUrl}" style="color:#6f003c;font-weight:600;text-decoration:none;">e-mail notifications</a> and we&rsquo;ll send your score after each match you tipped.</li>
                      <li style="margin-bottom:10px;">There&rsquo;s a global, world-wide leaderboard everyone can climb &mdash; but if you&rsquo;d rather keep your tips private, you can opt out of the public ranking from your profile.</li>
                      <li style="margin-bottom:0;">Playing with friends? <strong>Create your own private league</strong>, share the 6-character code, and you&rsquo;ll have your own little leaderboard. Your tips count once and score in every league you&rsquo;re part of.</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 28px 12px;">
              <a href="${tipsUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px;">
                Open Pick&rsquo;em &rarr;
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
                <tr>
                  <td align="center" style="padding-top:26px;">
                    <div style="font-size:34px;line-height:1;margin-bottom:8px;">&#128202;</div>
                    <h2 style="font-size:18px;margin:0 0 10px;color:#111827;">More than just picks</h2>
                    <p style="margin:0 auto 14px;max-width:480px;color:#374151;font-size:14px;line-height:1.6;">
                      Once the group stage gets going, knockouts.in keeps live
                      <strong>progression scenarios</strong> and predictions for every team
                      &mdash; who needs what, who goes through if X happens, and what the
                      bracket might look like by the final whistle.
                    </p>
                    <a href="${homeUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:14px;">
                      Explore the World Cup hub &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#fffbf0;padding:26px 28px;border-top:1px solid #f4e0a8;text-align:center;">
              <div style="font-size:30px;line-height:1;margin-bottom:8px;">&#128155;</div>
              <p style="margin:0 auto 14px;max-width:460px;color:#1f2937;font-size:14px;line-height:1.6;">
                Knockouts.in is <strong>completely free</strong> and has zero ads.<br/>
                If it brightens your World Cup, feel free to chip in a dollar, two, or two hundred &mdash; entirely up to you.
              </p>
              <a href="${paypalUrl}" target="_blank" style="display:inline-block;background:#0070ba;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;font-size:14px;">
                Donate via PayPal
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:14px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              You&rsquo;re receiving this once because you just joined your first Pick&rsquo;em league.
              <br/>
              <a href="${notificationsUrl}" style="color:#6b7280;text-decoration:underline;">Notification settings</a>
              &nbsp;&middot;&nbsp;
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

  return { subject, html };
}
