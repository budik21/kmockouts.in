'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from '../../../components/Spinner';
import TeamFlag from '../../../../components/TeamFlag';
import { CounterTextarea, SuccessPanel, type PublishedTweet } from '../simple/SimplePostForm';

interface TeamOption {
  id: number;
  name: string;
  groupId: string;
  countryCode: string;
}

interface ScenarioPostFormProps {
  teams: TeamOption[];
}

type Kind = 'pre' | 'post';
type Variant = 1 | 2 | 3;

const TWEET_MAX = 280;
const URL_WEIGHT = 24;

const buttonPrimary: React.CSSProperties = {
  padding: '0.5rem 1.1rem',
  fontWeight: 600,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  backgroundColor: 'var(--wc-accent)',
  color: '#2a1a00',
  border: 'none',
};

const buttonGhost: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontWeight: 500,
  borderRadius: '0.25rem',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: 'var(--wc-text)',
  border: '1px solid var(--wc-border)',
};

interface TeamPickerProps {
  teams: TeamOption[];
  value: number | null;
  onChange: (teamId: number | null) => void;
  disabled?: boolean;
}

function TeamPicker({ teams, value, onChange, disabled }: TeamPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value != null ? teams.find((t) => t.id === value) ?? null : null),
    [teams, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.groupId.toLowerCase().includes(q) ||
        t.countryCode.toLowerCase().includes(q),
    );
  }, [teams, query]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function pick(team: TeamOption) {
    onChange(team.id);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlightIdx]) {
      e.preventDefault();
      pick(filtered[highlightIdx]);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <style>{`
        .tw-picker-trigger {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          width: 100%;
          padding: 0.55rem 0.75rem;
          background: rgba(0,0,0,0.25);
          border: 1px solid var(--wc-border);
          border-radius: 0.25rem;
          color: var(--wc-text);
          cursor: pointer;
          text-align: left;
          font-size: 0.95rem;
          transition: border-color 0.15s ease;
        }
        .tw-picker-trigger:hover:not(:disabled) {
          border-color: var(--wc-accent);
        }
        .tw-picker-trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .tw-picker-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: var(--wc-surface);
          border: 1px solid var(--wc-border);
          border-radius: 0.35rem;
          box-shadow: 0 12px 30px rgba(0,0,0,0.45);
          z-index: 50;
          max-height: 360px;
          overflow-y: auto;
        }
        .tw-picker-input-wrap {
          padding: 0.5rem;
          border-bottom: 1px solid var(--wc-border);
        }
        .tw-picker-input {
          width: 100%;
          padding: 0.4rem 0.55rem;
          background: rgba(0,0,0,0.25);
          border: 1px solid var(--wc-border);
          border-radius: 0.25rem;
          color: var(--wc-text);
          font-size: 0.9rem;
        }
        .tw-picker-item {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.45rem 0.7rem;
          cursor: pointer;
          color: var(--wc-text);
          transition: background-color 0.1s ease;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-size: 0.93rem;
        }
        .tw-picker-item:hover,
        .tw-picker-item--active {
          background: rgba(255,255,255,0.06);
        }
        .tw-picker-group {
          color: var(--wc-text-muted);
          font-size: 0.8rem;
          margin-left: auto;
        }
        .tw-picker-empty {
          padding: 0.85rem;
          color: var(--wc-text-muted);
          text-align: center;
          font-size: 0.9rem;
        }
      `}</style>

      <button
        type="button"
        className="tw-picker-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        disabled={disabled}
      >
        {selected ? (
          <>
            <TeamFlag countryCode={selected.countryCode} size="md" />
            <span style={{ fontWeight: 500 }}>{selected.name}</span>
            <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
              Group {selected.groupId}
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--wc-text-muted)' }}>▾</span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--wc-text-muted)' }}>Select a team…</span>
            <span style={{ marginLeft: 'auto', color: 'var(--wc-text-muted)' }}>▾</span>
          </>
        )}
      </button>

      {open && (
        <div className="tw-picker-dropdown">
          <div className="tw-picker-input-wrap">
            <input
              ref={inputRef}
              className="tw-picker-input"
              placeholder="Search team or group…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightIdx(0);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="tw-picker-empty">No teams match.</div>
          ) : (
            filtered.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={`tw-picker-item ${i === highlightIdx ? 'tw-picker-item--active' : ''}`}
                onMouseEnter={() => setHighlightIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(t);
                }}
              >
                <TeamFlag countryCode={t.countryCode} size="md" />
                <span style={{ fontWeight: 500 }}>{t.name}</span>
                <span className="tw-picker-group">Group {t.groupId}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface KindToggleProps {
  value: Kind;
  onChange: (k: Kind) => void;
  disabled?: boolean;
}

function KindToggle({ value, onChange, disabled }: KindToggleProps) {
  return (
    <div
      role="group"
      aria-label="Match phase"
      style={{
        display: 'inline-flex',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--wc-border)',
        borderRadius: '999px',
        padding: '3px',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {(['pre', 'post'] as const).map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(k)}
            style={{
              padding: '0.4rem 1.1rem',
              borderRadius: '999px',
              border: 'none',
              background: active ? 'var(--wc-accent)' : 'transparent',
              color: active ? '#2a1a00' : 'var(--wc-text-muted)',
              fontWeight: active ? 700 : 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
          >
            {k === 'pre' ? 'Pre-match' : 'Post-match'}
          </button>
        );
      })}
    </div>
  );
}

interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  model: string;
}

interface DraftResponse {
  text: string;
  teamUrl: string;
  appendedUrlWeight: number;
  usage?: AiUsage;
}

export default function ScenarioPostForm({ teams }: ScenarioPostFormProps) {
  const router = useRouter();
  const [teamId, setTeamId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('post');
  const [text, setText] = useState('');
  const [teamUrl, setTeamUrl] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>(1);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ogTimestamp, setOgTimestamp] = useState<number>(Date.now());
  const [graphicGenerated, setGraphicGenerated] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [published, setPublished] = useState<PublishedTweet | null>(null);

  const effectiveMax = TWEET_MAX - URL_WEIGHT;
  const len = [...text].length;
  const tooLong = len > effectiveMax;

  // Team/kind changes invalidate the prepared graphic and URL hint.
  useEffect(() => {
    setGraphicGenerated(false);
    setTeamUrl(null);
    setUsage(null);
  }, [teamId, kind]);

  async function generate() {
    if (!teamId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/twitter/scenario/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const draft = body as DraftResponse;
      setText(draft.text);
      setTeamUrl(draft.teamUrl);
      if (draft.usage) setUsage(draft.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function generateGraphic() {
    if (!teamId) return;
    setGraphicGenerated(true);
    setOgTimestamp(Date.now());
  }

  async function publish() {
    if (!teamId) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('template', kind === 'pre' ? 'scenario_pre' : 'scenario_post');
      fd.append('teamId', String(teamId));
      fd.append('ogKind', kind);
      fd.append('variant', String(variant));
      if (graphicGenerated) fd.append('includeGraphic', 'true');
      const res = await fetch('/api/admin/twitter/post', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const url = teamUrl ? `${text} ${teamUrl}` : text;
      setPublished({ tweetId: String(body.tweetId), url: String(body.url), text: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setText('');
    setTeamUrl(null);
    setUsage(null);
    setPublished(null);
    setError(null);
    setOgTimestamp(Date.now());
    setGraphicGenerated(false);
  }

  const canGenerate = !!teamId && !generating && !submitting;
  const canGenerateGraphic = !!teamId && !generating && !submitting;
  const canPublish = !!teamId && text.trim().length > 0 && !tooLong && !submitting && !generating;

  if (published) {
    return (
      <SuccessPanel
        published={published}
        onPostAnother={reset}
        onBackToDashboard={() => router.push('/admin/dashboard?tab=twitter')}
      />
    );
  }

  return (
    <div>
      <style>{`
        .tw-variant-card {
          padding: 0.5rem;
          border-radius: 0.5rem;
          border: 2px solid var(--wc-border);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
          display: block;
        }
        .tw-variant-card:hover {
          transform: translateY(-2px);
          border-color: var(--wc-accent);
          box-shadow: 0 8px 22px rgba(0,0,0,0.35);
        }
        .tw-variant-card--selected {
          border-color: var(--wc-accent);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 3px rgba(var(--wc-accent-rgb, 251 191 36), 0.25);
        }
        .tw-variant-img {
          width: 100%;
          aspect-ratio: 1200 / 675;
          border-radius: 0.35rem;
          background: rgba(0,0,0,0.4);
          display: block;
          object-fit: cover;
        }
        .tw-variant-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: var(--wc-text-muted);
        }
        .tw-variant-name {
          font-weight: 600;
          color: var(--wc-text);
        }
      `}</style>

      <div className="row g-3 align-items-end">
        <div className="col-12 col-md-7">
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.3rem' }}>
            Team
          </label>
          <TeamPicker
            teams={teams}
            value={teamId}
            onChange={setTeamId}
            disabled={generating || submitting}
          />
        </div>
        <div className="col-12 col-md-5">
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.3rem' }}>
            Match phase
          </label>
          <KindToggle value={kind} onChange={setKind} disabled={generating || submitting} />
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...buttonPrimary, opacity: canGenerate ? 1 : 0.55, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
          disabled={!canGenerate}
          onClick={generate}
        >
          {generating ? <Spinner /> : text ? 'Regenerate text' : 'Generate text'}
        </button>
        {!teamId && (
          <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--wc-text-muted)' }}>
            Select a team to enable text generation.
          </span>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.3rem' }}>
          Tweet text (max {effectiveMax} chars; {URL_WEIGHT} chars reserved for the team URL)
        </label>
        <CounterTextarea
          value={text}
          onChange={setText}
          effectiveMax={effectiveMax}
          placeholder="Click 'Generate text' to draft this with AI."
          disabled={generating || submitting}
        />
        {teamUrl && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--wc-text-muted)' }}>
            Auto-appended:{' '}
            <a href={teamUrl} target="_blank" rel="noopener noreferrer">
              {teamUrl}
            </a>
          </div>
        )}
        {usage && (
          <div
            style={{
              marginTop: '0.6rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.35rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--wc-border)',
              fontSize: '0.82rem',
              color: 'var(--wc-text-muted)',
            }}
          >
            <strong style={{ color: 'var(--wc-text)' }}>AI cost:</strong>{' '}
            {usage.inputTokens.toLocaleString()} in + {usage.outputTokens.toLocaleString()} out tokens
            {' · '}~${usage.costUsd.toFixed(4)}
            {' · '}{(usage.elapsedMs / 1000).toFixed(1)}s
            {' · '}<code>{usage.model}</code>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...buttonPrimary, opacity: canGenerateGraphic ? 1 : 0.55, cursor: canGenerateGraphic ? 'pointer' : 'not-allowed' }}
          disabled={!canGenerateGraphic}
          onClick={generateGraphic}
        >
          {graphicGenerated ? 'Regenerate graphic' : 'Generate graphic'}
        </button>
        <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: 'var(--wc-text-muted)' }}>
          {graphicGenerated
            ? 'Selected graphic will be attached to the tweet.'
            : 'Skip this to publish text with the team URL only.'}
        </span>
      </div>

      {graphicGenerated && teamId && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ color: 'var(--wc-text)', fontSize: '1rem', marginBottom: '0.5rem' }}>
            Pick a graphic
          </h3>
          <p style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem 0' }}>
            One image is attached to the tweet. Click a layout to select it — the selected one
            is highlighted.
          </p>
          <div className="row g-3">
            {([1, 2, 3] as Variant[]).map((v) => {
              const selected = variant === v;
              const labels: Record<Variant, string> = {
                1: 'Modern Dark',
                2: 'Bold Flag',
                3: 'Stat Focus',
              };
              const src = `/api/admin/twitter/og?teamId=${teamId}&kind=${kind}&variant=${v}&t=${ogTimestamp}`;
              return (
                <div key={v} className="col-12 col-md-4">
                  <button
                    type="button"
                    className={`tw-variant-card ${selected ? 'tw-variant-card--selected' : ''}`}
                    onClick={() => setVariant(v)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`${v}-${ogTimestamp}`}
                      src={src}
                      alt={`Variant ${v}`}
                      className="tw-variant-img"
                    />
                    <div className="tw-variant-label">
                      <span className="tw-variant-name">{labels[v]}</span>
                      <span>{selected ? '✓ selected' : `Variant ${v}`}</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <div style={{ color: '#fca5a5', marginTop: '0.75rem' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', gap: '0.5rem' }}>
        <a href="/admin/twitter/new" style={{ ...buttonGhost, textDecoration: 'none', display: 'inline-block' }}>
          Cancel
        </a>
        <button
          type="button"
          style={{ ...buttonPrimary, opacity: canPublish ? 1 : 0.55, cursor: canPublish ? 'pointer' : 'not-allowed' }}
          disabled={!canPublish}
          onClick={publish}
        >
          {submitting ? <Spinner /> : 'Publish'}
        </button>
      </div>
    </div>
  );
}
