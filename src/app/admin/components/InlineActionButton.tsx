'use client';

import Spinner from './Spinner';
import { ConfirmModal, type ActionVariant, type ConfirmConfig } from './AdminActionWidget';
import { useAdminAction } from './useAdminAction';

interface InlineActionButtonProps {
  buttonLabel: string;
  buttonClassName?: string;
  inProgressLabel: string;
  completedLabel: string;
  disabled?: boolean;
  confirm?: ConfirmConfig;
  confirmVariant?: ActionVariant;
  run: () => Promise<string | void>;
  /** Called after success, before auto-reset. */
  onSuccess?: () => void;
}

/**
 * Inline button variant of AdminActionWidget — renders just a button that
 * transitions through idle → (confirming) → running → done → idle. Used where
 * a full card doesn't fit (per-row remove, per-scenario apply, etc.).
 */
export default function InlineActionButton({
  buttonLabel,
  buttonClassName = 'btn btn-sm btn-outline-danger',
  inProgressLabel,
  completedLabel,
  disabled,
  confirm,
  confirmVariant = 'danger',
  run,
  onSuccess,
}: InlineActionButtonProps) {
  const { state, trigger, confirm: runConfirm, cancel } = useAdminAction({
    run,
    completedLabel,
    requiresConfirm: !!confirm,
    onSuccess,
  });

  const idle = state.kind === 'idle' || state.kind === 'confirming';

  return (
    <>
      {idle && (
        <button
          type="button"
          className={buttonClassName}
          onClick={trigger}
          disabled={disabled}
        >
          {buttonLabel}
        </button>
      )}

      {state.kind === 'running' && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--wc-text-muted)',
            fontSize: '0.85rem',
          }}
        >
          <Spinner size="sm" />
          {inProgressLabel}
        </span>
      )}

      {state.kind === 'done' && (
        <span style={{ color: '#4caf50', fontSize: '0.85rem', fontWeight: 500 }}>
          ✓ {state.message}
        </span>
      )}

      {state.kind === 'error' && (
        <span style={{ color: '#f44336', fontSize: '0.85rem', fontWeight: 500 }}>
          ✗ {state.message}
        </span>
      )}

      {state.kind === 'confirming' && confirm && (
        <ConfirmModal
          config={confirm}
          variant={confirmVariant}
          onConfirm={runConfirm}
          onCancel={cancel}
        />
      )}
    </>
  );
}
