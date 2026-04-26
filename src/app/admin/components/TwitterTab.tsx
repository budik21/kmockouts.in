'use client';

import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import TwitterWizard from './TwitterWizard';

export interface TwitterTeamOption {
  id: number;
  name: string;
  groupId: string;
  countryCode: string;
}

interface TwitterTabProps {
  teams: TwitterTeamOption[];
}

interface TwitterPostListItem {
  id: number;
  tweetId: string;
  text: string;
  template: 'simple' | 'scenario_pre' | 'scenario_post';
  mediaKind: 'image' | 'gif' | null;
  teamId: number | null;
  teamName: string | null;
  postedByEmail: string;
  postedAt: string;
  url: string;
}

interface PostsResponse {
  configured: boolean;
  posts: TwitterPostListItem[];
}

const card: React.CSSProperties = {
  padding: '1.25rem',
  marginBottom: '1rem',
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--wc-border)',
  borderRadius: '0.375rem',
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

function templateLabel(t: TwitterPostListItem['template']): string {
  if (t === 'simple') return 'Simple';
  if (t === 'scenario_pre') return 'Pre-match';
  return 'Post-match';
}

function formatPostedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TwitterTab({ teams }: TwitterTabProps) {
  const [data, setData] = useState<PostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/twitter/posts', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <div
        style={{
          ...card,
          background: 'rgba(59,130,246,0.08)',
          borderColor: 'rgba(59,130,246,0.35)',
          color: 'var(--wc-text)',
          fontSize: '0.9rem',
        }}
      >
        <strong>X (Twitter) Free tier:</strong> ~500 posts/month, 17/day. The free tier does not
        allow reading the timeline via API, so the history below shows only tweets published
        through this app.
      </div>

      {data && !data.configured && (
        <div
          style={{
            ...card,
            background: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.4)',
            color: 'var(--wc-text)',
          }}
        >
          <strong>Twitter API not configured.</strong> Set <code>TWITTER_API_KEY</code>,{' '}
          <code>TWITTER_API_SECRET</code>, <code>TWITTER_ACCESS_TOKEN</code> and{' '}
          <code>TWITTER_ACCESS_SECRET</code> on Railway. Until then publishing is disabled.
        </div>
      )}

      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 style={{ color: 'var(--wc-text)', fontSize: '1.05rem', margin: 0 }}>Published tweets</h3>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setWizardOpen(true)}
          disabled={data ? !data.configured : false}
        >
          + New post
        </button>
      </div>

      {loading && <Spinner />}
      {error && (
        <div style={{ color: '#fca5a5', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Failed to load: {error}
        </div>
      )}

      {data && data.posts.length === 0 && !loading && (
        <p style={{ color: 'var(--wc-text-muted)' }}>No tweets published yet.</p>
      )}

      {data && data.posts.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--wc-border)', color: 'var(--wc-text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Posted</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Team</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Text</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Media</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--wc-border)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--wc-text-muted)', whiteSpace: 'nowrap' }}>
                    {formatPostedAt(p.postedAt)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{templateLabel(p.template)}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{p.teamName ?? '—'}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--wc-text)', maxWidth: '420px' }}>
                    {p.text}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--wc-text-muted)' }}>
                    {p.mediaKind ?? '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      Open ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wizardOpen && (
        <TwitterWizard
          teams={teams}
          onClose={() => setWizardOpen(false)}
          onPublished={() => {
            setWizardOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
