import { SITE_URL } from '@/lib/seo';
import { slugify } from '@/lib/slugify';

export type TipResultKind = 'exact' | 'winner' | 'miss';

export interface TipResultEmailData {
  userName: string;
  points: 0 | 1 | 4;
  match: {
    groupId: string;
    kickOff: string;
    homeGoals: number;
    awayGoals: number;
  };
  tip: {
    homeGoals: number;
    awayGoals: number;
  };
  homeTeam: { id: number; name: string; countryCode: string };
  awayTeam: { id: number; name: string; countryCode: string };
  homeArticle?: { headline: string; lede: string };
  awayArticle?: { headline: string; lede: string };
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

function flagImg(code: string, alt: string): string {
  if (!code) return '';
  // Use the same `flag-icons` SVG asset the website renders (via the `fi-*`
  // CSS classes) so emails match the on-site look exactly — flat rectangular
  // flags, never the waved/3D style that flagcdn's PNG endpoint can return
  // depending on the country and that reads poorly in dark-mode mail clients.
  // jsdelivr serves the same files straight from the npm package; the version
  // is pinned to match `package.json` so a future bump won't silently change
  // the rendered flag set. Subdivision codes like "gb-sct" pass through as-is
  // because flag-icons supports them natively.
  const lower = code.toLowerCase();
  const url = `https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${lower}.svg`;
  return `<img src="${url}" width="36" height="27" alt="${esc(alt)}" style="display:inline-block;vertical-align:middle;border:1px solid rgba(0,0,0,0.08);border-radius:2px;margin:0 6px;background:#ffffff;" />`;
}

function kindFromPoints(points: 0 | 1 | 4): TipResultKind {
  if (points === 4) return 'exact';
  if (points === 1) return 'winner';
  return 'miss';
}

const VARIANTS: Record<TipResultKind, { emoji: string; subject: string; headline: string; badge: string; badgeColor: string }> = {
  exact: {
    emoji: '🎯',
    subject: "knockouts.in: Exact tip! +4 points 🎯",
    headline: 'Bullseye! You nailed the exact score.',
    badge: '+4',
    badgeColor: '#16a34a',
  },
  winner: {
    emoji: '✅',
    subject: "knockouts.in: You picked the winner! +1 point",
    headline: 'Nice — correct outcome, just not the exact score.',
    badge: '+1',
    badgeColor: '#2563eb',
  },
  miss: {
    emoji: '😢',
    subject: "knockouts.in: Tough luck — 0 points this time",
    headline: 'Not this time. Your tip didn\'t match the result.',
    badge: '0',
    badgeColor: '#64748b',
  },
};

function renderArticleBlock(
  team: { name: string; countryCode: string },
  article: { headline: string; lede: string } | undefined,
  readMoreUrl: string,
): string {
  if (!article) return '';
  return `
          <tr>
            <td style="padding:16px 28px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">
                      ${flagImg(team.countryCode, team.name)}<span style="vertical-align:middle;">${esc(team.name)}</span>
                    </div>
                    <h2 style="margin:0 0 8px;font-size:17px;color:#111827;font-weight:700;line-height:1.3;">${esc(article.headline)}</h2>
                    <p style="margin:0 0 10px;color:#374151;font-size:14px;line-height:1.5;">${esc(article.lede)}</p>
                    <a href="${readMoreUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">Read more &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function buildTipResultEmail(data: TipResultEmailData): TemplateOutput {
  const kind = kindFromPoints(data.points);
  const v = VARIANTS[kind];

  const groupSlug = `group-${data.match.groupId.toLowerCase()}`;
  const teamUrl = (name: string) => `${SITE_URL}/worldcup2026/${groupSlug}/team/${slugify(name)}`;
  const groupUrl = `${SITE_URL}/worldcup2026/${groupSlug}`;
  const leaderboardUrl = `${SITE_URL}/pickem/leaderboard`;
  const unsubscribeUrl = `${SITE_URL}/pickem/tips?tab=settings`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(v.subject)}</title>
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
              <div style="font-size:84px;line-height:1;">${v.emoji}</div>
              <div style="display:inline-block;margin-top:16px;padding:6px 18px;border-radius:999px;background:${v.badgeColor};color:#ffffff;font-weight:700;font-size:18px;">${v.badge} pts</div>
              <h1 style="font-size:22px;margin:18px 0 0;color:#111827;">${esc(v.headline)}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td align="center" style="padding:18px 14px;">
                    <div style="font-size:12px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Group ${esc(data.match.groupId)}</div>
                    <div style="font-size:18px;font-weight:600;color:#111827;">
                      ${flagImg(data.homeTeam.countryCode, data.homeTeam.name)}
                      ${esc(data.homeTeam.name)}
                      <span style="color:#6b7280;font-weight:400;">&nbsp;vs&nbsp;</span>
                      ${esc(data.awayTeam.name)}
                      ${flagImg(data.awayTeam.countryCode, data.awayTeam.name)}
                    </div>
                    <div style="margin-top:14px;display:inline-block;">
                      <table cellpadding="0" cellspacing="0"><tr>
                        <td style="padding:8px 14px;text-align:center;">
                          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Your tip</div>
                          <div style="font-size:26px;font-weight:700;color:#1f2937;">${data.tip.homeGoals} : ${data.tip.awayGoals}</div>
                        </td>
                        <td style="padding:8px 14px;text-align:center;border-left:1px solid #e5e7eb;">
                          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Final result</div>
                          <div style="font-size:26px;font-weight:700;color:#111827;">${data.match.homeGoals} : ${data.match.awayGoals}</div>
                        </td>
                      </tr></table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${renderArticleBlock(data.homeTeam, data.homeArticle, teamUrl(data.homeTeam.name))}
          ${renderArticleBlock(data.awayTeam, data.awayArticle, teamUrl(data.awayTeam.name))}

          <tr>
            <td style="padding:16px 28px 4px;">
              <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.5;">
                Check out the updated group standings and what each team now needs to
                progress through the knockout rounds.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:8px 28px 28px;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding:6px;">
                  <a href="${groupUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">Group ${esc(data.match.groupId)} table</a>
                </td>
                <td style="padding:6px;">
                  <a href="${teamUrl(data.homeTeam.name)}" style="display:inline-block;background:#ffffff;color:#6f003c;border:1px solid #6f003c;text-decoration:none;padding:10px 14px;border-radius:6px;font-weight:600;font-size:13px;">${esc(data.homeTeam.name)}</a>
                </td>
                <td style="padding:6px;">
                  <a href="${teamUrl(data.awayTeam.name)}" style="display:inline-block;background:#ffffff;color:#6f003c;border:1px solid #6f003c;text-decoration:none;padding:10px 14px;border-radius:6px;font-weight:600;font-size:13px;">${esc(data.awayTeam.name)}</a>
                </td>
              </tr></table>
              <div style="margin-top:10px;">
                <a href="${leaderboardUrl}" style="color:#6f003c;text-decoration:none;font-weight:600;font-size:13px;">View the leaderboard &rarr;</a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:16px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              You received this e-mail because tip-result notifications are turned on
              in your Knockouts.in profile. If you&rsquo;d rather not get these,
              <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">change your notification settings</a>.
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

  return { subject: v.subject, html };
}
