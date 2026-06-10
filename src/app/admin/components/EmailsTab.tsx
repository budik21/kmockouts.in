'use client';

import { useEffect, useMemo, useState } from 'react';
import Spinner from './Spinner';
import { ConfirmModal } from './AdminActionWidget';

interface Recipient {
  id: number;
  email: string;
  name: string;
}

interface TemplateMeta {
  id: string;
  label: string;
  description: string;
  subject: string;
}

interface EmailsData {
  templates: TemplateMeta[];
  templateId: string;
  defaultRecipients: Recipient[];
  allUsers: Recipient[];
  previewHtml: string;
}

interface SendResponse {
  sent: number;
  failed: number;
  total: number;
  failures: { email: string; error: string }[];
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'sending' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const cardStyle: React.CSSProperties = {
  padding: '1.5rem',
  marginBottom: '1rem',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--wc-border)',
  borderRadius: '0.375rem',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--wc-text-muted)',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--wc-surface)',
  color: 'var(--wc-text)',
  border: '1px solid var(--wc-border)',
  borderRadius: '0.25rem',
  padding: '0.45rem 0.7rem',
  fontSize: '0.9rem',
  width: '100%',
  maxWidth: '420px',
};

export default function EmailsTab() {
  const [data, setData] = useState<EmailsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [search, setSearch] = useState('');
  const [sendState, setSendState] = useState<SendState>({ kind: 'idle' });
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoadError(null);
    const qs = templateId ? `?template=${encodeURIComponent(templateId)}` : '';
    fetch(`/api/admin/emails${qs}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((json as { error?: string }).error || `Request failed: ${res.status}`);
        }
        return json as EmailsData;
      })
      .then((json) => {
        if (cancelled) return;
        // The selected template lives in data.templateId (the server echoes the
        // default when no ?template= param is sent) — don't write it back into
        // the templateId state, that would re-trigger this effect needlessly.
        setData(json);
        setRecipients(json.defaultRecipients);
        setSendState({ kind: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // Refetch (and reset the recipient list to the template default) whenever
    // the selected template changes.
  }, [templateId]);

  const template = data?.templates.find((t) => t.id === data.templateId);

  const recipientIds = useMemo(() => new Set(recipients.map((r) => r.id)), [recipients]);

  const searchMatches = useMemo(() => {
    if (!data || !search.trim()) return [];
    const needle = search.trim().toLowerCase();
    return data.allUsers
      .filter((u) => !recipientIds.has(u.id))
      .filter(
        (u) =>
          u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [data, search, recipientIds]);

  const removeRecipient = (id: number) =>
    setRecipients((prev) => prev.filter((r) => r.id !== id));

  const addRecipient = (user: Recipient) => {
    setRecipients((prev) => (prev.some((r) => r.id === user.id) ? prev : [...prev, user]));
    setSearch('');
  };

  const send = async () => {
    if (!template) return;
    setSendState({ kind: 'sending' });
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          userIds: recipients.map((r) => r.id),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SendResponse> & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Request failed: ${res.status}`);
      }
      const failures = json.failures ?? [];
      let message = `Sent ${json.sent ?? 0} of ${json.total ?? recipients.length} emails.`;
      if (failures.length > 0) {
        message += ` Failed: ${failures.map((f) => f.email).join(', ')}`;
      }
      setSendState({ kind: 'done', message });
    } catch (err) {
      setSendState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  if (loadError) {
    return (
      <div style={{ color: '#f44336', fontSize: '0.95rem' }}>
        ✗ Failed to load email templates: {loadError}
      </div>
    );
  }

  if (!data || !template) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Spinner size="sm" />
        <span style={{ color: 'var(--wc-text-muted)' }}>Loading email templates…</span>
      </div>
    );
  }

  const sending = sendState.kind === 'sending';

  return (
    <div>
      {/* Template picker */}
      <div style={cardStyle}>
        <div style={labelStyle}>Template</div>
        <select
          value={template.id}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={sending}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <p style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
          {template.description}
        </p>
        <div style={{ ...labelStyle, marginTop: '1rem' }}>Subject</div>
        <div style={{ color: 'var(--wc-text)', fontSize: '0.95rem' }}>{template.subject}</div>
        <button
          onClick={() => setPreviewOpen(true)}
          style={{
            marginTop: '1rem',
            padding: '0.4rem 1rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            backgroundColor: 'var(--wc-surface)',
            color: 'var(--wc-text)',
            border: '1px solid var(--wc-border)',
          }}
        >
          Preview email
        </button>
      </div>

      {/* Recipients */}
      <div style={cardStyle}>
        <div className="d-flex align-items-baseline justify-content-between flex-wrap gap-2">
          <div style={labelStyle}>Recipients</div>
          <span style={{ color: 'var(--wc-text)', fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--wc-accent)' }}>{recipients.length}</strong>{' '}
            {recipients.length === 1 ? 'recipient' : 'recipients'}
            {recipients.length > 0 && (
              <button
                onClick={() => setRecipients([])}
                disabled={sending}
                style={{
                  marginLeft: '0.75rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--wc-text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Remove all
              </button>
            )}
          </span>
        </div>

        {recipients.length === 0 ? (
          <p style={{ color: 'var(--wc-text-muted)', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>
            No recipients selected. Add users below.
          </p>
        ) : (
          <div
            style={{
              maxHeight: '320px',
              overflowY: 'auto',
              border: '1px solid var(--wc-border)',
              borderRadius: '0.25rem',
              marginTop: '0.5rem',
            }}
          >
            {recipients.map((r, idx) => (
              <div
                key={r.id}
                className="d-flex align-items-center justify-content-between gap-2"
                style={{
                  padding: '0.45rem 0.75rem',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--wc-border)',
                  fontSize: '0.9rem',
                }}
              >
                <span style={{ color: 'var(--wc-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}{' '}
                  <span style={{ color: 'var(--wc-text-muted)' }}>&lt;{r.email}&gt;</span>
                </span>
                <button
                  onClick={() => removeRecipient(r.id)}
                  disabled={sending}
                  title="Remove recipient"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--wc-text-muted)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    lineHeight: 1,
                    padding: '0.15rem 0.3rem',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add recipient */}
        <div style={{ marginTop: '1rem', position: 'relative' }}>
          <div style={labelStyle}>Add recipient</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or e-mail…"
            disabled={sending}
            style={inputStyle}
          />
          {searchMatches.length > 0 && (
            <div
              style={{
                position: 'absolute',
                zIndex: 10,
                marginTop: '0.25rem',
                width: '100%',
                maxWidth: '420px',
                backgroundColor: 'var(--wc-surface)',
                border: '1px solid var(--wc-border)',
                borderRadius: '0.25rem',
                boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              {searchMatches.map((u) => (
                <button
                  key={u.id}
                  onClick={() => addRecipient(u)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--wc-text)',
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  {u.name}{' '}
                  <span style={{ color: 'var(--wc-text-muted)' }}>&lt;{u.email}&gt;</span>
                </button>
              ))}
            </div>
          )}
          {search.trim() !== '' && searchMatches.length === 0 && (
            <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
              No matching users (already added or not found).
            </div>
          )}
        </div>
      </div>

      {/* Send */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minHeight: '2.25rem', flexWrap: 'wrap' }}>
          {!sending && (
            <button
              onClick={() => setSendState({ kind: 'confirming' })}
              disabled={recipients.length === 0}
              style={{
                padding: '0.5rem 1.25rem',
                fontWeight: 600,
                borderRadius: '0.25rem',
                cursor: recipients.length === 0 ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--wc-accent)',
                color: '#2a1a00',
                border: 'none',
                opacity: recipients.length === 0 ? 0.5 : 1,
              }}
            >
              Send
            </button>
          )}

          {sending && (
            <>
              <Spinner size="sm" />
              <span style={{ color: 'var(--wc-text)', fontSize: '0.95rem' }}>
                Sending {recipients.length} {recipients.length === 1 ? 'email' : 'emails'}…
              </span>
            </>
          )}

          {sendState.kind === 'done' && (
            <span style={{ color: '#4caf50', fontSize: '0.95rem', fontWeight: 500 }}>
              ✓ {sendState.message}
            </span>
          )}

          {sendState.kind === 'error' && (
            <span style={{ color: '#f44336', fontSize: '0.95rem', fontWeight: 500 }}>
              ✗ {sendState.message}
            </span>
          )}
        </div>
      </div>

      {previewOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              width: '90%',
              maxWidth: '680px',
              height: '85vh',
              border: '1px solid var(--wc-border)',
              borderRadius: '0.375rem',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div>
                <div style={{ fontWeight: 600 }}>Email preview</div>
                <div style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>
                  {template.subject}
                </div>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                style={{
                  padding: '0.4rem 1rem',
                  fontWeight: 500,
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  backgroundColor: 'var(--wc-surface)',
                  color: 'var(--wc-text)',
                  border: '1px solid var(--wc-border)',
                }}
              >
                Close
              </button>
            </div>
            <iframe
              title="Email preview"
              srcDoc={data.previewHtml}
              sandbox=""
              style={{
                flex: 1,
                width: '100%',
                border: '1px solid var(--wc-border)',
                borderRadius: '0.25rem',
                backgroundColor: '#f4f4f7',
              }}
            />
          </div>
        </div>
      )}

      {sendState.kind === 'confirming' && (
        <ConfirmModal
          config={{
            title: '📧 Send emails?',
            body: (
              <p style={{ margin: 0 }}>
                Are you sure you want to send <strong>{recipients.length}</strong>{' '}
                {recipients.length === 1 ? 'email' : 'emails'} with subject:{' '}
                <strong>&ldquo;{template.subject}&rdquo;</strong>? Each recipient gets an
                individually addressed e-mail.
              </p>
            ),
            confirmLabel: 'Send',
          }}
          variant="accent"
          onConfirm={() => void send()}
          onCancel={() => setSendState({ kind: 'idle' })}
        />
      )}
    </div>
  );
}
