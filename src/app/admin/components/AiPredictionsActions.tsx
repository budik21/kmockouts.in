'use client';

import { useMemo, useState } from 'react';
import Spinner from './Spinner';
import {
  AI_PREDICTION_MODELS,
  AI_PREDICTION_MODEL_KEYS,
  type AiPredictionModelKey,
} from '@/lib/ai-model';

export interface AiTeamOption {
  id: number;
  name: string;
  groupId: string;
}

interface AiPredictionsActionsProps {
  teams: AiTeamOption[];
  groups: string[];
  envEnabled: boolean;
  generationFlagEnabled: boolean;
  displayFlagEnabled: boolean;
  initialModel: AiPredictionModelKey;
}

interface RegenerateResponse {
  success: boolean;
  message: string;
  scope: 'team' | 'group';
  groupId: string;
  teamId: number | null;
  elapsedMs: number;
  generated: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'running'; label: string }
  | { kind: 'done'; result: RegenerateResponse }
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

function StatusPill({ on, label, title }: { on: boolean; label: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.85rem',
        fontWeight: 500,
        backgroundColor: on ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
        color: on ? '#4caf50' : '#f44336',
        border: `1px solid ${on ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)'}`,
        cursor: title ? 'help' : 'default',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: on ? '#4caf50' : '#f44336',
        }}
      />
      {label}
    </span>
  );
}

function ResultPanel({ result }: { result: RegenerateResponse }) {
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
      <div style={{ color: '#4caf50', fontWeight: 600, marginBottom: '0.4rem' }}>
        ✓ Done
      </div>
      <div style={{ marginBottom: '0.5rem' }}>{result.message}</div>
      {result.generated > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.5rem 1.25rem',
            color: 'var(--wc-text-muted)',
            fontSize: '0.85rem',
          }}
        >
          <div>
            <span style={{ opacity: 0.7 }}>Duration: </span>
            <span style={{ color: 'var(--wc-text)' }}>{(result.elapsedMs / 1000).toFixed(2)} s</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Summaries: </span>
            <span style={{ color: 'var(--wc-text)' }}>{result.generated}</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Input tokens: </span>
            <span style={{ color: 'var(--wc-text)' }}>{result.inputTokens.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Output tokens: </span>
            <span style={{ color: 'var(--wc-text)' }}>{result.outputTokens.toLocaleString()}</span>
          </div>
          <div>
            <span style={{ opacity: 0.7 }}>Cost: </span>
            <span style={{ color: 'var(--wc-text)' }}>${result.costUsd.toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiPredictionsActions({
  teams,
  groups,
  envEnabled,
  generationFlagEnabled,
  displayFlagEnabled,
  initialModel,
}: AiPredictionsActionsProps) {
  const [model, setModel] = useState<AiPredictionModelKey>(initialModel);
  const [modelPending, setModelPending] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelSavedAt, setModelSavedAt] = useState<number | null>(null);

  async function changeModel(next: AiPredictionModelKey) {
    if (next === model) return;
    const previous = model;
    setModel(next);
    setModelPending(true);
    setModelError(null);
    setModelSavedAt(null);
    try {
      const res = await fetch('/api/admin/ai-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
      }
      setModelSavedAt(Date.now());
    } catch (err) {
      setModel(previous);
      setModelError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setModelPending(false);
    }
  }

  const teamsByGroup = useMemo(() => {
    const map = new Map<string, AiTeamOption[]>();
    for (const t of teams) {
      if (!map.has(t.groupId)) map.set(t.groupId, []);
      map.get(t.groupId)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [teams]);

  const [groupForGroupAction, setGroupForGroupAction] = useState<string>(groups[0] ?? '');
  const [teamSelected, setTeamSelected] = useState<number | null>(teams[0]?.id ?? null);

  const [groupState, setGroupState] = useState<ActionState>({ kind: 'idle' });
  const [teamState, setTeamState] = useState<ActionState>({ kind: 'idle' });

  async function runRegenerate(
    body: { scope: 'team' | 'group'; groupId: string; teamId?: number },
    setState: (s: ActionState) => void,
    runningLabel: string,
  ) {
    setState({ kind: 'running', label: runningLabel });
    try {
      const res = await fetch('/api/admin/ai-predictions/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
      }
      setState({ kind: 'done', result: data as RegenerateResponse });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const teamGroup = teamSelected
    ? teams.find(t => t.id === teamSelected)?.groupId
    : undefined;

  const modelInfo = AI_PREDICTION_MODELS[model];

  return (
    <>
      {/* Model selector — applies to every AI prediction call (team articles,
          group articles, scenario summaries, best-third summaries). */}
      <div style={cardStyle}>
        <div style={titleStyle}>Generation model</div>
        <div style={descStyle}>
          Which Claude model to call for every AI prediction (team articles,
          group articles, per-position scenario summaries, best-third summaries).
          Twitter drafts have their own per-call selector and are not affected
          by this setting. Changes take effect within ~30 seconds across the
          app and apply to the NEXT regeneration — existing cached predictions
          are not invalidated.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label
            htmlFor="ai-model-select"
            style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
          >
            Model:
          </label>
          <select
            id="ai-model-select"
            value={model}
            onChange={(e) => changeModel(e.target.value as AiPredictionModelKey)}
            disabled={modelPending}
            style={selectStyle}
          >
            {AI_PREDICTION_MODEL_KEYS.map(key => (
              <option key={key} value={key}>
                {AI_PREDICTION_MODELS[key].label} — ${AI_PREDICTION_MODELS[key].inputUsdPerMtok}/MTok in, ${AI_PREDICTION_MODELS[key].outputUsdPerMtok}/MTok out
              </option>
            ))}
          </select>
          {modelPending && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--wc-text)',
                fontSize: '0.9rem',
              }}
            >
              <Spinner size="sm" />
              Saving…
            </span>
          )}
          {!modelPending && modelSavedAt && (
            <span style={{ color: '#4caf50', fontSize: '0.85rem' }}>✓ Saved</span>
          )}
        </div>
        <div
          style={{
            marginTop: '0.75rem',
            color: 'var(--wc-text-muted)',
            fontSize: '0.85rem',
          }}
        >
          Selected: <code style={{ color: 'var(--wc-text)' }}>{modelInfo.id}</code>
          {' · '}cache-read ${modelInfo.cacheReadUsdPerMtok}/MTok
          {' · '}cache-write ${modelInfo.cacheWriteUsdPerMtok}/MTok
        </div>
        {modelError && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.6rem 0.85rem',
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.4)',
              borderRadius: '0.25rem',
              color: '#f44336',
              fontSize: '0.9rem',
            }}
          >
            ✗ {modelError}
          </div>
        )}
      </div>

      {/* Status banner */}
      <div style={cardStyle}>
        <div style={titleStyle}>Current state (info only)</div>
        <div style={descStyle}>
          These flags affect normal page rendering and background pre-generation.
          The actions below run as superadmin and ignore them — they will call
          Claude even when generation is disabled.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          <StatusPill
            on={envEnabled}
            label={`AI_PREDICTIONS_ENABLED env: ${envEnabled ? 'on' : 'off'}`}
          />
          <StatusPill
            on={envEnabled && generationFlagEnabled}
            label={`ai_predictions (generation): ${
              envEnabled
                ? generationFlagEnabled
                  ? 'on'
                  : 'off'
                : 'locked off (env)'
            }${!envEnabled && generationFlagEnabled ? ' · DB: on' : ''}`}
            title={
              !envEnabled && generationFlagEnabled
                ? 'DB flag is on, but the AI_PREDICTIONS_ENABLED env kill-switch overrides it. Effective state: off.'
                : undefined
            }
          />
          <StatusPill
            on={displayFlagEnabled}
            label={`ai_predictions_display (display): ${displayFlagEnabled ? 'on' : 'off'}`}
          />
        </div>
      </div>

      {/* Group regen */}
      <div style={cardStyle}>
        <div style={titleStyle}>Regenerate AI predictions for a group</div>
        <div style={descStyle}>
          Regenerates scenario summaries for every team in the selected group,
          then the group article and all four team articles. Existing entries
          in <code>ai_summary_cache</code> and the article caches are
          overwritten without asking. Best-third summaries are not touched.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label
            htmlFor="ai-group-select"
            style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
          >
            Group:
          </label>
          <select
            id="ai-group-select"
            value={groupForGroupAction}
            onChange={(e) => setGroupForGroupAction(e.target.value)}
            disabled={groupState.kind === 'running'}
            style={selectStyle}
          >
            {groups.map(g => (
              <option key={g} value={g}>
                Group {g}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              runRegenerate(
                { scope: 'group', groupId: groupForGroupAction },
                setGroupState,
                `Regenerating predictions for group ${groupForGroupAction}…`,
              )
            }
            disabled={groupState.kind === 'running' || !groupForGroupAction}
            style={{ ...buttonStyle, opacity: groupState.kind === 'running' ? 0.6 : 1 }}
          >
            Regenerate group
          </button>
          {groupState.kind === 'running' && (
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
              {groupState.label}
            </span>
          )}
        </div>
        {groupState.kind === 'done' && <ResultPanel result={groupState.result} />}
        {groupState.kind === 'error' && (
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
            ✗ {groupState.message}
          </div>
        )}
      </div>

      {/* Team regen */}
      <div style={cardStyle}>
        <div style={titleStyle}>Regenerate AI predictions for a single team</div>
        <div style={descStyle}>
          Regenerates scenario summaries only for the selected team
          (every position they could still finish in) plus the team&apos;s
          article. The group article is left untouched. Cheaper than running
          the whole group — typically a handful of Claude calls.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label
            htmlFor="ai-team-select"
            style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem' }}
          >
            Team:
          </label>
          <select
            id="ai-team-select"
            value={teamSelected ?? ''}
            onChange={(e) => setTeamSelected(e.target.value ? Number(e.target.value) : null)}
            disabled={teamState.kind === 'running'}
            style={{ ...selectStyle, minWidth: '16rem' }}
          >
            {[...teamsByGroup.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([gid, list]) => (
                <optgroup key={gid} label={`Group ${gid}`}>
                  {list.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
          <button
            onClick={() => {
              if (!teamSelected || !teamGroup) return;
              const teamName = teams.find(t => t.id === teamSelected)?.name ?? `team ${teamSelected}`;
              runRegenerate(
                { scope: 'team', groupId: teamGroup, teamId: teamSelected },
                setTeamState,
                `Regenerating predictions for ${teamName}…`,
              );
            }}
            disabled={teamState.kind === 'running' || !teamSelected}
            style={{ ...buttonStyle, opacity: teamState.kind === 'running' ? 0.6 : 1 }}
          >
            Regenerate team
          </button>
          {teamState.kind === 'running' && (
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
              {teamState.label}
            </span>
          )}
        </div>
        {teamState.kind === 'done' && <ResultPanel result={teamState.result} />}
        {teamState.kind === 'error' && (
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
            ✗ {teamState.message}
          </div>
        )}
      </div>
    </>
  );
}
