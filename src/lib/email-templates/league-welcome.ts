import { SITE_URL } from '@/lib/seo';

const PAYPAL_BUTTON_ID = 'KL6HYXE53XDTG';

export interface LeagueWelcomeEmailData {
  userName: string;
  leagueName: string;
  leagueCode: string;
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
  const leaguesUrl = `${SITE_URL}/pickem/tips?tab=leagues`;
  const notificationsUrl = `${SITE_URL}/pickem/tips?tab=settings`;
  const homeUrl = SITE_URL;
  const paypalUrl = `https://www.paypal.com/donate/?hosted_button_id=${PAYPAL_BUTTON_ID}`;

  const firstName = (data.userName || '').trim().split(/\s+/)[0] || 'there';
  const leagueName = (data.leagueName || '').trim();
  const leagueCode = (data.leagueCode || '').trim().toUpperCase();

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
            <td align="center" style="padding:36px 28px 8px;">
              <div style="font-size:72px;line-height:1;">&#127919;</div>
              <h1 style="font-size:24px;margin:18px 0 8px;color:#111827;">Welcome aboard, ${esc(firstName)}!</h1>
              <p style="margin:0 auto;max-width:480px;color:#374151;font-size:15px;line-height:1.6;">
                You&rsquo;re officially in. Here&rsquo;s the 30-second tour of our Pick&rsquo;em game for the
                FIFA World Cup 2026 group stage.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Get started in 3 steps</div>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                      <tr>
                        <td valign="top" width="44" style="width:44px;padding-right:12px;">
                          <div style="width:32px;height:32px;border-radius:50%;background:#16a34a;color:#ffffff;font-size:16px;font-weight:800;line-height:32px;text-align:center;">&#10003;</div>
                        </td>
                        <td valign="top" style="color:#1f2937;font-size:14px;line-height:1.5;">
                          <div style="font-weight:700;color:#111827;">You&rsquo;re in: ${esc(leagueName)}</div>
                          <div style="color:#374151;font-size:13px;">
                            Joined via code
                            <span style="display:inline-block;background:#1f2937;color:#f9fafb;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12px;font-weight:700;letter-spacing:0.08em;padding:2px 8px;border-radius:4px;vertical-align:1px;">${esc(leagueCode)}</span>
                            &mdash; share that with friends to pull them into the same standings.
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                      <tr>
                        <td valign="top" width="44" style="width:44px;padding-right:12px;">
                          <div style="width:32px;height:32px;border-radius:50%;background:#d4a843;color:#1a1a1a;font-size:14px;font-weight:800;line-height:32px;text-align:center;">2</div>
                        </td>
                        <td valign="top" style="color:#1f2937;font-size:14px;line-height:1.5;">
                          <div style="font-weight:700;color:#111827;">Predict the scores</div>
                          <div style="color:#374151;font-size:13px;">
                            <a href="${tipsUrl}" style="color:#6f003c;font-weight:600;text-decoration:none;">Fill in your tips</a>
                            for the 72 group-stage matches. Each tip locks at kick-off. Earn
                            <strong>4 pts</strong> for the exact score, <strong>1 pt</strong> for the right winner, <strong>0 pts</strong> otherwise.
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td valign="top" width="44" style="width:44px;padding-right:12px;">
                          <div style="width:32px;height:32px;border-radius:50%;background:#d4a843;color:#1a1a1a;font-size:14px;font-weight:800;line-height:32px;text-align:center;">3</div>
                        </td>
                        <td valign="top" style="color:#1f2937;font-size:14px;line-height:1.5;">
                          <div style="font-weight:700;color:#111827;">Climb the leaderboard</div>
                          <div style="color:#374151;font-size:13px;">
                            Race the world on the global ranking &mdash; and every private league you join
                            keeps its own leaderboard for you and your friends.
                          </div>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:18px 24px;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:10px;">Good to know</div>
                    <ul style="margin:0;padding-left:20px;color:#1f2937;font-size:13px;line-height:1.6;">
                      <li style="margin-bottom:8px;">It&rsquo;s just the group stage &mdash; once those 72 games are done, the knockout bracket plays itself out.</li>
                      <li style="margin-bottom:8px;">Turn on <a href="${notificationsUrl}" style="color:#6f003c;font-weight:600;text-decoration:none;">e-mail notifications</a> to get your result after every match you tipped.</li>
                      <li style="margin-bottom:8px;">Your name shows on the public leaderboard by default &mdash; you can hide it from your profile.</li>
                      <li style="margin-bottom:8px;">Playing in several leagues? Each tip counts once and scores in every league you&rsquo;re part of.</li>
                      <li style="margin-bottom:0;">Want your own league? On the <a href="${leaguesUrl}" style="color:#6f003c;font-weight:600;text-decoration:none;">Leagues tab</a> in Pick&rsquo;em, hit <strong>Create</strong> &mdash; you can run up to <strong>3</strong> of your own and invite friends with a 6-char code or link.</li>
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
                    <div style="font-size:34px;line-height:1;margin-bottom:8px;">&#128302;</div>
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
              You&rsquo;re receiving this once because you just joined your first Knockouts.in Pick&rsquo;em league.
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
