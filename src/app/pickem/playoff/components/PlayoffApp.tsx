'use client';

import { useState } from 'react';
import Link from 'next/link';
import TopFourPicker from './TopFourPicker';
import KnockoutTipEditor from './KnockoutTipEditor';
import type { KnockoutMatchView, PlayoffTeam, UserKnockoutTip, UserPlayoffPick } from '@/lib/playoff-data';
import { PLAYOFF_PICK_SLOTS } from '@/lib/playoff-scoring';

interface Props {
  matches: KnockoutMatchView[];
  teams: PlayoffTeam[];
  userTips: UserKnockoutTip[];
  userPicks: UserPlayoffPick[];
  picksLockAt: number | null;
  picksLocked: boolean;
}

type Section = 'topfour' | 'bracket';

export default function PlayoffApp({ matches, teams, userTips, userPicks, picksLockAt, picksLocked }: Props) {
  // If all four top-4 placings are already picked, open straight on Matches.
  const allTopFourPicked = PLAYOFF_PICK_SLOTS.every((slot) => userPicks.some((p) => p.slot === slot));
  const [section, setSection] = useState<Section>(allTopFourPicked ? 'bracket' : 'topfour');

  // Total play-off points earned so far (scored tips + scored picks).
  const tipPoints = userTips.reduce((s, t) => s + (t.points ?? 0), 0);
  const pickPoints = userPicks.reduce((s, p) => s + (p.points ?? 0), 0);
  const totalPoints = tipPoints + pickPoints;

  return (
    <main className="container py-4 playoff-app">
      <div className="playoff-app-head">
        <div>
          <h1 className="playoff-app-title">🏆 Play-off Predictions</h1>
          <p className="playoff-app-sub">FIFA World Cup 2026 — knockout stage</p>
        </div>
        <div className="playoff-app-score">
          <div className="playoff-app-score-num">{totalPoints}</div>
          <div className="playoff-app-score-label">play-off pts</div>
        </div>
      </div>

      <div className="playoff-app-links">
        <Link href="/pickem/leaderboard" className="playoff-app-link">📊 Leaderboard</Link>
        <Link href="/pickem/tips" className="playoff-app-link">⚽ Group-stage tips</Link>
        <Link href="/worldcup2026/knockout-bracket" className="playoff-app-link">🗺️ Full bracket</Link>
      </div>

      <div className="playoff-tabs">
        <button
          className={`playoff-tab ${section === 'topfour' ? 'active' : ''}`}
          onClick={() => setSection('topfour')}
        >
          🏅 Top 4
        </button>
        <button
          className={`playoff-tab ${section === 'bracket' ? 'active' : ''}`}
          onClick={() => setSection('bracket')}
        >
          ⚔️ Matches
        </button>
      </div>

      {/* Both panels stay mounted; we only toggle visibility. Unmounting on tab
          switch would reset each panel's local state — losing just-saved top-4
          picks and unsaved bracket score drafts until a full page reload. */}
      <div className="playoff-tab-content">
        <div style={{ display: section === 'topfour' ? 'block' : 'none' }}>
          <TopFourPicker teams={teams} initialPicks={userPicks} locked={picksLocked} picksLockAt={picksLockAt} />
        </div>
        <div style={{ display: section === 'bracket' ? 'block' : 'none' }}>
          <KnockoutTipEditor matches={matches} userTips={userTips} />
        </div>
      </div>
    </main>
  );
}
