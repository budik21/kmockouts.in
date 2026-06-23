import {
  getKnockoutMatches,
  getPlayoffTeams,
  getUserKnockoutTips,
  getUserPlayoffPicks,
} from '@/lib/playoff-data';
import { PLAYOFF_PICK_SLOTS, PLAYOFF_PICK_POINTS, PLAYOFF_PICK_LABELS, type PlayoffPickSlot } from '@/lib/playoff-scoring';
import { isFeatureEnabled } from '@/lib/feature-flags';

/**
 * Read-only summary of a user's play-off predictions (top-4 picks + knockout
 * match tips). Server component — renders nothing when the user has no play-off
 * predictions, so profiles without them stay clean.
 */
export default async function PlayoffSummary({ userId, name }: { userId: number; name?: string }) {
  // Feature-flagged: renders nothing (and runs no queries) until launch.
  if (!(await isFeatureEnabled('playoff_pickem', false))) return null;

  const [picks, koTips, matches, teams] = await Promise.all([
    getUserPlayoffPicks(userId),
    getUserKnockoutTips(userId),
    getKnockoutMatches(),
    getPlayoffTeams(),
  ]);

  if (picks.length === 0 && koTips.length === 0) return null;

  const teamName = new Map<number, { name: string; shortName: string }>();
  for (const t of teams) teamName.set(t.id, { name: t.name, shortName: t.shortName });
  const matchByNum = new Map(matches.map((m) => [m.matchNumber, m]));
  for (const m of matches) {
    if (m.homeTeam) teamName.set(m.homeTeam.id, { name: m.homeTeam.name, shortName: m.homeTeam.shortName });
    if (m.awayTeam) teamName.set(m.awayTeam.id, { name: m.awayTeam.name, shortName: m.awayTeam.shortName });
  }

  const pickBySlot = new Map(picks.map((p) => [p.slot, p]));
  const totalPoints =
    koTips.reduce((s, t) => s + (t.points ?? 0), 0) +
    picks.reduce((s, p) => s + (p.points ?? 0), 0);

  const koTipsSorted = [...koTips].sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="playoff-summary">
      <div className="playoff-summary-head">
        <h3 className="playoff-summary-title">🏆 Play-off predictions{name ? ` — ${name}` : ''}</h3>
        <span className="playoff-summary-total">{totalPoints} pts</span>
      </div>

      {picks.length > 0 && (
        <div className="playoff-summary-picks">
          {PLAYOFF_PICK_SLOTS.map((slot) => {
            const p = pickBySlot.get(slot);
            const team = p ? teamName.get(p.teamId) : null;
            return (
              <div key={slot} className="playoff-summary-pick">
                <span className="playoff-summary-pick-label">{PLAYOFF_PICK_LABELS[slot as PlayoffPickSlot]}</span>
                <span className="playoff-summary-pick-team">{team?.name ?? '—'}</span>
                <span className="playoff-summary-pick-pts">
                  {p?.points != null ? `${p.points}` : `/${PLAYOFF_PICK_POINTS[slot as PlayoffPickSlot]}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {koTipsSorted.length > 0 && (
        <table className="playoff-summary-table">
          <tbody>
            {koTipsSorted.map((t) => {
              const m = matchByNum.get(t.matchNumber);
              const home = m?.homeTeam?.shortName ?? '?';
              const away = m?.awayTeam?.shortName ?? '?';
              const adv = teamName.get(t.advanceTeamId)?.shortName ?? '?';
              return (
                <tr key={t.matchNumber}>
                  <td className="playoff-summary-match">{home}–{away}</td>
                  <td className="playoff-summary-tip">{t.homeGoals}:{t.awayGoals} · {adv} ↑</td>
                  <td className={`playoff-summary-pts ${t.points == null ? '' : t.points > 0 ? 'hit' : 'miss'}`}>
                    {t.points == null ? '—' : `${t.points}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
