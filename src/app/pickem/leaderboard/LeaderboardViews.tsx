'use client';

import { useRef, useState } from 'react';
import LeaderboardTable from './LeaderboardTable';
import type { LeaderboardRow } from './page';

export type LeaderboardView = 'all' | 'groups' | 'playoff';

interface Props {
  all: LeaderboardRow[];
  groups: LeaderboardRow[];
  playoff: LeaderboardRow[];
  defaultView: LeaderboardView;
  /** Whole group stage decided — enables the Play-off column in the All view. */
  groupsComplete: boolean;
  currentUserToken?: string | null;
  /** Fallback identity for the "me" row when share tokens may be null (leagues). */
  currentUserId?: number | null;
  /** Empty-state message passed through to the table. */
  emptyMessage?: string;
}

const ORDER: LeaderboardView[] = ['all', 'groups', 'playoff'];

const META: Record<LeaderboardView, { label: string; caption: string }> = {
  all: { label: 'All', caption: 'Group stage + play-off combined.' },
  groups: { label: 'Groups', caption: 'Group stage only — 4 pts exact score, 1 pt correct result.' },
  playoff: { label: 'Play-off', caption: 'Knockout only — 8 pts exact 90′ score, 5 pts advancing team, plus your top-4 picks.' },
};

export default function LeaderboardViews({ all, groups, playoff, defaultView, groupsComplete, currentUserToken, currentUserId, emptyMessage }: Props) {
  const [view, setView] = useState<LeaderboardView>(defaultView);
  // Bumped on every change so the panel replays its slide-in animation.
  const [anim, setAnim] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const index = ORDER.indexOf(view);
  const rowsByView: Record<LeaderboardView, LeaderboardRow[]> = { all, groups, playoff };

  function change(next: LeaderboardView) {
    if (next === view) return;
    setView(next);
    setAnim((a) => a + 1);
  }

  function shift(dir: 1 | -1) {
    const ni = index + dir;
    if (ni < 0 || ni >= ORDER.length) return;
    change(ORDER[ni]);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    shift(dx < 0 ? 1 : -1); // swipe left → next view
  }

  return (
    <div className="lb-views">
      <div
        className="lb-toggle"
        role="tablist"
        aria-label="Leaderboard scope"
        style={{ ['--lb-toggle-index' as string]: index }}
      >
        <span className="lb-toggle-pill" aria-hidden />
        {ORDER.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`lb-toggle-btn ${view === v ? 'active' : ''}`}
            onClick={() => change(v)}
          >
            {META[v].label}
          </button>
        ))}
      </div>

      <p className="lb-view-caption">{META[view].caption}</p>

      <div
        className="lb-panel"
        key={anim}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <LeaderboardTable
          rows={rowsByView[view]}
          currentUserToken={currentUserToken}
          currentUserId={currentUserId}
          variant={view}
          playoffColumn={view === 'all' && groupsComplete}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
