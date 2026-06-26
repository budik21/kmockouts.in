'use client';

import TeamFlag from './TeamFlag';
import LocalKickOff from './LocalKickOff';

interface ResolvedTeamData {
  team: {
    id: number;
    name: string;
    shortName: string;
    countryCode: string;
  };
  label: string;
}

interface SlotData {
  resolved: ResolvedTeamData | null;
  pair?: [ResolvedTeamData, ResolvedTeamData];
  placeholder: string;
}

interface MatchResult {
  status: string; // FINISHED
  homeGoals: number | null;
  awayGoals: number | null;
  homeGoalsEt: number | null;
  awayGoalsEt: number | null;
  homePens: number | null;
  awayPens: number | null;
  advancingTeamId: number | null;
}

interface KnockoutMatchCardProps {
  matchNumber: number;
  home: SlotData;
  away: SlotData;
  highlight?: boolean;
  pulse?: boolean;
  kickOff?: string | null;
  venue?: string | null;
  result?: MatchResult | null;
}

/** The score shown on one side of a finished match. */
interface SideScore {
  /** Goals after extra time if it was played, otherwise the 90′ score. */
  goals: number;
  /** Penalty shoot-out tally, when the tie went to penalties. */
  pens: number | null;
  /** True when extra time was played (shown as an "aet" hint). */
  aet: boolean;
}

function SlotRow({ slot, score, isWinner }: { slot: SlotData; score: SideScore | null; isWinner: boolean }) {
  const scoreEl = score && (
    <span className="ko-slot-score">
      {score.goals}
      {score.pens != null && <span className="ko-slot-score-pens"> ({score.pens})</span>}
    </span>
  );

  if (slot.resolved) {
    const { team } = slot.resolved;
    return (
      <div className={`ko-slot ko-slot-resolved${isWinner ? ' ko-slot-winner' : ''}`}>
        <TeamFlag countryCode={team.countryCode} size="sm" />
        <span className="ko-slot-code" title={team.name}>{team.shortName}</span>
        {scoreEl}
      </div>
    );
  }

  if (slot.pair) {
    const [a, b] = slot.pair;
    return (
      <div className="ko-slot ko-slot-pair">
        <TeamFlag countryCode={a.team.countryCode} size="sm" />
        <span className="ko-slot-code" title={a.team.name}>{a.team.shortName}</span>
        <span className="ko-slot-pair-sep">/</span>
        <TeamFlag countryCode={b.team.countryCode} size="sm" />
        <span className="ko-slot-code" title={b.team.name}>{b.team.shortName}</span>
      </div>
    );
  }

  return (
    <div className="ko-slot ko-slot-placeholder">
      <span className="ko-slot-placeholder-text">{slot.placeholder}</span>
    </div>
  );
}

/** Build the per-side scores from a finished match result. */
function sideScores(result: MatchResult | null | undefined): { home: SideScore; away: SideScore } | null {
  if (!result || result.status !== 'FINISHED') return null;
  const aet = result.homeGoalsEt != null && result.awayGoalsEt != null;
  const homeGoals = result.homeGoalsEt ?? result.homeGoals;
  const awayGoals = result.awayGoalsEt ?? result.awayGoals;
  if (homeGoals == null || awayGoals == null) return null;
  return {
    home: { goals: homeGoals, pens: result.homePens, aet },
    away: { goals: awayGoals, pens: result.awayPens, aet },
  };
}

export default function KnockoutMatchCard({ matchNumber, home, away, highlight, pulse, kickOff, venue, result }: KnockoutMatchCardProps) {
  const scores = sideScores(result);
  const finished = scores != null;
  const advancingId = result?.advancingTeamId ?? null;

  return (
    <div
      data-match-number={matchNumber}
      className={`ko-match-card${highlight ? ' ko-match-card-highlight' : ''}${pulse ? ' ko-match-card-pulse' : ''}${finished ? ' ko-match-card-finished' : ''}`}
    >
      <div className="ko-match-header">
        <span className="ko-match-number">M{matchNumber}</span>
        {finished ? (
          <span className="ko-match-status">{scores!.home.aet ? 'AET' : 'FT'}</span>
        ) : (
          kickOff && (
            <LocalKickOff
              iso={kickOff}
              className="ko-match-kickoff"
              dateOptions={{ day: 'numeric', month: 'short' }}
              timeOptions={{ hour: '2-digit', minute: '2-digit' }}
            />
          )
        )}
      </div>
      <div className="ko-match-teams">
        <SlotRow
          slot={home}
          score={scores?.home ?? null}
          isWinner={advancingId != null && home.resolved?.team.id === advancingId}
        />
        <div className="ko-match-vs">vs</div>
        <SlotRow
          slot={away}
          score={scores?.away ?? null}
          isWinner={advancingId != null && away.resolved?.team.id === advancingId}
        />
      </div>
      {venue && <div className="ko-match-venue" title={venue}>{venue}</div>}
    </div>
  );
}
