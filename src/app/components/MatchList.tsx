'use client';

import TeamFlag from './TeamFlag';
import { YellowCardIcon, SecondYellowIcon, RedCardIcon } from './CardIcons';

interface MatchData {
  id: number;
  round: number;
  homeTeam: { id: number; name: string; shortName: string; countryCode: string };
  awayTeam: { id: number; name: string; shortName: string; countryCode: string };
  homeGoals: number | null;
  awayGoals: number | null;
  homeYc?: number;
  homeYc2?: number;
  homeRcDirect?: number;
  awayYc?: number;
  awayYc2?: number;
  awayRcDirect?: number;
  venue: string;
  kickOff: string;
  status: string;
}

interface MatchListProps {
  matches: MatchData[];
  compact?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Renders card counts with icons */
function CardBadges({ yc, yc2, rc }: { yc: number; yc2: number; rc: number }) {
  const hasCards = yc > 0 || yc2 > 0 || rc > 0;
  if (!hasCards) return null;

  return (
    <span className="match-cards">
      {yc > 0 && (
        <span className="match-card-badge">
          <YellowCardIcon size={0.65} />
          <span className="match-card-count">{yc}</span>
        </span>
      )}
      {yc2 > 0 && (
        <span className="match-card-badge">
          <SecondYellowIcon size={0.65} />
          <span className="match-card-count">{yc2}</span>
        </span>
      )}
      {rc > 0 && (
        <span className="match-card-badge">
          <RedCardIcon size={0.65} />
          <span className="match-card-count">{rc}</span>
        </span>
      )}
    </span>
  );
}

export default function MatchList({ matches, compact = false }: MatchListProps) {
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
            const homeHasCards = isPlayed && ((m.homeYc ?? 0) > 0 || (m.homeYc2 ?? 0) > 0 || (m.homeRcDirect ?? 0) > 0);
            const awayHasCards = isPlayed && ((m.awayYc ?? 0) > 0 || (m.awayYc2 ?? 0) > 0 || (m.awayRcDirect ?? 0) > 0);
            const hasCards = homeHasCards || awayHasCards;

            return (
              <div key={m.id} className="match-item-wrap">
                <div className="match-item">
                  <div className="match-team home">
                    {compact ? (
                      m.homeTeam.shortName
                    ) : (
                      <>
                        <span className="match-name-full">{m.homeTeam.name}</span>
                        <span className="match-name-short">{m.homeTeam.shortName}</span>
                      </>
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
                    {compact ? (
                      m.awayTeam.shortName
                    ) : (
                      <>
                        <span className="match-name-full">{m.awayTeam.name}</span>
                        <span className="match-name-short">{m.awayTeam.shortName}</span>
                      </>
                    )}
                  </div>
                </div>
                {hasCards && (
                  <div className="match-cards-row">
                    <div className="match-cards-home">
                      {homeHasCards && <CardBadges yc={m.homeYc ?? 0} yc2={m.homeYc2 ?? 0} rc={m.homeRcDirect ?? 0} />}
                    </div>
                    <div className="match-cards-spacer" />
                    <div className="match-cards-away">
                      {awayHasCards && <CardBadges yc={m.awayYc ?? 0} yc2={m.awayYc2 ?? 0} rc={m.awayRcDirect ?? 0} />}
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
