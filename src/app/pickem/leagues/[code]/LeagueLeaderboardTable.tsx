'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export interface LeagueRow {
  userId: number;
  name: string;
  nameSuffix: string | null;
  shareToken: string | null;
  totalTips: number;
  exact: number;
  outcome: number;
  wrong: number;
  pending: number;
  totalPoints: number;
  rank: number;
}

interface Props {
  rows: LeagueRow[];
  myUserId: number | null;
}

export default function LeagueLeaderboardTable({ rows, myUserId }: Props) {
  const myRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (myRowRef.current) {
      myRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  if (rows.length === 0) {
    return (
      <div className="leaderboard-empty">
        <p>This league has no members yet. Share the invite link to get people in!</p>
      </div>
    );
  }

  return (
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
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th className="text-center leaderboard-col-hide-mobile">Tips</th>
            <th className="text-center leaderboard-col-hide-mobile">Exact</th>
            <th className="text-center leaderboard-col-hide-mobile">Winner</th>
            <th className="text-center leaderboard-col-hide-mobile">Bad</th>
            <th className="text-center leaderboard-col-pts">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isMe = myUserId !== null && r.userId === myUserId;
            return (
              <tr
                key={r.userId}
                ref={isMe ? myRowRef : undefined}
                className={isMe ? 'leaderboard-row-me' : undefined}
              >
                <td className="fw-bold">{r.rank}</td>
                <td>
                  {r.shareToken ? (
                    <Link href={`/pickem/share/${r.shareToken}`} className="text-decoration-none">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  {r.nameSuffix && (
                    <span className="leaderboard-name-suffix"> ({r.nameSuffix})</span>
                  )}
                </td>
                <td className="text-center leaderboard-col-hide-mobile">{r.totalTips}</td>
                <td className="text-center leaderboard-exact leaderboard-col-hide-mobile">{r.exact}</td>
                <td className="text-center leaderboard-outcome leaderboard-col-hide-mobile">{r.outcome}</td>
                <td className="text-center leaderboard-wrong leaderboard-col-hide-mobile">{r.wrong}</td>
                <td className="text-center leaderboard-col-pts fw-bold">{r.totalPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
