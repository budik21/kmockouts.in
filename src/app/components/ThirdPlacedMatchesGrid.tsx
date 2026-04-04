'use client';

import TeamFlag from './TeamFlag';

interface MatchInfo {
  opponentName: string;
  opponentShort: string;
  opponentCode: string;
  isHome: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  status: string;
  round: number;
  venue: string;
  kickOff: string;
}

interface TeamWithMatches {
  rank: number;
  groupId: string;
  team: {
    name: string;
    shortName: string;
    countryCode: string;
  };
  matches: MatchInfo[];
}

interface ThirdPlacedMatchesGridProps {
  teams: TeamWithMatches[];
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ThirdPlacedMatchesGrid({ teams }: ThirdPlacedMatchesGridProps) {
  return (
    <div className="mt-4">
      <h5 className="mb-3">Matches of Third-Placed Teams</h5>
      <div className="row g-3">
        {teams.map((t) => (
          <div key={t.groupId} className="col-12 col-sm-6 col-lg-3">
            <div className="group-card">
              <div className="group-card-header" style={{ padding: '0.5rem 0.75rem', fontSize: '0.95rem' }}>
                <span>
                  <TeamFlag countryCode={t.team.countryCode} />
                  {' '}<span title={t.team.name}>{t.team.shortName}</span>
                </span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                  Group {t.groupId} · #{t.rank}
                </span>
              </div>
              <div className="group-card-body" style={{ padding: '0.5rem 0.75rem' }}>
                {t.matches.map((m, i) => {
                  const finished = m.status === 'FINISHED';
                  const ownGoals = m.isHome ? m.homeGoals : m.awayGoals;
                  const oppGoals = m.isHome ? m.awayGoals : m.homeGoals;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '0.35rem 0',
                        borderBottom: i < t.matches.length - 1 ? '1px solid var(--wc-border)' : undefined,
                        fontSize: '0.85rem',
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-1">
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}>vs</span>
                          <TeamFlag countryCode={m.opponentCode} />
                          <span title={m.opponentName}>{m.opponentShort}</span>
                          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                            ({m.isHome ? 'H' : 'A'})
                          </span>
                        </div>
                        {finished && (
                          <span className="fw-bold">
                            {ownGoals} – {oppGoals}
                          </span>
                        )}
                      </div>
                      {!finished && (
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginLeft: '1.1rem' }}>
                          {formatDateTime(m.kickOff)} · {m.venue}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
