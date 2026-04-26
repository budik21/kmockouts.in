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

export default function SimplePostForm() {
  const router = useRouter();
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
      router.push('/admin/dashboard?tab=twitter');
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
