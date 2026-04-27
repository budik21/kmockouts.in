'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import KnockoutMatchCard from './KnockoutMatchCard';
import KnockoutRound from './KnockoutRound';

// ── Bracket tree ordering (top to bottom per column) ────────

/** Left half feeds into SF M101 → Final */
const LEFT_R32 = [74, 77, 73, 75, 83, 84, 81, 82];
const LEFT_R16 = [89, 90, 93, 94];
const LEFT_QF = [97, 98];
const LEFT_SF = [101];

/** Right half feeds into SF M102 → Final */
const RIGHT_R32 = [76, 78, 79, 80, 86, 88, 85, 87];
const RIGHT_R16 = [91, 92, 95, 96];
const RIGHT_QF = [99, 100];
const RIGHT_SF = [102];

const ROUND_ORDER = [
  { id: 'r32', label: 'Round of 32' },
  { id: 'r16', label: 'Round of 16' },
  { id: 'qf', label: 'Quarterfinals' },
  { id: 'sf', label: 'Semifinals' },
  { id: 'thirdPlace', label: '3rd Place' },
  { id: 'final', label: 'Final' },
] as const;

// ── Types ────────────────────────────────────────────────────

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

interface BracketResponse {
  groupsComplete: boolean;
  canResolve: boolean;
  qualifyingThirdGroups: string[] | null;
  rounds: Record<string, MatchData[]>;
}

// ── Component ────────────────────────────────────────────────

export default function KnockoutBracket() {
  const [data, setData] = useState<BracketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRound, setActiveRound] = useState('r32');
  const searchParams = useSearchParams();
  const highlightParam = searchParams?.get('highlight');
  const highlightMatch = highlightParam ? parseInt(highlightParam, 10) : null;

  useEffect(() => {
    fetch('/api/knockout-bracket')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Scroll the highlighted match into view after data renders
  useEffect(() => {
    if (!data || !highlightMatch) return;
    // Wait for layout; pick the visible card (desktop or mobile view)
    requestAnimationFrame(() => {
      const cards = document.querySelectorAll<HTMLElement>(
        `[data-match-number="${highlightMatch}"]`,
      );
      for (const el of cards) {
        if (el.offsetParent !== null) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    });
  }, [data, highlightMatch]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-secondary" role="status">
          <span className="visually-hidden">Loading bracket...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="alert alert-warning">Failed to load bracket data.</div>;
  }

  // Build match lookup by number
  const allMatches: MatchData[] = Object.values(data.rounds).flat();
  const byNum = new Map<number, MatchData>();
  for (const m of allMatches) byNum.set(m.matchNumber, m);

  const getMatch = (num: number) => byNum.get(num)!;

  const scrollToRound = (roundId: string) => {
    setActiveRound(roundId);
    document.getElementById(`round-${roundId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ko-bracket">
      {!data.canResolve && (
        <div className="alert alert-info ko-bracket-info">
          Bracket shows placeholders until every team has played at least one match.
        </div>
      )}

      {data.canResolve && data.qualifyingThirdGroups && (
        <div className="ko-qualifying-third">
          <small>
            Qualifying 3rd-place groups:{' '}
            <strong>{data.qualifyingThirdGroups.join(', ')}</strong>
          </small>
        </div>
      )}

      {/* ── Desktop: classic bracket tree ── */}
      <div className="ko-tree">
        <div className="ko-tree-headers">
          <span>R32</span>
          <span>R16</span>
          <span>QF</span>
          <span>SF</span>
          <span className="ko-tree-header-center">Final</span>
          <span>SF</span>
          <span>QF</span>
          <span>R16</span>
          <span>R32</span>
        </div>

        <div className="ko-tree-bracket">
          {/* Left half → SF M101 → Final */}
          <div className="ko-tree-half ko-tree-half-left">
            <TreeRound matches={LEFT_R32.map(getMatch)} round="r32" pulseMatch={highlightMatch} />
            <TreeRound matches={LEFT_R16.map(getMatch)} round="r16" pulseMatch={highlightMatch} />
            <TreeRound matches={LEFT_QF.map(getMatch)} round="qf" pulseMatch={highlightMatch} />
            <TreeRound matches={LEFT_SF.map(getMatch)} round="sf" pulseMatch={highlightMatch} />
          </div>

          {/* Center: Final + 3rd place */}
          <div className="ko-tree-center">
            <div className="ko-tree-center-match">
              <div className="ko-tree-center-label">Final</div>
              <MatchCard match={getMatch(104)} highlight pulse={highlightMatch === 104} />
            </div>
            <div className="ko-tree-center-match">
              <div className="ko-tree-center-label">3rd Place</div>
              <MatchCard match={getMatch(103)} pulse={highlightMatch === 103} />
            </div>
          </div>

          {/* Right half → SF M102 → Final */}
          <div className="ko-tree-half ko-tree-half-right">
            <TreeRound matches={RIGHT_R32.map(getMatch)} round="r32" pulseMatch={highlightMatch} />
            <TreeRound matches={RIGHT_R16.map(getMatch)} round="r16" pulseMatch={highlightMatch} />
            <TreeRound matches={RIGHT_QF.map(getMatch)} round="qf" pulseMatch={highlightMatch} />
            <TreeRound matches={RIGHT_SF.map(getMatch)} round="sf" pulseMatch={highlightMatch} />
          </div>
        </div>
      </div>

      {/* ── Mobile: stacked rounds with nav ── */}
      <div className="ko-stacked">
        <nav className="ko-round-nav">
          {ROUND_ORDER.map(({ id, label }) => (
            <button
              key={id}
              className={`ko-round-nav-btn ${activeRound === id ? 'active' : ''}`}
              onClick={() => scrollToRound(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {ROUND_ORDER.map(({ id, label }) => (
          <KnockoutRound
            key={id}
            roundId={id}
            label={label}
            matches={data.rounds[id] || []}
            pulseMatch={highlightMatch}
          />
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function TreeRound({ matches, round, pulseMatch }: { matches: MatchData[]; round: string; pulseMatch: number | null }) {
  return (
    <div className={`ko-tree-round ko-tree-round-${round}`}>
      {matches.map((m) => (
        <div key={m.matchNumber} className="ko-tree-match">
          <MatchCard match={m} pulse={pulseMatch === m.matchNumber} />
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, highlight, pulse }: { match: MatchData; highlight?: boolean; pulse?: boolean }) {
  return (
    <KnockoutMatchCard
      matchNumber={match.matchNumber}
      home={match.home}
      away={match.away}
      highlight={highlight}
      pulse={pulse}
      kickOff={match.kickOff}
      venue={match.venue}
    />
  );
}
