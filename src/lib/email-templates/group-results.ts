import { SITE_URL } from '@/lib/seo';
import { query } from '@/lib/db';
import { disambiguateNames } from '@/lib/name-disambiguate';

const PAYPAL_BUTTON_ID = 'KL6HYXE53XDTG';

export interface GroupResultsEmailData {
  userName: string;
}

/** One ranked group-stage finisher, shaped for the e-mail podium / Top 10. */
export interface GroupStanding {
  rank: number;
  /** Disambiguated display name (bare name + optional suffix already joined). */
  name: string;
  totalPoints: number;
  exact: number;
  outcome: number;
}

/** Shared data fetched once per send and handed to every per-recipient build(). */
export interface GroupResultsShared {
  standings: GroupStanding[];
}

interface TemplateOutput {
  subject: string;
  html: string;
}

interface GroupAggRow {
  id: number;
  name: string;
  email: string;
  exact: string;
  outcome: string;
  total: string;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GROUP_RESULTS_SUBJECT =
  '🏁 The group-stage Pick’em is a wrap — here are the final standings';

/**
 * Compute the top group-stage finishers exactly the way the public leaderboard
 * ranks its "Group stage" view: public predictors only, group points are
 * exact×4 + outcome×1, ordered by points DESC, exact DESC, outcome DESC,
 * total tips ASC, then name ASC. Same-name users get an e-mail-domain suffix.
 */
export async function fetchGroupTopStandings(limit = 10): Promise<GroupStanding[]> {
  const rows = await query<GroupAggRow>(
    `SELECT u.id, u.name, u.email,
       COUNT(*) FILTER (WHERE t.points = 4) AS exact,
       COUNT(*) FILTER (WHERE t.points = 1) AS outcome,
       COUNT(*)                             AS total
     FROM tipster_user u
     JOIN tip t ON t.user_id = u.id
     WHERE u.tips_public = true
     GROUP BY u.id, u.name, u.email`,
  );

  const suffixById = new Map(
    disambiguateNames(rows.map((r) => ({ id: r.id, name: r.name, email: r.email }))).map(
      (u) => [u.id, u.nameSuffix],
    ),
  );

  const n = (v: string) => parseInt(v, 10) || 0;

  return rows
    .map((r) => {
      const exact = n(r.exact);
      const outcome = n(r.outcome);
      const suffix = suffixById.get(r.id);
      return {
        name: suffix ? `${r.name} (${suffix})` : r.name,
        totalPoints: exact * 4 + outcome,
        exact,
        outcome,
        totalTips: n(r.total),
        sortName: r.name,
      };
    })
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.exact - a.exact ||
        b.outcome - a.outcome ||
        a.totalTips - b.totalTips ||
        a.sortName.localeCompare(b.sortName),
    )
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      totalPoints: r.totalPoints,
      exact: r.exact,
      outcome: r.outcome,
    }));
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * "Group stage is a wrap" campaign: sent once the group-stage Pick'em is fully
 * scored. Celebrates the top 3 with medals, lists the Top 10, links to the full
 * leaderboard, then hands off to the now-live Play-off Pick'em and closes with a
 * support-us (PayPal) ask. Default recipients: everyone who scored at least one
 * group-stage point. Visual shell matches the other admin campaign e-mails.
 */
export function buildGroupResultsEmail(
  data: GroupResultsEmailData,
  shared?: GroupResultsShared,
): TemplateOutput {
  const leaderboardUrl = `${SITE_URL}/pickem/leaderboard`;
  const playoffUrl = `${SITE_URL}/pickem/playoff`;
  const settingsUrl = `${SITE_URL}/pickem/tips?tab=settings`;
  const paypalUrl = `https://www.paypal.com/donate/?hosted_button_id=${PAYPAL_BUTTON_ID}`;

  const standings = shared?.standings ?? [];
  const podium = standings.slice(0, 3);

  const podiumCard = (s: GroupStanding) => `
    <td align="center" width="33%" style="padding:6px;vertical-align:bottom;">
      <div style="background:#fbf3f7;border:1px solid #f0d6e2;border-radius:12px;padding:16px 8px;">
        <div style="font-size:40px;line-height:1;">${MEDALS[s.rank - 1]}</div>
        <div style="font-weight:700;color:#111827;font-size:14px;margin:8px 0 2px;word-break:break-word;">${esc(s.name)}</div>
        <div style="color:#6f003c;font-weight:700;font-size:18px;">${s.totalPoints}<span style="font-size:12px;font-weight:600;color:#9b3a6a;"> pts</span></div>
      </div>
    </td>`;

  const podiumBlock = podium.length
    ? `
          <tr>
            <td style="padding:8px 20px 4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>${podium.map(podiumCard).join('')}</tr>
              </table>
            </td>
          </tr>`
    : '';

  const tableRow = (s: GroupStanding) => {
    const badge = s.rank <= 3 ? MEDALS[s.rank - 1] : `${s.rank}`;
    const highlight = s.rank <= 3 ? 'background:#fbf3f7;' : '';
    return `
        <tr style="${highlight}">
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:#6f003c;font-size:14px;width:38px;border-bottom:1px solid #eef0f3;">${badge}</td>
          <td style="padding:8px 10px;color:#111827;font-size:14px;border-bottom:1px solid #eef0f3;word-break:break-word;">${esc(s.name)}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:#111827;font-size:14px;border-bottom:1px solid #eef0f3;white-space:nowrap;">${s.totalPoints} pts</td>
        </tr>`;
  };

  const top10Block = standings.length
    ? `
          <tr>
            <td style="padding:18px 28px 4px;">
              <div style="font-weight:700;color:#111827;font-size:15px;margin:0 0 8px;">📊 Final Top 10 &mdash; group stage</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f3;border-radius:10px;overflow:hidden;">
                ${standings.map(tableRow).join('')}
              </table>
            </td>
          </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(GROUP_RESULTS_SUBJECT)}</title>
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
              <div style="font-size:84px;line-height:1;">🏁</div>
              <h1 style="font-size:22px;margin:18px 0 0;color:#111827;">The group-stage Pick&rsquo;em is a wrap!</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px 4px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                Every group-stage match is played and scored &mdash; thanks for tipping along with us.
                Time to crown the sharpest predictors of the group phase. 👏
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:6px 28px 0;">
              <div style="font-weight:700;color:#111827;font-size:16px;">🏆 Your group-stage podium</div>
            </td>
          </tr>
${podiumBlock}
${top10Block}

          <tr>
            <td align="center" style="padding:18px 28px 6px;">
              <a href="${leaderboardUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:700;font-size:15px;">See the full leaderboard &rarr;</a>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 4px;">
              <div style="background:#fff4ed;border:1px solid #f7caa6;border-left:4px solid #e8590c;border-radius:10px;padding:16px 18px;color:#7a3408;font-size:14px;line-height:1.55;">
                <div style="font-size:15px;font-weight:700;color:#b34700;margin-bottom:6px;">🚀 The Play-off Pick&rsquo;em is now LIVE</div>
                The group stage is done, but the points keep coming. Call the <strong>champion</strong>,
                name the rest of the top 4 and tip your way through the entire knockout bracket &mdash;
                a clean fresh start for everyone.
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:16px 28px 8px;">
              <a href="${playoffUrl}" style="display:inline-block;background:#6f003c;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:16px;">Make your play-off picks &rarr;</a>
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
                Support us via PayPal
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:16px 28px;color:#6b7280;font-size:12px;text-align:center;border-top:1px solid #e5e7eb;">
              You received this e-mail because you played the group-stage Pick&rsquo;em on Knockouts.in. Manage your
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

  return { subject: GROUP_RESULTS_SUBJECT, html };
}
