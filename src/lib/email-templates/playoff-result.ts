import { SITE_URL } from '@/lib/seo';
import { KO_EXACT_POINTS, KO_ADVANCE_POINTS } from '@/lib/playoff-scoring';

export interface PlayoffResultEmailData {
  userName: string;
  roundLabel: string;
  homeTeam: { name: string; countryCode: string };
  awayTeam: { name: string; countryCode: string };
  /** Actual 90' score. */
  homeGoals: number;
  awayGoals: number;
  /** Extra-time and penalty lines, already formatted, e.g. "AET 2–1", "pens 4–3". */
  extraLine: string | null;
  advancingName: string;
  tip: { homeGoals: number; awayGoals: number; advanceName: string };
  points: number;       // 0 / 5 / 8 / 13
  exactHit: boolean;
  advanceHit: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flag(code: string): string {
  if (!code) return '';
  const cc = code.toLowerCase();
  return `<img src="https://flagcdn.com/24x18/${cc}.png" width="24" height="18" alt="" style="vertical-align:middle;border-radius:2px;margin-right:6px" />`;
}

/** Build the play-off match-result e-mail (subject + HTML). */
export function buildPlayoffResultEmail(d: PlayoffResultEmailData): { subject: string; html: string } {
  const headline =
    d.points >= KO_EXACT_POINTS + KO_ADVANCE_POINTS ? '🎯 Perfect call!'
    : d.points > 0 ? '✅ Nice one!'
    : '😬 Not this time';

  const subject = `${headline} ${d.homeTeam.name} ${d.homeGoals}–${d.awayGoals} ${d.awayTeam.name} — ${d.points} pts`;

  const resultLine = `${flag(d.homeTeam.countryCode)}${esc(d.homeTeam.name)} <strong>${d.homeGoals}–${d.awayGoals}</strong> ${esc(d.awayTeam.name)}${flag(d.awayTeam.countryCode)}`
    + (d.extraLine ? ` <span style="color:#888">(${esc(d.extraLine)})</span>` : '');

  const breakdown = `
    <tr><td style="padding:4px 0;color:#555">Exact 90′ score (${KO_EXACT_POINTS} pts)</td>
        <td style="padding:4px 0;text-align:right;font-weight:700;color:${d.exactHit ? '#2e9e5b' : '#999'}">${d.exactHit ? `+${KO_EXACT_POINTS}` : '0'}</td></tr>
    <tr><td style="padding:4px 0;color:#555">Advancing team (${KO_ADVANCE_POINTS} pts)</td>
        <td style="padding:4px 0;text-align:right;font-weight:700;color:${d.advanceHit ? '#2e9e5b' : '#999'}">${d.advanceHit ? `+${KO_ADVANCE_POINTS}` : '0'}</td></tr>`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 4px">${headline}</h2>
    <p style="margin:0 0 16px;color:#666">${esc(d.roundLabel)} result, ${esc(d.userName)}.</p>

    <div style="background:#faf7ef;border:1px solid #e7dfc7;border-radius:10px;padding:16px 18px;margin-bottom:16px">
      <div style="font-size:16px;margin-bottom:6px">${resultLine}</div>
      <div style="color:#444;font-size:14px">${esc(d.advancingName)} advance.</div>
    </div>

    <p style="margin:0 0 6px;color:#444"><strong>Your tip:</strong> ${d.tip.homeGoals}–${d.tip.awayGoals}, ${esc(d.tip.advanceName)} to advance</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px">${breakdown}
      <tr><td style="padding:8px 0;border-top:1px solid #e7dfc7;font-weight:700">Total</td>
          <td style="padding:8px 0;border-top:1px solid #e7dfc7;text-align:right;font-weight:800;color:#b8860b">${d.points} pts</td></tr>
    </table>

    <p style="margin:18px 0 0">
      <a href="${SITE_URL}/pickem/playoff" style="background:#d4a843;color:#2a1a00;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;display:inline-block">Keep tipping the bracket →</a>
    </p>
    <p style="margin:14px 0 0"><a href="${SITE_URL}/pickem/leaderboard" style="color:#b8860b">See the play-off leaderboard</a></p>
  </div>`;

  return { subject, html };
}
