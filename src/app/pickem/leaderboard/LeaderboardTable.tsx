'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { LeaderboardRow } from './page';

type SortKey = 'rank' | 'name' | 'totalTips' | 'exact' | 'outcome' | 'wrong' | 'advancing' | 'top4' | 'playoffPoints' | 'totalPoints';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

interface Props {
  rows: LeaderboardRow[];
  currentUserToken?: string | null;
  /** Which dataset — drives the breakdown column labels. */
  variant?: 'all' | 'groups' | 'playoff';
  /** Show a "Play-off" column with each predictor's play-off-only points. */
  playoffColumn?: boolean;
}

interface MidCol {
  key: Extract<SortKey, 'exact' | 'outcome' | 'wrong' | 'advancing' | 'top4'>;
  label: string;
  get: (r: LeaderboardRow) => number;
  cls: string;
}

const PLAYOFF_COLS: MidCol[] = [
  { key: 'exact', label: 'Exact Score', get: (r) => r.exact, cls: 'leaderboard-exact' },
  { key: 'advancing', label: 'Advancing Team', get: (r) => r.advancing, cls: 'leaderboard-outcome' },
  { key: 'top4', label: 'Top 4', get: (r) => r.top4, cls: 'leaderboard-outcome' },
];

const DEFAULT_COLS: MidCol[] = [
  { key: 'exact', label: 'Exact Score', get: (r) => r.exact, cls: 'leaderboard-exact' },
  { key: 'outcome', label: 'Winner', get: (r) => r.outcome, cls: 'leaderboard-outcome' },
  { key: 'wrong', label: 'Bad Tips', get: (r) => r.wrong, cls: 'leaderboard-wrong' },
];

function defaultCompare(a: LeaderboardRow, b: LeaderboardRow): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.exact !== a.exact) return b.exact - a.exact;
  if (b.outcome !== a.outcome) return b.outcome - a.outcome;
  if (a.totalTips !== b.totalTips) return a.totalTips - b.totalTips;
  return (
    a.name.localeCompare(b.name) ||
    (a.nameSuffix ?? '').localeCompare(b.nameSuffix ?? '')
  );
}

function plainDisplayName(r: LeaderboardRow): string {
  return r.nameSuffix ? `${r.name} (${r.nameSuffix})` : r.name;
}

function medal(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardTable({ rows, currentUserToken, variant = 'groups', playoffColumn = false }: Props) {
  const midCols = variant === 'playoff' ? PLAYOFF_COLS : DEFAULT_COLS;
  // The all-exact top-4 bonus is a play-off achievement → flag it in those views.
  const showBonus = variant === 'all' || variant === 'playoff';
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const highlightRef = useRef<HTMLTableRowElement>(null);

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
      if (sortKey === 'name') {
        return (
          sign *
          (a.name.localeCompare(b.name) ||
            (a.nameSuffix ?? '').localeCompare(b.nameSuffix ?? ''))
        );
      }
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
        <p>No public predictors yet. <Link href="/pickem">Be the first!</Link></p>
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
            <col className="leaderboard-col-stat leaderboard-col-tips" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            <col className="leaderboard-col-stat leaderboard-col-hide-mobile" />
            {playoffColumn && <col className="leaderboard-col-pts" />}
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
              <th className="text-center leaderboard-sortable leaderboard-col-tips" onClick={() => handleSort('totalTips')}>
                Tips Total {sortArrow('totalTips')}
              </th>
              {midCols.map((c) => (
                <th key={c.key} className="text-center leaderboard-sortable leaderboard-col-hide-mobile" onClick={() => handleSort(c.key)}>
                  {c.label} {sortArrow(c.key)}
                </th>
              ))}
              {playoffColumn && (
                <th className="text-center leaderboard-sortable leaderboard-col-pts" onClick={() => handleSort('playoffPoints')}>
                  Play-off {sortArrow('playoffPoints')}
                </th>
              )}
              <th className="text-center leaderboard-sortable leaderboard-col-pts" onClick={() => handleSort('totalPoints')}>
                Points {sortArrow('totalPoints')}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => {
              const isMe = currentUserToken && r.shareToken === currentUserToken;
              const displayRank = page * PAGE_SIZE + idx + 1;
              const medalEmoji = medal(r.rank);
              const rowClass = [
                isMe ? 'leaderboard-row-me' : '',
                r.rank <= 3 ? `leaderboard-row-top3 leaderboard-row-rank${r.rank}` : '',
              ].filter(Boolean).join(' ');
              return (
                <tr
                  key={r.shareToken}
                  ref={isMe ? highlightRef : undefined}
                  className={rowClass || undefined}
                >
                  <td className="fw-bold">
                    {medalEmoji
                      ? <span className="leaderboard-rank-medal">{medalEmoji}</span>
                      : displayRank}
                  </td>
                  <td>
                    {r.name}
                    {r.nameSuffix && (
                      <span className="leaderboard-name-suffix"> ({r.nameSuffix})</span>
                    )}
                    {showBonus && r.hasBonus && (
                      <span
                        className="leaderboard-bonus-rocket"
                        title="Nailed all four top-4 placings exactly — earned the +50 bonus!"
                        aria-label="All four top-4 placings exact — +50 bonus"
                      >
                        {' '}🚀
                      </span>
                    )}
                  </td>
                  <td className="text-center leaderboard-col-tips">{r.totalTips}</td>
                  {midCols.map((c) => (
                    <td key={c.key} className={`text-center ${c.cls} leaderboard-col-hide-mobile`}>{c.get(r)}</td>
                  ))}
                  {playoffColumn && (
                    <td className="text-center leaderboard-col-pts">{r.playoffPoints ?? 0}</td>
                  )}
                  <td className="text-center leaderboard-col-pts fw-bold">{r.totalPoints}</td>
                  <td className="text-end">
                    <Link
                      href={`/pickem/share/${r.shareToken}`}
                      className="leaderboard-profile-link"
                      title={`View ${plainDisplayName(r)}'s predictions`}
                      aria-label={`View ${plainDisplayName(r)}'s predictions`}
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
            onClick={() => setPage(0)}
            disabled={page === 0}
          >
            « First
          </button>
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
          <button
            className="leaderboard-pager-btn"
            onClick={() => setPage(pageCount - 1)}
            disabled={page >= pageCount - 1}
          >
            Last »
          </button>
        </div>
      )}
    </div>
  );
}
