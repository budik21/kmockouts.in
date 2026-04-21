'use client';

import { useState } from 'react';

interface Prefs {
  exactScore: boolean;
  winnerOnly: boolean;
  wrongTip: boolean;
}

const FIELD_MAP = {
  exactScore: 'notify_exact_score',
  winnerOnly: 'notify_winner_only',
  wrongTip: 'notify_wrong_tip',
} as const;

type PrefKey = keyof Prefs;

export default function NotificationToggles({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState<PrefKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: PrefKey) => {
    const newValue = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: newValue }));
    setSaving(key);
    setError(null);
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [FIELD_MAP[key]]: newValue }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !newValue }));
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="me-notif-list">
        <Row
          title="🎯 Exact score"
          desc="E-mail me when I guess the exact final score (+4 points)."
          checked={prefs.exactScore}
          disabled={saving === 'exactScore'}
          onChange={() => toggle('exactScore')}
        />
        <Row
          title="✅ Correct winner"
          desc="E-mail me when I guess the correct outcome but not the exact score (+1 point)."
          checked={prefs.winnerOnly}
          disabled={saving === 'winnerOnly'}
          onChange={() => toggle('winnerOnly')}
        />
        <Row
          title="😢 Wrong tip"
          desc="E-mail me when my prediction is wrong (0 points)."
          checked={prefs.wrongTip}
          disabled={saving === 'wrongTip'}
          onChange={() => toggle('wrongTip')}
        />
      </div>
      {error && <p className="text-danger mt-3">{error}</p>}
    </>
  );
}

function Row({
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
