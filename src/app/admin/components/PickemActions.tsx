'use client';

import AdminActionWidget from './AdminActionWidget';

interface PickemActionsProps {
  isSuperadmin: boolean;
}

interface SimResult {
  usersInserted: number;
  tipsInserted: number;
  withConsent: number;
  withoutConsent: number;
}

async function postJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export default function PickemActions({ isSuperadmin }: PickemActionsProps) {
  return (
    <>
      <AdminActionWidget
        title="Populate test data"
        description="Fill the leaderboard with 130 test tipsters with random predictions. All start with 0 points until you recalculate scores."
        buttonLabel="Populate test data"
        buttonVariant="accent"
        inProgressLabel="Populating test data…"
        completedLabel="Test data populated"
        confirm={{
          title: '🧪 Populate test data?',
          body: (
            <p style={{ margin: 0 }}>
              This will <strong>delete all existing pick&apos;em data</strong> (tipsters + tips) and
              insert 130 fake tipsters with random tips.
            </p>
          ),
          confirmLabel: 'Populate',
        }}
        run={async () => {
          const data = await postJson<SimResult>('/api/admin/pickem/simulate');
          return `Inserted ${data.usersInserted} tipsters and ${data.tipsInserted} tips.`;
        }}
      />

      <AdminActionWidget
        title="Recalculate leaderboard"
        description="Rescore all tipster predictions based on current match results. Run this after updating results to refresh the leaderboard."
        buttonLabel="Recalculate"
        buttonVariant="accent"
        inProgressLabel="Recalculating leaderboard…"
        completedLabel="Leaderboard recalculated"
        confirm={{
          title: '🔄 Recalculate leaderboard?',
          body: (
            <>
              <p>
                This action will recalculate points for all predictions based on the current final
                match results.
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
            </>
          ),
          confirmLabel: 'Recalculate',
        }}
        run={async () => {
          const data = await postJson<{ message: string }>('/api/admin/pickem/recalculate');
          return data.message;
        }}
      />

      <AdminActionWidget
        hidden={!isSuperadmin}
        title="Delete all tips"
        description="Delete every tipster prediction. Tipster accounts and match results stay intact — only their tips are removed. This action cannot be undone."
        buttonLabel="Delete all tips"
        buttonVariant="danger"
        inProgressLabel="Deleting all tips…"
        completedLabel="All tips deleted"
        confirm={{
          title: '⚠️ Delete all tips?',
          body: (
            <>
              <p>
                This action will <strong>permanently delete every tipster prediction</strong>.
              </p>
              <p style={{ marginBottom: 0 }}>
                Tipster accounts and match results remain intact. This action cannot be undone.
              </p>
            </>
          ),
          confirmLabel: 'Delete all tips',
        }}
        run={async () => {
          const data = await postJson<{ message: string }>('/api/admin/pickem/clear-all');
          return data.message;
        }}
      />
    </>
  );
}
