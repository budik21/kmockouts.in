'use client';

import { useState } from 'react';

interface PickemActionsProps {
  isSuperadmin: boolean;
}

export default function PickemActions({ isSuperadmin }: PickemActionsProps) {
  const [showClearModal, setShowClearModal] = useState(false);
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        className="p-3 rounded mb-4"
        style={{
          backgroundColor: 'var(--wc-surface)',
          border: '1px solid var(--wc-border)',
        }}
      >
        <h2 style={{ color: 'var(--wc-text)', fontSize: '1.1rem', margin: '0 0 1rem 0' }}>
          Pick&apos;em Management
        </h2>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isSuperadmin && (
            <button
              className="btn btn-danger"
              onClick={() => setShowClearModal(true)}
              disabled={isLoading}
            >
              🗑️ Clear all results (Superadmin)
            </button>
          )}

          <button
            className="btn btn-warning"
            onClick={() => setShowRecalcModal(true)}
            disabled={isLoading || !isSuperadmin}
            title={!isSuperadmin ? 'Admin can recalculate' : ''}
          >
            🔄 Recalculate leaderboard
          </button>
        </div>

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
      </div>

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
