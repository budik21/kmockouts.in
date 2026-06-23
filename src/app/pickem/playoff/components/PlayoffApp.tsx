'use client';

import { useState } from 'react';
import Link from 'next/link';
import TopFourPicker from './TopFourPicker';
import KnockoutTipEditor from './KnockoutTipEditor';
import type { KnockoutMatchView, PlayoffTeam, UserKnockoutTip, UserPlayoffPick } from '@/lib/playoff-data';

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
  const [section, setSection] = useState<Section>('topfour');

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
          ⚔️ Bracket
        </button>
      </div>

      <div className="playoff-tab-content">
        {section === 'topfour' ? (
          <TopFourPicker teams={teams} initialPicks={userPicks} locked={picksLocked} picksLockAt={picksLockAt} />
        ) : (
          <KnockoutTipEditor matches={matches} userTips={userTips} />
        )}
      </div>
    </main>
  );
}
