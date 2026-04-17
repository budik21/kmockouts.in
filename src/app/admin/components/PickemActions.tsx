'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PickemActionsProps {
  isSuperadmin: boolean;
}

interface SimResult {
  usersInserted: number;
  tipsInserted: number;
  withConsent: number;
  withoutConsent: number;
}

export default function PickemActions({ isSuperadmin }: PickemActionsProps) {
  const [showClearModal, setShowClearModal] = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const refresh = () => startTransition(() => router.refresh());

  const handleClearResults = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/pickem/clear-all', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to clear results');
      }

      setMessage({ type: 'success', text: data.message });
      setShowClearModal(false);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulate = async () => {
    if (
      !confirm(
        'This will DELETE all existing pick'em data (tipsters + tips) and insert 130 fake tipsters with random tips. Continue?',
      )
    ) {
      return;
    }
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/pickem/simulate', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Simulation failed');
      }

      const result = data as SimResult;
      setMessage({
        type: 'success',
        text: `Inserted ${result.usersInserted} tipsters (${result.withConsent} with consent, ${result.withoutConsent} without) and ${result.tipsInserted} tips.`,
      });
      refresh();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/pickem/recalculate', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to recalculate');
      }

      setMessage({ type: 'success', text: data.message });
      setShowRecalcModal(false);
      refresh();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const actionCardStyle = {
    padding: '1.5rem',
    marginBottom: '1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--wc-border)',
    borderRadius: '0.375rem',
  };

  const actionTitleStyle = {
    color: 'var(--wc-text)',
    fontSize: '1.05rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const actionDescStyle = {
    color: 'var(--wc-text-muted)',
    fontSize: '0.9rem',
    marginBottom: '1rem',
    lineHeight: 1.5,
  };

  const disabledStyle = {
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  return (
    <>
      {/* Simulation action */}
      <div style={actionCardStyle}>
        <div style={actionTitleStyle}>Populate test data</div>
        <div style={actionDescStyle}>
          Fill the leaderboard with 130 test tipsters with random predictions. All start with 0 points until you recalculate scores.
        </div>
        <button
          onClick={handleSimulate}
          disabled={isLoading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--wc-accent)',
            color: '#2a1a00',
            fontWeight: 600,
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          {isLoading ? 'Populating...' : 'Populate test data'}
        </button>
      </div>

      {/* Recalculate action */}
      <div style={actionCardStyle}>
        <div style={actionTitleStyle}>Recalculate leaderboard</div>
        <div style={actionDescStyle}>
          Rescore all tipster predictions based on current match results. Run this after updating results to refresh the leaderboard.
        </div>
        <button
          onClick={() => setShowRecalcModal(true)}
          disabled={isLoading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--wc-accent)',
            color: '#2a1a00',
            fontWeight: 600,
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Recalculate
        </button>
      </div>

      {/* Clear all results action (superadmin only) */}
      {isSuperadmin && (
        <div style={actionCardStyle}>
          <div style={actionTitleStyle}>Clear all results</div>
          <div style={actionDescStyle}>
            Completely reset the pick&apos;em game. Deletes all match results, tips, and caches. All tipsters return to 0 points. This action cannot be undone.
          </div>
          <button
            onClick={() => setShowClearModal(true)}
            disabled={isLoading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#dc3545',
              color: 'white',
              fontWeight: 600,
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Clear all results
          </button>
        </div>
      )}

      {message && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            borderRadius: '0.25rem',
            backgroundColor: message.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
            color: message.type === 'success' ? '#4caf50' : '#f44336',
            fontSize: '0.9rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Clear all results modal */}
      {showClearModal && (
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
          onClick={() => !isLoading && setShowClearModal(false)}
        >
          <div
            className="p-4 rounded"
            style={{
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid var(--wc-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem' }}>
              ⚠️ Clear all pick&apos;em results?
            </h3>

            <div style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              <p>
                This action will <strong>permanently</strong> delete:
              </p>
              <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                <li>All match results (scores reset to no result)</li>
                <li>All tipster predictions</li>
                <li>All AI interpretation cache</li>
                <li>All prediction caches</li>
              </ul>
              <p style={{ marginBottom: 0 }}>
                <strong>Result:</strong> All tipsters will have 0 points. Tipster accounts remain intact.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setShowClearModal(false)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleClearResults}
                disabled={isLoading}
              >
                {isLoading ? 'Clearing...' : 'Clear all results'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recalculate modal */}
      {showRecalcModal && (
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
          onClick={() => !isLoading && setShowRecalcModal(false)}
        >
          <div
            className="p-4 rounded"
            style={{
              backgroundColor: 'var(--wc-surface)',
              color: 'var(--wc-text)',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid var(--wc-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem' }}>
              🔄 Recalculate leaderboard?
            </h3>

            <div style={{ color: 'var(--wc-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              <p>
                This action will recalculate points for all predictions based on the current final match
                results.
              </p>
              <p style={{ marginBottom: '0.75rem' }}>
                <strong>This will:</strong>
              </p>
              <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>
                <li>Rescore all tipster predictions against current match results</li>
                <li>Refresh the leaderboard cache</li>
              </ul>
              <p style={{ marginBottom: 0, color: 'var(--wc-accent)' }}>
                Use this after updating match results to ensure the leaderboard shows current scores.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setShowRecalcModal(false)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={handleRecalculate}
                disabled={isLoading}
              >
                {isLoading ? 'Recalculating...' : 'Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
