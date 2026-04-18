'use client';

import Spinner from './Spinner';
import { useAdminAction } from './useAdminAction';

export type ActionVariant = 'accent' | 'danger';

export interface ConfirmConfig {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
}

interface AdminActionWidgetProps {
  title: string;
  description: React.ReactNode;
  buttonLabel: string;
  buttonVariant?: ActionVariant;
  inProgressLabel: string;
  completedLabel: string;
  hidden?: boolean;
  confirm?: ConfirmConfig;
  run: () => Promise<string | void>;
}

const VARIANT_STYLES: Record<ActionVariant, React.CSSProperties> = {
  accent: {
    backgroundColor: 'var(--wc-accent)',
    color: '#2a1a00',
    border: 'none',
  },
  danger: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
  },
};

export default function AdminActionWidget({
  title,
  description,
  buttonLabel,
  buttonVariant = 'accent',
  inProgressLabel,
  completedLabel,
  hidden,
  confirm,
  run,
}: AdminActionWidgetProps) {
  const { state, trigger, confirm: runConfirm, cancel } = useAdminAction({
    run,
    completedLabel,
    requiresConfirm: !!confirm,
  });

  if (hidden) return null;

  const cardStyle: React.CSSProperties = {
    padding: '1.5rem',
    marginBottom: '1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--wc-border)',
    borderRadius: '0.375rem',
  };

  const titleStyle: React.CSSProperties = {
    color: 'var(--wc-text)',
    fontSize: '1.05rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const descStyle: React.CSSProperties = {
    color: 'var(--wc-text-muted)',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    lineHeight: 1.5,
  };

  const statusRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    minHeight: '2.25rem',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.25rem',
    cursor: 'pointer',
    ...VARIANT_STYLES[buttonVariant],
  };

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      <div style={descStyle}>{description}</div>
      <div style={statusRowStyle}>
        {(state.kind === 'idle' || state.kind === 'confirming') && (
          <button onClick={trigger} style={buttonStyle}>
            {buttonLabel}
          </button>
        )}

        {state.kind === 'running' && (
          <>
            <Spinner size="sm" />
            <span style={{ color: 'var(--wc-text)', fontSize: '0.95rem' }}>{inProgressLabel}</span>
          </>
        )}

        {state.kind === 'done' && (
          <span style={{ color: '#4caf50', fontSize: '0.95rem', fontWeight: 500 }}>
            ✓ {state.message}
          </span>
        )}

        {state.kind === 'error' && (
          <span style={{ color: '#f44336', fontSize: '0.95rem', fontWeight: 500 }}>
            ✗ {state.message}
          </span>
        )}
      </div>

      {state.kind === 'confirming' && confirm && (
        <ConfirmModal
          config={confirm}
          variant={buttonVariant}
          onConfirm={runConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

export function ConfirmModal({
  config,
  variant = 'accent',
  onConfirm,
  onCancel,
}: {
  config: ConfirmConfig;
  variant?: ActionVariant;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.25rem',
    cursor: 'pointer',
    ...VARIANT_STYLES[variant],
  };

  return (
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
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--wc-surface)',
          color: 'var(--wc-text)',
          maxWidth: '500px',
          width: '90%',
          border: '1px solid var(--wc-border)',
          borderRadius: '0.375rem',
          padding: '2rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem' }}>{config.title}</h3>
        <div style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          {config.body}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              border: '1px solid var(--wc-border)',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button onClick={onConfirm} style={confirmStyle}>
            {config.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
