'use client';

import TeamFlag from './TeamFlag';

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

interface KnockoutMatchCardProps {
  matchNumber: number;
  home: SlotData;
  away: SlotData;
  highlight?: boolean;
  pulse?: boolean;
  kickOff?: string | null;
  venue?: string | null;
}

function formatKickOff(iso: string): string {
  const d = new Date(iso);
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mon}, ${day} ${hh}:${mm}`;
}

function SlotRow({ slot }: { slot: SlotData }) {
  if (slot.resolved) {
    const { team } = slot.resolved;
    return (
      <div className="ko-slot ko-slot-resolved">
        <TeamFlag countryCode={team.countryCode} size="sm" />
        <span className="ko-slot-code" title={team.name}>{team.shortName}</span>
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

export default function KnockoutMatchCard({ matchNumber, home, away, highlight, pulse, kickOff, venue }: KnockoutMatchCardProps) {
  return (
    <div
      data-match-number={matchNumber}
      className={`ko-match-card${highlight ? ' ko-match-card-highlight' : ''}${pulse ? ' ko-match-card-pulse' : ''}`}
    >
      <div className="ko-match-header">
        <span className="ko-match-number">M{matchNumber}</span>
        {kickOff && <span className="ko-match-kickoff">{formatKickOff(kickOff)}</span>}
      </div>
      <div className="ko-match-teams">
        <SlotRow slot={home} />
        <div className="ko-match-vs">vs</div>
        <SlotRow slot={away} />
      </div>
      {venue && <div className="ko-match-venue" title={venue}>{venue}</div>}
    </div>
  );
}
