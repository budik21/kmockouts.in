'use client';

import { useMemo, useState } from 'react';
import Spinner from './Spinner';
import type { TwitterTeamOption } from './TwitterTab';

interface TwitterWizardProps {
  teams: TwitterTeamOption[];
  onClose: () => void;
  onPublished: () => void;
}

type Step = 'pick' | 'simple' | 'scenario';
type ScenarioKind = 'pre' | 'post';

const TWEET_MAX = 280;
const URL_WEIGHT = 24; // t.co URL (23) + leading space

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '3rem 1rem',
  overflowY: 'auto',
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '720px',
  background: 'var(--wc-surface)',
  border: '1px solid var(--wc-border)',
  borderRadius: '0.5rem',
  padding: '1.5rem',
  color: 'var(--wc-text)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: '0.25rem',
  border: '1px solid var(--wc-border)',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--wc-text)',
  fontSize: '0.95rem',
};

const buttonPrimary: React.CSSProperties = {
  padding: '0.5rem 1rem',
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

interface CounterTextareaProps {
  value: string;
  onChange: (v: string) => void;
  effectiveMax: number;       // hard limit for own-text length (280 simple, 256 scenario)
  placeholder?: string;
  disabled?: boolean;
}

function CounterTextarea({ value, onChange, effectiveMax, placeholder, disabled }: CounterTextareaProps) {
  const codepoints = useMemo(() => [...value], [value]);
  const len = codepoints.length;

  // Highlight the over-limit tail by overlaying a styled "ghost" copy of the
  // text behind the actual textarea. Anything past effectiveMax gets a
  // red-tinted background so the user sees exactly which characters must go.
  const inLimit = codepoints.slice(0, effectiveMax).join('');
  const overflow = codepoints.slice(effectiveMax).join('');
  const over = len > effectiveMax;

  return (
    <div>
      <div style={{ position: 'relative', fontFamily: 'ui-monospace, monospace' }}>
        <pre
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            margin: 0,
            padding: '0.6rem 0.7rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'transparent',
            pointerEvents: 'none',
            font: 'inherit',
            fontSize: '0.95rem',
            lineHeight: 1.45,
            border: '1px solid transparent',
            borderRadius: '0.25rem',
          }}
        >
          {inLimit}
          <span style={{ background: 'rgba(239, 68, 68, 0.5)' }}>{overflow}</span>
          {/* trailing newline so layout matches textarea */}
          {'\n'}
        </pre>
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          style={{
            ...inputStyle,
            position: 'relative',
            background: 'rgba(0,0,0,0.25)',
            font: 'inherit',
            fontSize: '0.95rem',
            lineHeight: 1.45,
            padding: '0.6rem 0.7rem',
            resize: 'vertical',
            minHeight: '160px',
          }}
        />
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          fontSize: '0.85rem',
          color: over ? '#fca5a5' : len > effectiveMax * 0.9 ? '#fbbf24' : 'var(--wc-text-muted)',
          textAlign: 'right',
        }}
      >
        {len} / {effectiveMax}
      </div>
    </div>
  );
}

export default function TwitterWizard({ teams, onClose, onPublished }: TwitterWizardProps) {
  const [step, setStep] = useState<Step>('pick');
  return (
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>New tweet</h3>
          <button type="button" style={buttonGhost} onClick={onClose}>Close</button>
        </div>

        {step === 'pick' && (
          <PickStep
            onSimple={() => setStep('simple')}
            onScenario={() => setStep('scenario')}
          />
        )}
        {step === 'simple' && (
          <SimpleStep
            onBack={() => setStep('pick')}
            onPublished={onPublished}
          />
        )}
        {step === 'scenario' && (
          <ScenarioStep
            teams={teams}
            onBack={() => setStep('pick')}
            onPublished={onPublished}
          />
        )}
      </div>
    </div>
  );
}

function PickStep({ onSimple, onScenario }: { onSimple: () => void; onScenario: () => void }) {
  return (
    <div>
      <p style={{ color: 'var(--wc-text-muted)' }}>Choose a template:</p>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <button type="button" onClick={onSimple} style={{ ...buttonGhost, textAlign: 'left', padding: '1rem', display: 'block' }}>
          <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.25rem' }}>(a) Simple post</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--wc-text-muted)' }}>
            Free text up to 280 characters with an optional image (PNG / JPG / GIF).
          </span>
        </button>
        <button type="button" onClick={onScenario} style={{ ...buttonGhost, textAlign: 'left', padding: '1rem', display: 'block' }}>
          <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.25rem' }}>(b) Scenario post</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--wc-text-muted)' }}>
            Pick a team + pre/post-match. AI drafts the text and an infographic image is auto-generated.
            A link to the team page is auto-appended.
          </span>
        </button>
      </div>
    </div>
  );
}

function SimpleStep({ onBack, onPublished }: { onBack: () => void; onPublished: () => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = [...text].length;
  const tooLong = len > TWEET_MAX;
  const canSubmit = text.trim().length > 0 && !tooLong && !submitting;

  function handleFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('text', text);
      fd.append('template', 'simple');
      if (file) fd.append('media', file);
      const res = await fetch('/api/admin/twitter/post', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <CounterTextarea
        value={text}
        onChange={setText}
        effectiveMax={TWEET_MAX}
        placeholder="What's happening?"
        disabled={submitting}
      />
      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--wc-text-muted)' }}>
          Image (optional, PNG / JPG / GIF, ≤ 5 MB)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
        />
        {preview && (
          <div style={{ marginTop: '0.75rem' }}>
            <img src={preview} alt="" style={{ maxHeight: '220px', borderRadius: '6px', border: '1px solid var(--wc-border)' }} />
          </div>
        )}
      </div>
      {error && <div style={{ color: '#fca5a5', marginTop: '0.75rem' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', gap: '0.5rem' }}>
        <button type="button" style={buttonGhost} onClick={onBack} disabled={submitting}>← Back</button>
        <button type="button" style={buttonPrimary} disabled={!canSubmit} onClick={submit}>
          {submitting ? <Spinner /> : 'Publish'}
        </button>
      </div>
    </div>
  );
}

interface DraftResponse {
  text: string;
  teamUrl: string;
  appendedUrlWeight: number;
}

function ScenarioStep({ teams, onBack, onPublished }: { teams: TwitterTeamOption[]; onBack: () => void; onPublished: () => void }) {
  const [teamId, setTeamId] = useState<number | ''>('');
  const [kind, setKind] = useState<ScenarioKind>('post');
  const [text, setText] = useState('');
  const [teamUrl, setTeamUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ogTimestamp, setOgTimestamp] = useState<number>(Date.now());

  const effectiveMax = TWEET_MAX - URL_WEIGHT;
  const len = [...text].length;
  const tooLong = len > effectiveMax;

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
      setOgTimestamp(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
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
      const res = await fetch('/api/admin/twitter/post', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const canPublish = !!teamId && text.trim().length > 0 && !tooLong && !submitting && !generating;
  const canGenerate = !!teamId && !generating && !submitting;

  const ogSrc = teamId
    ? `/api/admin/twitter/og?teamId=${teamId}&kind=${kind}&t=${ogTimestamp}`
    : null;

  return (
    <div>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '2fr 1fr', alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.25rem' }}>
            Team
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}
            style={inputStyle}
            disabled={generating || submitting}
          >
            <option value="">— select a team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                Group {t.groupId}: {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.25rem' }}>
            Type
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label style={{ flex: 1 }}>
              <input
                type="radio"
                name="kind"
                checked={kind === 'pre'}
                onChange={() => setKind('pre')}
                disabled={generating || submitting}
              />{' '}
              Pre-match
            </label>
            <label style={{ flex: 1 }}>
              <input
                type="radio"
                name="kind"
                checked={kind === 'post'}
                onChange={() => setKind('post')}
                disabled={generating || submitting}
              />{' '}
              Post-match
            </label>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" style={buttonPrimary} disabled={!canGenerate} onClick={generate}>
          {generating ? <Spinner /> : text ? 'Regenerate text' : 'Generate text'}
        </button>
        {teamId && (
          <a
            href={ogSrc!}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...buttonGhost, textDecoration: 'none', display: 'inline-block' }}
          >
            Preview image ↗
          </a>
        )}
      </div>

      {ogSrc && (
        <div style={{ marginTop: '0.85rem' }}>
          <img
            key={ogTimestamp}
            src={ogSrc}
            alt="Tweet image preview"
            style={{ width: '100%', borderRadius: '6px', border: '1px solid var(--wc-border)' }}
          />
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--wc-text-muted)', marginBottom: '0.25rem' }}>
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
            <a href={teamUrl} target="_blank" rel="noopener noreferrer">{teamUrl}</a>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#fca5a5', marginTop: '0.75rem' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', gap: '0.5rem' }}>
        <button type="button" style={buttonGhost} onClick={onBack} disabled={generating || submitting}>← Back</button>
        <button type="button" style={buttonPrimary} disabled={!canPublish} onClick={publish}>
          {submitting ? <Spinner /> : 'Publish'}
        </button>
      </div>
    </div>
  );
}
