'use client';

import { useEffect, useState } from 'react';

type Variant = 'danger' | 'primary';

interface Props {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  variant?: Variant;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export default function ConfirmActionModal({
  title,
  body,
  confirmLabel,
  busyLabel,
  variant = 'danger',
  onConfirm,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [busy, onClose]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="leagues-modal-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="leagues-modal leagues-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <h3 className="leagues-modal-title" id="confirm-modal-title">
          {title}
        </h3>
        <div className="leagues-confirm-body">{body}</div>
        <div className="leagues-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn leagues-confirm-action leagues-confirm-action--${variant}`}
            onClick={handleConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? busyLabel ?? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
