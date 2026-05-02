'use client';

import Link from 'next/link';
import { slugify } from '@/lib/slugify';
import TeamFlag from './TeamFlag';
import { YellowCardIcon, SecondYellowIcon, RedCardIcon, YellowAndRedCardIcon } from './CardIcons';
import {
  FAIR_PLAY_YELLOW_CARD,
  FAIR_PLAY_YELLOW_THEN_RED,
  FAIR_PLAY_RED_CARD_DIRECT,
  FAIR_PLAY_YELLOW_AND_DIRECT_RED,
} from '@/lib/constants';

interface MatchData {
  id: number;
  round: number;
  homeTeam: { id: number; name: string; shortName: string; countryCode: string; fifaRanking?: number };
  awayTeam: { id: number; name: string; shortName: string; countryCode: string; fifaRanking?: number };
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc?: number;
  homeYc2?: number;
  homeRcDirect?: number;
  homeYcRc?: number;
  awayYc?: number;
  awayYc2?: number;
  awayRcDirect?: number;
  awayYcRc?: number;
  venue: string;
  kickOff: string;
  status: string;
}

interface MatchListProps {
  matches: MatchData[];
  compact?: boolean;
  /** When set, team names link to /worldcup2026/group-{id}/team/{slug} */
  groupId?: string;
}

function TeamName({
  team,
  compact,
  groupId,
}: {
  team: { name: string; shortName: string };
  compact: boolean;
  groupId?: string;
}) {
  const inner = compact ? (
    <span title={team.name}>{team.shortName}</span>
  ) : (
    <>
      <span className="match-name-full">{team.name}</span>
      <span className="match-name-short" title={team.name}>{team.shortName}</span>
    </>
  );
  if (!groupId) return <>{inner}</>;
  return (
    <Link
      href={`/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(team.name)}`}
      className="match-team-link"
    >
      {inner}
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Calculate fair-play deduction points for a set of cards */
function fairPlayDeduction(yc: number, yc2: number, rc: number, ycRc: number): number {
  return (
    yc * FAIR_PLAY_YELLOW_CARD +
    yc2 * FAIR_PLAY_YELLOW_THEN_RED +
    rc * FAIR_PLAY_RED_CARD_DIRECT +
    ycRc * FAIR_PLAY_YELLOW_AND_DIRECT_RED
  );
}

/** Renders card counts with icons and fair-play deduction */
function CardBadges({ yc, yc2, rc, ycRc }: { yc: number; yc2: number; rc: number; ycRc: number }) {
  const hasCards = yc > 0 || yc2 > 0 || rc > 0 || ycRc > 0;
  if (!hasCards) return null;

  const fp = fairPlayDeduction(yc, yc2, rc, ycRc);

  return (
    <span className="match-cards">
      {yc > 0 && (
        <span className="match-card-badge">
          <YellowCardIcon size={0.85} />
          <span className="match-card-count">{yc}</span>
        </span>
      )}
      {yc2 > 0 && (
        <span className="match-card-badge">
          <SecondYellowIcon size={0.85} />
          <span className="match-card-count">{yc2}</span>
        </span>
      )}
      {rc > 0 && (
        <span className="match-card-badge">
          <RedCardIcon size={0.85} />
          <span className="match-card-count">{rc}</span>
        </span>
      )}
      {ycRc > 0 && (
        <span className="match-card-badge">
          <YellowAndRedCardIcon size={0.85} />
          <span className="match-card-count">{ycRc}</span>
        </span>
      )}
    </span>
  );
}

/** Fair-play deduction label */
function FppLabel({ yc, yc2, rc, ycRc }: { yc: number; yc2: number; rc: number; ycRc: number }) {
  const fp = fairPlayDeduction(yc, yc2, rc, ycRc);
  if (fp === 0) return null;
  return (
    <span className="match-fpp-label" title="Fair Play Points deduction">
      <span className="match-fpp-text-full">Total FPP:</span>
      <span className="match-fpp-text-short">FPP:</span>
      {' '}<strong>{fp}</strong>
    </span>
  );
}

export default function MatchList({ matches, compact = false, groupId }: MatchListProps) {
  // Group by round
  const rounds = new Map<number, MatchData[]>();
  for (const m of matches) {
    const list = rounds.get(m.round) || [];
    list.push(m);
    rounds.set(m.round, list);
  }

  return (
    <div>
      {Array.from(rounds.entries()).map(([round, roundMatches]) => (
        <div key={round}>
          {!compact && <div className="match-round">Matchday {round}</div>}
          {roundMatches.map((m) => {
            const isPlayed = m.status === 'FINISHED' || m.status === 'LIVE';
            const homeHasCards = isPlayed && ((m.homeYc ?? 0) > 0 || (m.homeYc2 ?? 0) > 0 || (m.homeRcDirect ?? 0) > 0 || (m.homeYcRc ?? 0) > 0);
            const awayHasCards = isPlayed && ((m.awayYc ?? 0) > 0 || (m.awayYc2 ?? 0) > 0 || (m.awayRcDirect ?? 0) > 0 || (m.awayYcRc ?? 0) > 0);
            const hasCards = homeHasCards || awayHasCards;

            return (
              <div key={m.id} className="match-item-wrap">
                <div className="match-item">
                  <div className="match-team home">
                    <TeamName team={m.homeTeam} compact={compact} groupId={groupId} />
                    {m.homeTeam.fifaRanking && (
                      <span className="match-ranking" title={`FIFA Ranking: ${m.homeTeam.fifaRanking}`}>
                        ({m.homeTeam.fifaRanking})
                      </span>
                    )}
                    <TeamFlag countryCode={m.homeTeam.countryCode} className="ms-2" />
                  </div>
                  <div className={`match-score ${m.status === 'SCHEDULED' ? 'scheduled' : ''}`}>
                    {isPlayed
                      ? `${m.homeGoals} - ${m.awayGoals}`
                      : formatDate(m.kickOff)}
                  </div>
                  <div className="match-team away">
                    <TeamFlag countryCode={m.awayTeam.countryCode} className="me-2" />
                    <TeamName team={m.awayTeam} compact={compact} groupId={groupId} />
                    {m.awayTeam.fifaRanking && (
                      <span className="match-ranking" title={`FIFA Ranking: ${m.awayTeam.fifaRanking}`}>
                        ({m.awayTeam.fifaRanking})
                      </span>
                    )}
                  </div>
                </div>
                {!isPlayed && m.venue && (
                  <div className="match-venue">{m.venue}</div>
                )}
                {hasCards && (
                  <div className="match-cards-row">
                    <div className="match-cards-home">
                      {homeHasCards && <FppLabel yc={m.homeYc ?? 0} yc2={m.homeYc2 ?? 0} rc={m.homeRcDirect ?? 0} ycRc={m.homeYcRc ?? 0} />}
                      {homeHasCards && <CardBadges yc={m.homeYc ?? 0} yc2={m.homeYc2 ?? 0} rc={m.homeRcDirect ?? 0} ycRc={m.homeYcRc ?? 0} />}
                    </div>
                    <div className="match-cards-spacer" />
                    <div className="match-cards-away">
                      {awayHasCards && <CardBadges yc={m.awayYc ?? 0} yc2={m.awayYc2 ?? 0} rc={m.awayRcDirect ?? 0} ycRc={m.awayYcRc ?? 0} />}
                      {awayHasCards && <FppLabel yc={m.awayYc ?? 0} yc2={m.awayYc2 ?? 0} rc={m.awayRcDirect ?? 0} ycRc={m.awayYcRc ?? 0} />}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
