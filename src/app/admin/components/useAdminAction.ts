'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { useRouter } from 'next/navigation';

export type ActionState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'running' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

type Action =
  | { type: 'click' }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'success'; message: string }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

function reducer(state: ActionState, action: Action): ActionState {
  switch (action.type) {
    case 'click':
      return { kind: 'confirming' };
    case 'confirm':
      return { kind: 'running' };
    case 'cancel':
      return state.kind === 'confirming' ? { kind: 'idle' } : state;
    case 'success':
      return { kind: 'done', message: action.message };
    case 'fail':
      return { kind: 'error', message: action.message };
    case 'reset':
      return { kind: 'idle' };
    default:
      return state;
  }
}

interface UseAdminActionOptions {
  /** Runs the action. May return a custom success message. */
  run: () => Promise<string | void>;
  /** Default success message if run() returns void. */
  completedLabel: string;
  /** Whether clicking the button opens a confirm modal instead of running directly. */
  requiresConfirm?: boolean;
  /** Called after a successful run, before auto-reset. Use to mutate local state. */
  onSuccess?: () => void;
}

export interface AdminActionControls {
  state: ActionState;
  /** Call from the trigger button. Opens confirm modal if requiresConfirm, else runs immediately. */
  trigger: () => void;
  /** Call from the confirm button inside the modal. */
  confirm: () => void;
  /** Call from the cancel button inside the modal, or overlay click. */
  cancel: () => void;
}

/**
 * State machine for admin actions. Reused by AdminActionWidget (card layout)
 * and InlineActionButton (per-row buttons). On success, auto-refreshes the
 * router and resets to idle after 3 s. On error, resets after 5 s.
 */
export function useAdminAction({
  run,
  completedLabel,
  requiresConfirm = true,
  onSuccess,
}: UseAdminActionOptions): AdminActionControls {
  const [state, dispatch] = useReducer(reducer, { kind: 'idle' });
  const router = useRouter();

  const execute = useCallback(async () => {
    dispatch({ type: 'confirm' });
    try {
      const result = await run();
      const msg = typeof result === 'string' && result ? result : completedLabel;
      onSuccess?.();
      dispatch({ type: 'success', message: msg });
    } catch (err) {
      dispatch({
        type: 'fail',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [run, completedLabel, onSuccess]);

  const trigger = useCallback(() => {
    if (requiresConfirm) {
      dispatch({ type: 'click' });
    } else {
      void execute();
    }
  }, [requiresConfirm, execute]);

  const confirm = useCallback(() => {
    void execute();
  }, [execute]);

  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);

  useEffect(() => {
    if (state.kind === 'done') {
      const refreshTimer = setTimeout(() => router.refresh(), 0);
      const resetTimer = setTimeout(() => dispatch({ type: 'reset' }), 3000);
      return () => {
        clearTimeout(refreshTimer);
        clearTimeout(resetTimer);
      };
    }
    if (state.kind === 'error') {
      const t = setTimeout(() => dispatch({ type: 'reset' }), 5000);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return { state, trigger, confirm, cancel };
}
