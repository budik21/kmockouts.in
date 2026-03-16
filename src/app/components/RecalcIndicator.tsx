'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function RecalcIndicator() {
  const router = useRouter();
  const [groups, setGroups] = useState<string[]>([]);
  const prevGroups = useRef<string[]>([]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch('/api/recalc-status');
        const data = await res.json();
        if (!mounted) return;

        const current: string[] = data.recalculating ?? [];
        setGroups(current);

        // If previously had recalculating groups and now cleared → refresh
        if (prevGroups.current.length > 0 && current.length === 0) {
          router.refresh();
        }
        prevGroups.current = current;
      } catch {
        // ignore
      }
    }

    poll();
    timer = setInterval(poll, 4000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [router]);

  if (groups.length === 0) return null;

  return (
    <div className="recalc-banner">
      New data approaching... (Group{groups.length > 1 ? 's' : ''} {groups.sort().join(', ')})
    </div>
  );
}
