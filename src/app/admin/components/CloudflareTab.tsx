'use client';

import { useMemo, useState } from 'react';
import Spinner from './Spinner';
import type { AiTeamOption } from './AiPredictionsActions';

interface CloudflareTabProps {
  teams: AiTeamOption[];
  groups: string[];
}

interface PurgeResponse {
  success: boolean;
  message: string;
  scope: 'all' | 'group' | 'team';
  label: string;
  warmedCount: number;
  elapsedMs: number;
  warmMs: number;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'running'; label: string }
  | { kind: 'done'; result: PurgeResponse }
  | { kind: 'error'; message: string };

const cardStyle: React.CSSProperties = {
  padding: '1.5rem',
  marginBottom: '1rem',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--wc-border)',
  borderRadius: '0.375rem',
};

const titleStyle: React.CSSProperties = {
  color: 'var(--wc-text)',
  fontSize: '1.05rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
};

const descStyle: React.CSSProperties = {
  color: 'var(--wc-text-muted)',
  fontSize: '0.9rem',
  marginBottom: '1rem',
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontWeight: 600,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  backgroundColor: 'var(--wc-accent)',
  color: '#2a1a00',
  border: 'none',
};

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: '0.25rem',
  border: '1px solid var(--wc-border)',
  backgroundColor: 'var(--wc-surface)',
  color: 'var(--wc-text)',
  fontSize: '0.95rem',
  minWidth: '12rem',
};

function ResultPanel({ result }: { result: PurgeResponse }) {
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem 1rem',
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        border: '1px solid rgba(76, 175, 80, 0.3)',
        borderRadius: '0.25rem',
        color: 'var(--wc-text)',
        fontSize: '0.9rem',
        lineHeight: 1.55,
      }}
    >
      <div style={{ color: '#4caf50', fontWeight: 600, marginBottom: '0.4rem' }}>✓ Done</div>
      <div>{result.message}</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        border: '1px solid rgba(244, 67, 54, 0.4)',
        borderRadius: '0.25rem',
        color: '#f44336',
        fontSize: '0.9rem',
      }}
    >
      ✗ {message}
    </div>
  );
}

function RunningLabel({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: 'var(--wc-text)',
        fontSize: '0.95rem',
      }}
    >
      <Spinner size="sm" />
      {label}
    </span>
  );
}

export default function CloudflareTab({ teams, groups }: CloudflareTabProps) {
  const teamsByGroup = useMemo(() => {
    const map = new Map<string, AiTeamOption[]>();
    for (const t of teams) {
      if (!map.has(t.groupId)) map.set(t.groupId, []);
      map.get(t.groupId)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [teams]);

  const [groupSelected, setGroupSelected] = useState<string>(groups[0] ?? '');
  const [teamSelected, setTeamSelected] = useState<number | null>(teams[0]?.id ?? null);

  const [allState, setAllState] = useState<ActionState>({ kind: 'idle' });
  const [groupState, setGroupState] = useState<ActionState>({ kind: 'idle' });
  const [teamState, setTeamState] = useState<ActionState>({ kind: 'idle' });

  async function runPurge(
    body: { scope: 'all' | 'group' | 'team'; groupId?: string; teamId?: number },
    setState: (s: ActionState) => void,
    runningLabel: string,
  ) {
    setState({ kind: 'running', label: runningLabel });
    try {
      const res = await fetch('/api/admin/cloudflare/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
      }
      setState({ kind: 'done', result: data as PurgeResponse });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const teamGroup = teamSelected ? teams.find((t) => t.id === teamSelected)?.groupId : undefined;

  return (
    <>
      {/* Complete purge */}
      <div style={cardStyle}>
        <div style={titleStyle}>Complete Cache Purge</div>
        <div style={descStyle}>
          Drops the <strong>entire</strong> Cloudflare edge cache
          (<code>purge_everything</code>) and expires the Next.js WC + leaderboard
          caches, then re-warms every World&nbsp;Cup page (overview, best-third,
          fixtures, all groups and all team pages). The full sweep warms ~50 URLs
          and can take a while — leave the page open until it reports done.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (
                !window.confirm(
                  'Purge the ENTIRE Cloudflare cache and re-warm every WC page? ' +
                    'The first visitors during the warm-up will hit a cold cache.',
                )
              ) {
                return;
              }
              runPurge({ scope: 'all' }, setAllState, 'Purging everything and re-warming all pages…');
            }}
            disabled={allState.kind === 'running'}
            style={{ ...buttonStyle, opacity: allState.kind === 'running' ? 0.6 : 1 }}
          >
            Complete Cache Purge
          </button>
          {allState.kind === 'running' && <RunningLabel label={allState.label} />}
        </div>
        {allState.kind === 'done' && <ResultPanel result={allState.result} />}
        {allState.kind === 'error' && <ErrorPanel message={allState.message} />}
      </div>

      {/* Group purge */}
      <div style={cardStyle}>
        <div style={titleStyle}>Purge Group Cache</div>
        <div style={descStyle}>
          Purges and re-warms one group: the group page plus every team page in it,
          and the tournament aggregates (overview, best-third, fixtures) since group
          standings feed into those.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="cf-group-select" style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}>
            Group:
          </label>
          <select
            id="cf-group-select"
            value={groupSelected}
            onChange={(e) => setGroupSelected(e.target.value)}
            disabled={groupState.kind === 'running'}
            style={selectStyle}
          >
            {groups.map((g) => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              runPurge(
                { scope: 'group', groupId: groupSelected },
                setGroupState,
                `Purging and re-warming group ${groupSelected}…`,
              )
            }
            disabled={groupState.kind === 'running' || !groupSelected}
            style={{ ...buttonStyle, opacity: groupState.kind === 'running' ? 0.6 : 1 }}
          >
            Purge Group Cache
          </button>
          {groupState.kind === 'running' && <RunningLabel label={groupState.label} />}
        </div>
        {groupState.kind === 'done' && <ResultPanel result={groupState.result} />}
        {groupState.kind === 'error' && <ErrorPanel message={groupState.message} />}
      </div>

      {/* Team purge */}
      <div style={cardStyle}>
        <div style={titleStyle}>Purge Team Cache</div>
        <div style={descStyle}>
          Purges and re-warms a single team page, plus its group page and the
          tournament aggregates (a team&apos;s result ripples into the group table
          and overview). Cheapest of the three.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label htmlFor="cf-team-select" style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}>
            Team:
          </label>
          <select
            id="cf-team-select"
            value={teamSelected ?? ''}
            onChange={(e) => setTeamSelected(e.target.value ? Number(e.target.value) : null)}
            disabled={teamState.kind === 'running'}
            style={{ ...selectStyle, minWidth: '16rem' }}
          >
            {[...teamsByGroup.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([gid, list]) => (
                <optgroup key={gid} label={`Group ${gid}`}>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <button
            onClick={() => {
              if (!teamSelected) return;
              const teamName = teams.find((t) => t.id === teamSelected)?.name ?? `team ${teamSelected}`;
              runPurge(
                { scope: 'team', teamId: teamSelected },
                setTeamState,
                `Purging and re-warming ${teamName}…`,
              );
            }}
            disabled={teamState.kind === 'running' || !teamSelected || !teamGroup}
            style={{ ...buttonStyle, opacity: teamState.kind === 'running' ? 0.6 : 1 }}
          >
            Purge Team Cache
          </button>
          {teamState.kind === 'running' && <RunningLabel label={teamState.label} />}
        </div>
        {teamState.kind === 'done' && <ResultPanel result={teamState.result} />}
        {teamState.kind === 'error' && <ErrorPanel message={teamState.message} />}
      </div>
    </>
  );
}
