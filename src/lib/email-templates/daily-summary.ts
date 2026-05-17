import { SITE_URL } from '@/lib/seo';

export interface NewLeagueSummary {
  code: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: Date;
}

export interface NewUserSummary {
  email: string;
  name: string;
  createdAt: Date;
  joinedLeagueCount: number;
}

export interface DailySummaryEmailData {
  windowStart: Date;
  windowEnd: Date;
  newLeagues: NewLeagueSummary[];
  joinsLast24h: number;
  totalLeagues: number;
  totalUniqueMembers: number;
  newUsers: NewUserSummary[];
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

function fmtUtc(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function tile(label: string, value: string | number, sub?: string): string {
  const subHtml = sub
    ? `<div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.4;">${esc(sub)}</div>`
    : '';
  return `
    <td valign="top" style="padding:6px;width:33.33%;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
        <tr>
          <td style="padding:18px 16px;text-align:center;">
            <div style="font-size:11px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:6px;">${esc(label)}</div>
            <div style="font-size:32px;font-weight:800;color:#6f003c;line-height:1.1;">${esc(String(value))}</div>
            ${subHtml}
          </td>
        </tr>
      </table>
    </td>`;
}

export function buildDailySummaryEmail(data: DailySummaryEmailData): TemplateOutput {
  const dateLabel = fmtUtc(data.windowEnd);
  const subject = `Knockouts.in daily summary — ${dateLabel}`;

  const adminUrl = `${SITE_URL}/admin`;

  const newLeaguesRows = data.newLeagues.length === 0
    ? `<tr><td style="padding:14px 16px;color:#6b7280;font-size:13px;font-style:italic;">No new leagues in the last 24h.</td></tr>`
    : data.newLeagues.map((l) => `
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #f3f4f6;font-size:13px;color:#1f2937;">
            <div style="font-weight:700;color:#111827;">${esc(l.name)}
              <span style="display:inline-block;background:#1f2937;color:#f9fafb;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:0.08em;padding:1px 6px;border-radius:3px;margin-left:6px;">${esc(l.code.toUpperCase())}</span>
            </div>
            <div style="color:#6b7280;font-size:12px;margin-top:3px;">
              by ${esc(l.ownerName || l.ownerEmail)} &middot; ${esc(fmtUtc(l.createdAt))}
            </div>
          </td>
        </tr>`).join('');

  const newUsersRows = data.newUsers.length === 0
    ? `<tr><td colspan="3" style="padding:14px 16px;color:#6b7280;font-size:13px;font-style:italic;">No new sign-ups in the last 24h.</td></tr>`
    : data.newUsers.map((u) => `
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:13px;color:#1f2937;vertical-align:top;">
            <div style="font-weight:600;color:#111827;">${esc(u.name || '—')}</div>
            <div style="color:#6b7280;font-size:12px;">${esc(u.email)}</div>
          </td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:12px;color:#374151;white-space:nowrap;vertical-align:top;">
            ${esc(fmtUtc(u.createdAt))}
          </td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:center;vertical-align:top;">
            ${u.joinedLeagueCount > 0 ? `${u.joinedLeagueCount} league${u.joinedLeagueCount === 1 ? '' : 's'}` : '<span style="color:#9ca3af;">—</span>'}
          </td>
        </tr>`).join('');

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
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">

          <tr>
            <td style="background:linear-gradient(135deg,#6f003c,#b3005f);color:#ffffff;padding:22px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:0.9;">Knockouts.in &middot; Admin</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">Daily Summary</div>
              <div style="font-size:12px;margin-top:6px;opacity:0.85;">
                ${esc(fmtUtc(data.windowStart))} → ${esc(fmtUtc(data.windowEnd))}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 22px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${tile('New leagues (24h)', data.newLeagues.length)}
                  ${tile('New league joins (24h)', data.joinsLast24h, 'across all leagues')}
                  ${tile('All-time totals', `${data.totalLeagues} / ${data.totalUniqueMembers}`, 'leagues / unique members')}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 22px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;">New leagues — last 24h</div>
                  </td>
                </tr>
                ${newLeaguesRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 22px 22px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;">New sign-ups — last 24h (${data.newUsers.length})</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr>
                          <th align="left" style="padding:8px 14px;background:#f9fafb;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#6b7280;font-weight:700;">User</th>
                          <th align="left" style="padding:8px 14px;background:#f9fafb;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#6b7280;font-weight:700;white-space:nowrap;">Registered</th>
                          <th align="center" style="padding:8px 14px;background:#f9fafb;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#6b7280;font-weight:700;">Leagues</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${newUsersRows}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:4px 28px 22px;">
              <a href="${adminUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;font-size:14px;">
                Open admin dashboard &rarr;
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:14px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              Generated by the scraper cron at 03:00 UTC.
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

  return { subject, html };
}
