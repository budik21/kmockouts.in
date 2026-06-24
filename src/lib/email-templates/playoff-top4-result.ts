import { SITE_URL } from '@/lib/seo';
import { PLAYOFF_PICK_ALL_EXACT_BONUS } from '@/lib/playoff-scoring';
import type { PlayoffPickSlot } from '@/lib/playoff-scoring';

export type Top4PickStatus = 'exact' | 'in-top4' | 'missed';

export interface Top4PickLine {
  slot: PlayoffPickSlot;
  slotLabel: string;        // "1st — Champion", "2nd place", …
  pickedTeam: string;
  /** Points for this slot, EXCLUDING the all-exact bonus. */
  points: number;
  status: Top4PickStatus;
}

export interface Top4ResultEmailData {
  userName: string;
  picks: Top4PickLine[];    // four lines, in slot order
  actual: { champion: string; runnerUp: string; third: string; fourth: string };
  totalPoints: number;      // total play-off-pick points, INCLUDING the bonus
  hasBonus: boolean;
}

export type Top4Bucket = 'flawless' | 'all-four' | 'champion' | 'partial' | 'missed';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Collapse the many possible per-pick combinations into one of five buckets. */
export function top4Bucket(picks: Top4PickLine[]): Top4Bucket {
  const exact = picks.filter((p) => p.status === 'exact').length;
  const inTop4 = picks.filter((p) => p.status !== 'missed').length;
  const championExact = picks.find((p) => p.slot === 'champion')?.status === 'exact';
  if (exact === 4) return 'flawless';
  if (inTop4 === 4) return 'all-four';
  if (championExact) return 'champion';
  if (inTop4 > 0) return 'partial';
  return 'missed';
}

const BUCKET_COPY: Record<Top4Bucket, { headline: string; flavour: string }> = {
  flawless: {
    headline: '🏆 Flawless top 4!',
    flavour: `Champion, runner-up and both semifinalists — all four placings exactly right, with a +${PLAYOFF_PICK_ALL_EXACT_BONUS} bonus on top. It doesn’t get better than this.`,
  },
  'all-four': {
    headline: '🥇 You named all four!',
    flavour: 'Every one of your four teams made the top 4 — just not all in the exact spots. A whisker away from the bonus.',
  },
  champion: {
    headline: '👑 You crowned the champion!',
    flavour: 'You called the World Cup winner. A few of the other placings slipped, but you nailed the big one.',
  },
  partial: {
    headline: '👍 Part of the podium',
    flavour: 'Some of your top-4 picks landed. Here’s how the final standings compared to your call.',
  },
  missed: {
    headline: '🙈 The podium got away',
    flavour: 'None of your four picks landed in the top 4 this time — a brutal bracket. Here’s how it finished.',
  },
};

const STATUS_TEXT: Record<Top4PickStatus, string> = {
  exact: 'spot on',
  'in-top4': 'right team, wrong place',
  missed: 'not in the top 4',
};
const STATUS_COLOR: Record<Top4PickStatus, string> = {
  exact: '#1f7a43',
  'in-top4': '#b8860b',
  missed: '#999',
};

/** Build the post-final TOP-4 recap e-mail (subject + HTML). Independent of the
 *  per-match final result e-mail. */
export function buildTop4ResultEmail(d: Top4ResultEmailData): { subject: string; html: string } {
  const bucket = top4Bucket(d.picks);
  const { headline, flavour } = BUCKET_COPY[bucket];
  const subject = `${headline} — your top-4 result (${d.totalPoints} pts)`;

  const pickRows = d.picks.map((p) => `
    <tr>
      <td style="padding:6px 10px 6px 0;color:#555;white-space:nowrap;">${esc(p.slotLabel)}</td>
      <td style="padding:6px 10px 6px 0;color:#111;font-weight:600;">${esc(p.pickedTeam)}</td>
      <td style="padding:6px 10px 6px 0;color:${STATUS_COLOR[p.status]};">${STATUS_TEXT[p.status]}</td>
      <td style="padding:6px 0;text-align:right;font-weight:700;color:${p.points > 0 ? '#1f7a43' : '#999'};">${p.points > 0 ? `+${p.points}` : '0'}</td>
    </tr>`).join('');

  const bonusRow = d.hasBonus
    ? `<tr><td colspan="3" style="padding:6px 0;color:#3a2600;font-weight:700;">🎉 All-exact bonus</td>
           <td style="padding:6px 0;text-align:right;font-weight:800;color:#3a2600;">+${PLAYOFF_PICK_ALL_EXACT_BONUS}</td></tr>`
    : '';

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
    <h2 style="margin:0 0 4px">${headline}</h2>
    <p style="margin:0 0 4px;color:#666">The tournament is over, ${esc(d.userName)} — here’s how your top-4 call landed.</p>
    <p style="margin:0 0 16px;color:#444;font-size:14px">${esc(flavour)}</p>

    <div style="background:#faf7ef;border:1px solid #e7dfc7;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#444;">
      <strong style="color:#111;">Final top 4</strong><br/>
      🥇 ${esc(d.actual.champion)} &nbsp;·&nbsp; 🥈 ${esc(d.actual.runnerUp)} &nbsp;·&nbsp; 🥉 ${esc(d.actual.third)} &nbsp;·&nbsp; 4th ${esc(d.actual.fourth)}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 4px">
      ${pickRows}
      ${bonusRow}
      <tr><td colspan="3" style="padding:8px 0;border-top:1px solid #e7dfc7;font-weight:700">Top-4 total</td>
          <td style="padding:8px 0;border-top:1px solid #e7dfc7;text-align:right;font-weight:800;color:#b8860b">${d.totalPoints} pts</td></tr>
    </table>

    <p style="margin:18px 0 0">
      <a href="${SITE_URL}/pickem/leaderboard" style="background:#d4a843;color:#2a1a00;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;display:inline-block">See the final leaderboard →</a>
    </p>
  </div>`;

  return { subject, html };
}
