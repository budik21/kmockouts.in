'use client';

import { useState } from 'react';

interface NotifyPrefs {
  exactScore: boolean;
  winnerOnly: boolean;
  wrongTip: boolean;
}

const NOTIFY_FIELD_MAP = {
  exactScore: 'notify_exact_score',
  winnerOnly: 'notify_winner_only',
  wrongTip: 'notify_wrong_tip',
} as const;

type NotifyKey = keyof NotifyPrefs;

interface Props {
  initialNotify: NotifyPrefs;
  tipsPublic: boolean;
  shareUrl: string;
  onTogglePublic: () => void;
}

export default function SettingsTab({ initialNotify, tipsPublic, shareUrl, onTogglePublic }: Props) {
  const [notify, setNotify] = useState<NotifyPrefs>(initialNotify);
  const [savingNotify, setSavingNotify] = useState<NotifyKey | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleNotify = async (key: NotifyKey) => {
    const newValue = !notify[key];
    setNotify((p) => ({ ...p, [key]: newValue }));
    setSavingNotify(key);
    setNotifyError(null);
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [NOTIFY_FIELD_MAP[key]]: newValue }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (e) {
      setNotify((p) => ({ ...p, [key]: !newValue }));
      setNotifyError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingNotify(null);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  return (
    <div className="tipovacka-settings">
      <section className="tipovacka-settings-col">
        <h5>Notifications</h5>
        <p className="text-muted mb-3" style={{ fontSize: '0.9rem' }}>
          Choose which e-mails you&apos;d like to receive after your tips are scored.
          All notifications are off by default.
        </p>
        <div className="me-notif-list">
          <NotifyRow
            title="🎯 Exact score"
            desc="E-mail me when I guess the exact final score (+4 points)."
            checked={notify.exactScore}
            disabled={savingNotify === 'exactScore'}
            onChange={() => toggleNotify('exactScore')}
          />
          <NotifyRow
            title="✅ Correct winner"
            desc="E-mail me when I guess the correct outcome but not the exact score (+1 point)."
            checked={notify.winnerOnly}
            disabled={savingNotify === 'winnerOnly'}
            onChange={() => toggleNotify('winnerOnly')}
          />
          <NotifyRow
            title="😢 Wrong tip"
            desc="E-mail me when my prediction is wrong (0 points)."
            checked={notify.wrongTip}
            disabled={savingNotify === 'wrongTip'}
            onChange={() => toggleNotify('wrongTip')}
          />
        </div>
        {notifyError && <p className="text-danger mt-3">{notifyError}</p>}
      </section>

      <section className="tipovacka-settings-col">
        <h5>Sharing</h5>
        <p className="text-muted mb-3" style={{ fontSize: '0.9rem' }}>
          Turning this off only hides your predictions from the global leaderboard.
          Members of any league you join can still see your tips.
        </p>
        <div className="tipovacka-share-section">
          <div className="d-flex align-items-center gap-3 mb-2">
            <label className="tipovacka-toggle">
              <input
                type="checkbox"
                checked={tipsPublic}
                onChange={onTogglePublic}
              />
              <span className="tipovacka-toggle-slider" />
            </label>
            <span>
              {tipsPublic ? 'Your predictions are public' : 'Your predictions are private'}
            </span>
          </div>
          {tipsPublic && (
            <div className="tipovacka-share-copy">
              {copied ? (
                <span className="tipovacka-share-copied">URL Copied</span>
              ) : (
                <button className="tipovacka-cta-btn tipovacka-cta-btn-icon w-100" onClick={handleCopy}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v13" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                  </svg>
                  <span>Share link</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function NotifyRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className="me-notif-row">
      <div className="me-notif-label">
        <span className="me-notif-title">{title}</span>
        <span className="me-notif-desc">{desc}</span>
      </div>
      <label className="ios-toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="ios-toggle-slider" />
      </label>
    </div>
  );
}
