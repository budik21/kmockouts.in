'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { LeaderboardRow } from './page';

type SortKey = 'rank' | 'name' | 'totalTips' | 'exact' | 'outcome' | 'wrong' | 'totalPoints';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

interface Props {
  rows: LeaderboardRow[];
  currentUserToken?: string | null;
}

function defaultCompare(a: LeaderboardRow, b: LeaderboardRow): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.exact !== a.exact) return b.exact - a.exact;
  if (b.outcome !== a.outcome) return b.outcome - a.outcome;
  if (a.totalTips !== b.totalTips) return a.totalTips - b.totalTips;
  return a.name.localeCompare(b.name);
}

export default function LeaderboardTable({ rows, currentUserToken }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const didAutoJump = useRef(false);

  const ranked = useMemo(() => {
    const sorted = [...rows].sort(defaultCompare);
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows]);

  const currentUserRanked = useMemo(
    () => (currentUserToken ? ranked.find((r) => r.shareToken === currentUserToken) : null),
    [ranked, currentUserToken],
  );

  const sorted = useMemo(() => {
    const copy = [...ranked];
    if (sortKey === 'rank') {
      copy.sort((a, b) => sortDir === 'desc' ? a.rank - b.rank : b.rank - a.rank);
      return copy;
    }
    const sign = sortDir === 'desc' ? -1 : 1;
    copy.sort((a, b) => {
      if (sortKey === 'name') return sign * a.name.localeCompare(b.name);
      return sign * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return copy;
  }, [ranked, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return <span className="leaderboard-sort-arrow muted">⇅</span>;
    return <span className="leaderboard-sort-arrow">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  const jumpToMe = useCallback(() => {
    if (!currentUserRanked) return;
    const idx = sorted.findIndex((r) => r.shareToken === currentUserToken);
    if (idx === -1) return;
    setPage(Math.floor(idx / PAGE_SIZE));
  }, [currentUserRanked, sorted, currentUserToken]);

  // Auto-jump to user's page on first render
  useEffect(() => {
    if (!didAutoJump.current && currentUserRanked) {
      didAutoJump.current = true;
      jumpToMe();
    }
  }, [currentUserRanked, jumpToMe]);

  // Listen for the "Show my position" button in the heading widget
  useEffect(() => {
    const handler = () => jumpToMe();
    window.addEventListener('leaderboard-show-me', handler);
    return () => window.removeEventListener('leaderboard-show-me', handler);
  }, [jumpToMe]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [page]);

  if (rows.length === 0) {
    return (
      <div className="leaderboard-empty">
        <p>No public predictors yet. <Link href="/predictions">Be the first!</Link></p>
      </div>
    );
  }

  return (
    <div>
      <div className="table-responsive">
        <table className="table table-sm leaderboard-table">
          <colgroup>
            <col className="leaderboard-col-rank" />
            <col className="leaderboard-col-name" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            <col className="leaderboard-col-stat" />
            <col className="leaderboard-col-pts" />
            <col className="leaderboard-col-link" />
          </colgroup>
          <thead>
            <tr>
              <th className="leaderboard-sortable" onClick={() => handleSort('rank')}>
                # {sortArrow('rank')}
              </th>
              <th className="leaderboard-sortable" onClick={() => handleSort('name')}>
                Name {sortArrow('name')}
              </th>
              <th className="text-center leaderboard-sortable" onClick={() => handleSort('totalTips')}>
                Tips Total {sortArrow('totalTips')}
              </th>
              <th className="text-center leaderboard-sortable leaderboard-col-hide-mobile" onClick={() => handleSort('exact')}>
                Exact Score {sortArrow('exact')}
              </th>
              <th className="text-center leaderboard-sortable leaderboard-col-hide-mobile" onClick={() => handleSort('outcome')}>
                Winner {sortArrow('outcome')}
              </th>
              <th className="text-center leaderboard-sortable leaderboard-col-hide-mobile" onClick={() => handleSort('wrong')}>
                Bad Tips {sortArrow('wrong')}
              </th>
              <th className="text-center leaderboard-sortable leaderboard-col-pts" onClick={() => handleSort('totalPoints')}>
                Points {sortArrow('totalPoints')}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const isMe = currentUserToken && r.shareToken === currentUserToken;
              return (
                <tr
                  key={r.shareToken}
                  ref={isMe ? highlightRef : undefined}
                  className={isMe ? 'leaderboard-row-me' : undefined}
                >
                  <td className="fw-bold">{r.rank}</td>
                  <td>{r.name}</td>
                  <td className="text-center">{r.totalTips}</td>
                  <td className="text-center leaderboard-exact leaderboard-col-hide-mobile">{r.exact}</td>
                  <td className="text-center leaderboard-outcome leaderboard-col-hide-mobile">{r.outcome}</td>
                  <td className="text-center leaderboard-wrong leaderboard-col-hide-mobile">{r.wrong}</td>
                  <td className="text-center leaderboard-col-pts fw-bold">{r.totalPoints}</td>
                  <td className="text-end">
                    <Link
                      href={`/predictions/share/${r.shareToken}`}
                      className="leaderboard-profile-link"
                      title={`View ${r.name}'s predictions`}
                      aria-label={`View ${r.name}'s predictions`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8.636 3.5a.5.5 0 00-.5-.5H1.5A1.5 1.5 0 000 4.5v10A1.5 1.5 0 001.5 16h10a1.5 1.5 0 001.5-1.5V7.864a.5.5 0 00-1 0V14.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5v-10a.5.5 0 01.5-.5h6.636a.5.5 0 00.5-.5z"/><path d="M16 .5a.5.5 0 00-.5-.5h-5a.5.5 0 000 1h3.793L6.146 9.146a.5.5 0 10.708.708L15 1.707V5.5a.5.5 0 001 0v-5z"/></svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="leaderboard-pager">
          <button
            className="leaderboard-pager-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Prev
          </button>
          <span className="leaderboard-pager-info">
            Page {page + 1} of {pageCount}
          </span>
          <button
            className="leaderboard-pager-btn"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
