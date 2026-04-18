'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PendingMatch {
  id: number;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

interface StatusResponse {
  tipsRecalculating: boolean;
  pendingMatches: PendingMatch[];
}

export default function LeaderboardRecalcBanner() {
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);
  const [pending, setPending] = useState<PendingMatch[]>([]);
  const prev = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch('/api/recalc-status');
        const data = (await res.json()) as StatusResponse;
        if (!mounted) return;

        const now = !!data.tipsRecalculating;
        setRecalculating(now);
        setPending(Array.isArray(data.pendingMatches) ? data.pendingMatches : []);

        if (prev.current && !now) {
          router.refresh();
        }
        prev.current = now;
      } catch {
        // ignore
      }
    }

    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [router]);

  if (!recalculating) return null;

  return (
    <div className="leaderboard-recalc-wrap">
      <div className="leaderboard-recalc-banner">Leaderboard is being recalculated…</div>
      {pending.length > 0 && (
        <div className="leaderboard-recalc-pending">
          <div className="leaderboard-recalc-pending-title">Matches not yet scored</div>
          <ul className="leaderboard-recalc-pending-list">
            {pending.map((m) => (
              <li key={m.id}>
                {m.home} {m.homeGoals ?? '–'} : {m.awayGoals ?? '–'} {m.away}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
