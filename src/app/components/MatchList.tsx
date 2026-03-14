'use client';

import TeamFlag from './TeamFlag';

interface MatchData {
  id: number;
  round: number;
  homeTeam: { id: number; name: string; shortName: string; countryCode: string };
  awayTeam: { id: number; name: string; shortName: string; countryCode: string };
  homeGoals: number | null;
  awayGoals: number | null;
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
          {roundMatches.map((m) => (
            <div key={m.id} className="match-item">
              <div className="match-team home">
                {compact ? m.homeTeam.shortName : m.homeTeam.name}
                <TeamFlag countryCode={m.homeTeam.countryCode} className="ms-2" />
              </div>
              <div className={`match-score ${m.status === 'SCHEDULED' ? 'scheduled' : ''}`}>
                {m.status === 'FINISHED' || m.status === 'LIVE'
                  ? `${m.homeGoals} - ${m.awayGoals}`
                  : formatDate(m.kickOff)}
              </div>
              <div className="match-team away">
                <TeamFlag countryCode={m.awayTeam.countryCode} className="me-2" />
                {compact ? m.awayTeam.shortName : m.awayTeam.name}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
