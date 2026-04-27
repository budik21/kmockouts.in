'use client';

import KnockoutMatchCard from './KnockoutMatchCard';

interface ResolvedTeamData {
  team: { id: number; name: string; shortName: string; countryCode: string };
  label: string;
}

interface SlotData {
  resolved: ResolvedTeamData | null;
  pair?: [ResolvedTeamData, ResolvedTeamData];
  placeholder: string;
}

interface MatchData {
  matchNumber: number;
  round: string;
  home: SlotData;
  away: SlotData;
  kickOff: string | null;
  venue: string | null;
}

interface KnockoutRoundProps {
  roundId: string;
  label: string;
  matches: MatchData[];
  pulseMatch?: number | null;
}

export default function KnockoutRound({ roundId, label, matches, pulseMatch }: KnockoutRoundProps) {
  if (matches.length === 0) return null;

  return (
    <section id={`round-${roundId}`} className="ko-round">
      <h3 className="ko-round-title">{label}</h3>
      <div className={`ko-round-grid ko-round-grid-${roundId}`}>
        {matches.map((m) => (
          <KnockoutMatchCard
            key={m.matchNumber}
            matchNumber={m.matchNumber}
            home={m.home}
            away={m.away}
            kickOff={m.kickOff}
            venue={m.venue}
            pulse={pulseMatch === m.matchNumber}
          />
        ))}
      </div>
    </section>
  );
}
