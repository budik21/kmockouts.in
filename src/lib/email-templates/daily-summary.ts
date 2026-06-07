import { SITE_URL } from '@/lib/seo';
import { DRAW_COLOR, matchColors } from '@/lib/flag-colors';

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

/** Aggregated tip distribution for a single match kicking off within 24h. */
export interface UpcomingMatchTips {
  homeName: string;
  homeShort: string;
  homeCc: string;
  awayName: string;
  awayShort: string;
  awayCc: string;
  kickOff: Date;
  totalTips: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  /** Most frequently tipped exact scoreline, or null when there are no tips. */
  topScore: { homeGoals: number; awayGoals: number; count: number } | null;
}

export interface DailySummaryEmailData {
  windowStart: Date;
  windowEnd: Date;
  // Headline metrics — each rendered as its own stacked widget.
  newUsers24h: number;
  totalUsers: number;
  newTips24h: number;
  totalTips: number;
  usersWithoutTip: number;
  // "ready for the next 24h" split — only meaningful when upcomingMatchCount > 0.
  upcomingMatchCount: number;
  usersNotReady: number;
  usersReady: number;
  newLeaguesCount: number;
  totalLeagues: number;
  // Detail sections.
  upcomingMatches: UpcomingMatchTips[];
  newLeagues: NewLeagueSummary[];
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

function fmtTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Full-width metric widget: title, big "value", and an explanatory description.
 * Widgets stack vertically (one metric per row), as requested.
 */
function widget(title: string, value: string, description: string): string {
  return `
    <tr>
      <td style="padding:7px 22px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="font-size:11px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;">${esc(title)}</div>
              <div style="font-size:30px;font-weight:800;color:#6f003c;line-height:1.15;margin-top:4px;">${esc(value)}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:5px;line-height:1.45;">${esc(description)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Horizontal three-segment ratio bar (home | draw | away) for one match. */
function ratioBar(m: UpcomingMatchTips): string {
  const { home: homeColor, away: awayColor } = matchColors(m.homeCc, m.awayCc);

  if (m.totalTips === 0) {
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
        <tr>
          <td style="height:18px;background:#f3f4f6;border-radius:4px;"></td>
        </tr>
      </table>
      <div style="font-size:12px;color:#9ca3af;font-style:italic;margin-top:6px;">No tips placed yet.</div>`;
  }

  const homePct = Math.round((m.homeWins / m.totalTips) * 100);
  const drawPct = Math.round((m.draws / m.totalTips) * 100);
  const awayPct = 100 - homePct - drawPct; // absorb rounding so the bar fills exactly

  // Each segment is a coloured cell sized by its raw share. Hide zero-width
  // segments so the rounded corners stay clean.
  const seg = (pct: number, color: string) =>
    pct > 0
      ? `<td style="width:${pct}%;background:${color};height:18px;"></td>`
      : '';

  const topScore = m.topScore
    ? `${m.topScore.homeGoals}:${m.topScore.awayGoals}`
    : '—';
  const topScoreCount = m.topScore ? m.topScore.count : 0;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-radius:4px;overflow:hidden;">
      <tr>
        ${seg(homePct, homeColor)}
        ${seg(drawPct, DRAW_COLOR)}
        ${seg(awayPct, awayColor)}
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px;">
      <tr>
        <td style="font-size:12px;color:#374151;text-align:left;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${homeColor};margin-right:5px;"></span>
          <strong>${esc(m.homeShort)} ${homePct}%</strong>
        </td>
        <td style="font-size:12px;color:#374151;text-align:center;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${DRAW_COLOR};margin-right:5px;"></span>
          Draw ${drawPct}%
        </td>
        <td style="font-size:12px;color:#374151;text-align:right;">
          <strong>${awayPct}% ${esc(m.awayShort)}</strong>
          <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${awayColor};margin-left:5px;"></span>
        </td>
      </tr>
    </table>
    <div style="font-size:12px;color:#6b7280;margin-top:8px;">
      Most tipped result:
      <strong style="color:#111827;">${esc(topScore)}</strong>
      ${topScoreCount > 0 ? `<span style="color:#9ca3af;">(${topScoreCount}× of ${m.totalTips})</span>` : ''}
    </div>`;
}

function upcomingMatchBlock(m: UpcomingMatchTips): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;">
      <tr>
        <td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:14px;font-weight:700;color:#111827;">
                ${esc(m.homeName)} <span style="color:#9ca3af;font-weight:600;">vs</span> ${esc(m.awayName)}
              </td>
              <td style="font-size:12px;color:#6b7280;text-align:right;white-space:nowrap;">
                ${esc(fmtTime(m.kickOff))} &middot; ${m.totalTips} tip${m.totalTips === 1 ? '' : 's'}
              </td>
            </tr>
          </table>
          ${ratioBar(m)}
        </td>
      </tr>
    </table>`;
}

export function buildDailySummaryEmail(data: DailySummaryEmailData): TemplateOutput {
  const dateLabel = fmtUtc(data.windowEnd);
  const subject = `Knockouts.in daily summary — ${dateLabel}`;

  const adminUrl = `${SITE_URL}/admin`;

  const widgets = [
    widget(
      'New users (24h) / total',
      `${data.newUsers24h} / ${data.totalUsers}`,
      'Accounts registered in the last 24 hours, against all registered users.',
    ),
    widget(
      'New tips (24h) / total',
      `${data.newTips24h} / ${data.totalTips}`,
      'Match predictions placed in the last 24 hours, against all tips ever placed.',
    ),
    widget(
      'Users with no tip yet / total',
      `${data.usersWithoutTip} / ${data.totalUsers}`,
      'Registered users who have not placed a single tip, against all registered users.',
    ),
    data.upcomingMatchCount > 0
      ? widget(
          'Not ready for next 24h / ready',
          `${data.usersNotReady} / ${data.usersReady}`,
          `Users missing at least one tip for the ${data.upcomingMatchCount} match${data.upcomingMatchCount === 1 ? '' : 'es'} kicking off within the next 24 hours, against users who have tipped them all.`,
        )
      : widget(
          'Not ready for next 24h / ready',
          '—',
          'No matches kick off within the next 24 hours.',
        ),
    widget(
      'New leagues (24h) / total',
      `${data.newLeaguesCount} / ${data.totalLeagues}`,
      'Pick’em leagues created in the last 24 hours, against all leagues.',
    ),
  ].join('');

  const upcomingSection = data.upcomingMatches.length === 0
    ? `<div style="padding:14px 16px;color:#6b7280;font-size:13px;font-style:italic;">No matches kick off within the next 24 hours.</div>`
    : data.upcomingMatches.map(upcomingMatchBlock).join('');

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
            <td style="padding:14px 0 4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${widgets}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 22px 4px;">
              <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Tip distribution — matches in the next 24h</div>
              <div style="font-size:12px;color:#9ca3af;margin-bottom:10px;line-height:1.45;">Share of tips predicting a home win, draw or away win, plus the most popular exact score.</div>
              ${upcomingSection}
            </td>
          </tr>

          <tr>
            <td style="padding:14px 22px 4px;">
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
            <td style="padding:14px 22px 22px;">
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
