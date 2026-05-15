'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CreateLeagueModal from './CreateLeagueModal';
import EntryLeagueModal from './EntryLeagueModal';
import ShareLeagueModal from './ShareLeagueModal';
import ConfirmActionModal from './ConfirmActionModal';
import { LEAGUE_LIMIT_PER_USER } from '@/lib/league-validation';

function IosShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

interface SharePayload {
  code: string;
  name: string;
  inviteUrl: string;
}

type ConfirmKind = 'delete' | 'leave';

interface ConfirmPayload {
  kind: ConfirmKind;
  code: string;
  name: string;
}

export interface LeagueListItem {
  code: string;
  name: string;
  memberCount: number;
  inviteHash?: string;
  ownerName?: string;
  isOwner: boolean;
}

type Tab = 'mine' | 'participating';

interface Props {
  myLeagues: LeagueListItem[];
  participating: LeagueListItem[];
  isAdmin: boolean;
}

export default function LeaguesView({ myLeagues, participating, isAdmin }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('mine');
  const [showCreate, setShowCreate] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [share, setShare] = useState<SharePayload | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPayload | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  const ownedCount = myLeagues.length;
  const atLimit = !isAdmin && ownedCount >= LEAGUE_LIMIT_PER_USER;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const openShare = useCallback(
    (code: string, name: string, hash: string) => {
      const inviteUrl = `${window.location.origin}/pickem/leagues/invite/${code}/${hash}`;
      setShare({ code, name, inviteUrl });
    },
    [],
  );

  const copyCode = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        showToast(`Code ${code} copied.`);
      } catch {
        window.prompt('League code:', code);
      }
    },
    [showToast],
  );

  const performDelete = useCallback(
    async (code: string, name: string) => {
      setError(null);
      setPendingCode(code);
      try {
        const res = await fetch(`/api/leagues/${encodeURIComponent(code)}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to delete league.');
        showToast(`League "${name}" deleted.`);
        setConfirm(null);
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setConfirm(null);
      } finally {
        setPendingCode(null);
      }
    },
    [refresh, showToast],
  );

  const performLeave = useCallback(
    async (code: string, name: string) => {
      setError(null);
      setPendingCode(code);
      try {
        const res = await fetch(`/api/leagues/${encodeURIComponent(code)}/leave`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to leave league.');
        showToast(`Left league "${name}".`);
        setConfirm(null);
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setConfirm(null);
      } finally {
        setPendingCode(null);
      }
    },
    [refresh, showToast],
  );

  const list = tab === 'mine' ? myLeagues : participating;

  return (
    <div className="leagues-view">
      <div className="leagues-toolbar">
        <div className="leagues-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mine'}
            className={`leagues-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => setTab('mine')}
          >
            My leagues ({myLeagues.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'participating'}
            className={`leagues-tab ${tab === 'participating' ? 'active' : ''}`}
            onClick={() => setTab('participating')}
          >
            Participating leagues ({participating.length})
          </button>
        </div>
        <div className="leagues-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
            disabled={atLimit}
            title={atLimit ? `Limit of ${LEAGUE_LIMIT_PER_USER} leagues reached.` : undefined}
          >
            Create League
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => setShowEntry(true)}
          >
            Entry to League
          </button>
        </div>
      </div>

      {atLimit && (
        <div className="alert alert-info py-2 small mb-3">
          You&apos;ve reached the limit of {LEAGUE_LIMIT_PER_USER} leagues. Delete one to create another.
        </div>
      )}
      {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

      {list.length === 0 ? (
        <div className="leagues-empty">
          {tab === 'mine'
            ? 'You haven’t created any leagues yet. Click "Create League" to start one.'
            : 'You haven’t joined any leagues yet. Use "Entry to League" with a 6-character code, or open an invite link.'}
        </div>
      ) : (
        <ul className="leagues-list">
          {list.map((l) => (
            <li key={l.code} className="leagues-item">
              <div className="leagues-item-main">
                <div className="leagues-item-name">
                  <Link href={`/pickem/leagues/${l.code}`}>{l.name}</Link>
                </div>
                <div className="leagues-item-meta">
                  <button
                    type="button"
                    className="leagues-code-chip"
                    onClick={() => copyCode(l.code)}
                    title="Copy code"
                  >
                    {l.code}
                  </button>
                  <span className="leagues-meta-dot">·</span>
                  <span>
                    {l.memberCount} {l.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  {tab === 'participating' && l.ownerName && (
                    <>
                      <span className="leagues-meta-dot">·</span>
                      <span>by {l.ownerName}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="leagues-item-actions">
                <Link
                  href={`/pickem/leagues/${l.code}`}
                  className="leagues-action-btn"
                >
                  Leaderboard
                </Link>
                {tab === 'mine' && l.inviteHash && (
                  <button
                    type="button"
                    className="leagues-action-btn"
                    onClick={() => openShare(l.code, l.name, l.inviteHash!)}
                  >
                    <IosShareIcon className="leagues-action-icon" />
                    Share
                  </button>
                )}
                {tab === 'mine' && (
                  <button
                    type="button"
                    className="leagues-action-btn"
                    onClick={() => setConfirm({ kind: 'delete', code: l.code, name: l.name })}
                    disabled={l.memberCount > 1 || pendingCode === l.code}
                    title={
                      l.memberCount > 1
                        ? 'Cannot delete a league with other members.'
                        : undefined
                    }
                  >
                    Delete
                  </button>
                )}
                {tab === 'participating' && (
                  <button
                    type="button"
                    className="leagues-action-btn"
                    onClick={() => setConfirm({ kind: 'leave', code: l.code, name: l.name })}
                    disabled={pendingCode === l.code}
                  >
                    Leave
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <CreateLeagueModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            refresh();
          }}
        />
      )}
      {showEntry && (
        <EntryLeagueModal
          onClose={() => setShowEntry(false)}
          onJoined={() => refresh()}
        />
      )}
      {share && (
        <ShareLeagueModal
          code={share.code}
          name={share.name}
          inviteUrl={share.inviteUrl}
          onClose={() => setShare(null)}
        />
      )}
      {confirm && confirm.kind === 'delete' && (
        <ConfirmActionModal
          title="Delete this league?"
          body={
            <>
              <p className="mb-2">
                You&apos;re about to delete <strong>“{confirm.name}”</strong>.
              </p>
              <p className="mb-0 text-muted small">
                The league, its code and its standings will be removed. This
                cannot be undone.
              </p>
            </>
          }
          confirmLabel="Delete league"
          busyLabel="Deleting…"
          variant="danger"
          onConfirm={() => performDelete(confirm.code, confirm.name)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm && confirm.kind === 'leave' && (
        <ConfirmActionModal
          title="Leave this league?"
          body={
            <>
              <p className="mb-2">
                You&apos;re about to leave <strong>“{confirm.name}”</strong>.
              </p>
              <p className="mb-0 text-muted small">
                Your tips stay saved, but you won&apos;t appear in this
                league&apos;s standings anymore. You can rejoin later with the
                league code if the owner shares it again.
              </p>
            </>
          }
          confirmLabel="Leave league"
          busyLabel="Leaving…"
          variant="danger"
          onConfirm={() => performLeave(confirm.code, confirm.name)}
          onClose={() => setConfirm(null)}
        />
      )}

      {toast && (
        <div className="leagues-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
