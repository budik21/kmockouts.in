'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from '../../../components/Spinner';

const TWEET_MAX = 280;

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

interface CounterTextareaProps {
  value: string;
  onChange: (v: string) => void;
  effectiveMax: number;
  placeholder?: string;
  disabled?: boolean;
}

export function CounterTextarea({ value, onChange, effectiveMax, placeholder, disabled }: CounterTextareaProps) {
  const codepoints = useMemo(() => [...value], [value]);
  const len = codepoints.length;
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
          {'\n'}
        </pre>
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={12}
          style={{
            ...inputStyle,
            position: 'relative',
            background: 'rgba(0,0,0,0.25)',
            font: 'inherit',
            fontSize: '0.95rem',
            lineHeight: 1.45,
            padding: '0.6rem 0.7rem',
            resize: 'vertical',
            minHeight: '320px',
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

export interface PublishedTweet {
  tweetId: string;
  url: string;
  text: string;
}

interface SuccessPanelProps {
  published: PublishedTweet;
  onPostAnother: () => void;
  onBackToDashboard: () => void;
}

export function SuccessPanel({ published, onPostAnother, onBackToDashboard }: SuccessPanelProps) {
  return (
    <div
      style={{
        padding: '1.5rem',
        borderRadius: '0.5rem',
        border: '1px solid rgba(34,197,94,0.45)',
        background: 'rgba(34,197,94,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <span
          aria-hidden
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: '#22c55e',
            color: '#052e16',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
          }}
        >
          ✓
        </span>
        <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--wc-text)' }}>
          Tweet published successfully
        </h2>
      </div>
      <div
        style={{
          marginTop: '0.6rem',
          padding: '0.75rem 0.9rem',
          borderRadius: '0.35rem',
          background: 'rgba(0,0,0,0.25)',
          color: 'var(--wc-text)',
          fontSize: '0.92rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {published.text}
      </div>
      <div style={{ marginTop: '0.85rem', fontSize: '0.9rem', color: 'var(--wc-text-muted)' }}>
        Tweet ID: <code style={{ color: 'var(--wc-text)' }}>{published.tweetId}</code>
        {' · '}
        <a href={published.url} target="_blank" rel="noopener noreferrer">
          Open on X →
        </a>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
        <button type="button" style={buttonPrimary} onClick={onPostAnother}>
          Post another
        </button>
        <button type="button" style={buttonGhost} onClick={onBackToDashboard}>
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

export default function SimplePostForm() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedTweet | null>(null);

  const len = [...text].length;
  const tooLong = len > TWEET_MAX;
  const canSubmit = text.trim().length > 0 && !tooLong && !submitting;

  function handleFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setText('');
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    setPublished(null);
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
      setPublished({ tweetId: String(body.tweetId), url: String(body.url), text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

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
            <img src={preview} alt="" style={{ maxHeight: '260px', borderRadius: '6px', border: '1px solid var(--wc-border)' }} />
          </div>
        )}
      </div>
      {error && <div style={{ color: '#fca5a5', marginTop: '0.75rem' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', gap: '0.5rem' }}>
        <a href="/admin/twitter/new" style={{ ...buttonGhost, textDecoration: 'none', display: 'inline-block' }}>
          Cancel
        </a>
        <button type="button" style={buttonPrimary} disabled={!canSubmit} onClick={submit}>
          {submitting ? <Spinner /> : 'Publish'}
        </button>
      </div>
    </div>
  );
}
