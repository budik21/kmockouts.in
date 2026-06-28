import Link from 'next/link';
import TeamFlag from './TeamFlag';
import NextMatchDate from './NextMatchDate';
import { slugify } from '@/lib/slugify';
import type { KnockoutPathNode } from '@/lib/knockout-path';
import type { PlayoffFixtureTeam } from '@/lib/playoff-data';

interface Props {
  teamName: string;
  teamCountryCode: string;
  nodes: KnockoutPathNode[];
}

const teamHref = (t: PlayoffFixtureTeam) =>
  `/worldcup2026/group-${(t.groupId || '').toLowerCase()}/team/${slugify(t.name)}`;

/** Opponent display: resolved team (clickable + flag), or the two candidates of
 *  an undecided feeding match, or a plain placeholder label. */
function Opponent({ node }: { node: KnockoutPathNode }) {
  if (node.opponent) {
    return (
      <Link href={teamHref(node.opponent)} className="ko-path-opp" prefetch={false}>
        <TeamFlag countryCode={node.opponent.countryCode} size="md" />
        <span className="ko-path-opp-name">{node.opponent.name}</span>
      </Link>
    );
  }
  if (node.opponentPair) {
    const [a, b] = node.opponentPair;
    return (
      <span className="ko-path-opp ko-path-opp-pair">
        <span className="ko-path-pair-team">
          <TeamFlag countryCode={a.countryCode} size="sm" />
          <span className="ko-path-pair-code">{a.shortName}</span>
        </span>
        <span className="ko-path-pair-sep">/</span>
        <span className="ko-path-pair-team">
          <TeamFlag countryCode={b.countryCode} size="sm" />
          <span className="ko-path-pair-code">{b.shortName}</span>
        </span>
      </span>
    );
  }
  return <span className="ko-path-opp ko-path-opp-ph">{node.opponentPlaceholder || 'TBD'}</span>;
}

function ResultBody({ node, teamCountryCode }: { node: KnockoutPathNode; teamCountryCode: string }) {
  const isChampion = node.round === 'final' && node.teamAdvanced;
  return (
    <div className="ko-path-body">
      <div className="ko-path-score-row">
        <TeamFlag countryCode={teamCountryCode} size="md" />
        <span className={`ko-path-score${node.teamAdvanced ? ' ko-path-score-win' : ''}`}>
          {node.teamGoals}
          {node.teamPens != null && <span className="ko-path-pens"> ({node.teamPens})</span>}
        </span>
        <span className="ko-path-score-sep">–</span>
        <span className={`ko-path-score${!node.teamAdvanced ? ' ko-path-score-win' : ''}`}>
          {node.oppGoals}
          {node.oppPens != null && <span className="ko-path-pens"> ({node.oppPens})</span>}
        </span>
        {node.opponent ? (
          <TeamFlag countryCode={node.opponent.countryCode} size="md" />
        ) : (
          <span className="ko-path-opp-ph">?</span>
        )}
      </div>
      {node.aet && <div className="ko-path-aet">after extra time</div>}
      {node.opponent && (
        <div className="ko-path-opp-label">
          vs{' '}
          <Link href={teamHref(node.opponent)} prefetch={false} className="ko-path-opp-link">
            {node.opponent.name}
          </Link>
        </div>
      )}
      <div className={`ko-path-verdict${node.teamAdvanced ? ' advanced' : ' out'}`}>
        {isChampion ? '🏆 Champions' : node.teamAdvanced ? '✓ Advanced' : '✗ Eliminated'}
      </div>
    </div>
  );
}

function FixtureBody({ node, label }: { node: KnockoutPathNode; label: string }) {
  return (
    <div className="ko-path-body">
      <div className="ko-path-fixture-label">{label}</div>
      <Opponent node={node} />
      {node.kickOff && node.venue && (
        <div className="ko-path-meta">
          <NextMatchDate kickOff={node.kickOff} venue={node.venue} />
        </div>
      )}
    </div>
  );
}

function EliminatedBody() {
  return (
    <div className="ko-path-body ko-path-body-out">
      <div className="ko-path-stopwatch" aria-hidden>⏱️</div>
      <div className="ko-path-out-text">Run ended</div>
    </div>
  );
}

function Card({ node, teamCountryCode }: { node: KnockoutPathNode; teamCountryCode: string }) {
  const stateClass =
    node.kind === 'result'
      ? node.teamAdvanced
        ? ' ko-path-card-win'
        : ' ko-path-card-loss'
      : node.kind === 'eliminated'
        ? ' ko-path-card-out'
        : '';

  return (
    <Link
      href={`/worldcup2026/knockout-bracket?highlight=${node.matchNumber}`}
      className={`ko-path-card${stateClass}`}
      prefetch={false}
    >
      <div className="ko-path-phase">{node.roundLabel}</div>
      {node.kind === 'result' && <ResultBody node={node} teamCountryCode={teamCountryCode} />}
      {node.kind === 'upcoming' && <FixtureBody node={node} label="Will face" />}
      {node.kind === 'awaits' && <FixtureBody node={node} label="Awaits" />}
      {node.kind === 'eliminated' && <EliminatedBody />}
    </Link>
  );
}

/**
 * The knockout "journey" for a qualified team: one card per round it has
 * reached (with score + who advanced), plus the upcoming match and the round it
 * awaits — or a stopwatch card for the round it didn't reach once eliminated.
 */
export default function KnockoutPath({ teamName, teamCountryCode, nodes }: Props) {
  if (nodes.length === 0) return null;

  return (
    <section className="ko-path mb-4">
      <div className="ko-path-header">
        <TeamFlag countryCode={teamCountryCode} />
        <span>{teamName} — knockout journey</span>
      </div>
      <div className="ko-path-track">
        {nodes.map((n) => (
          <Card key={n.matchNumber} node={n} teamCountryCode={teamCountryCode} />
        ))}
      </div>
    </section>
  );
}
