'use client';

import { useEffect, useState } from 'react';

/**
 * Returns false during SSR and the first client render, then true after mount.
 *
 * Lets a component render a deterministic, SSR-safe value first (so server and
 * client markup match and React doesn't drop a hydration mismatch) and then
 * switch to a client-only value once mounted — e.g. a kickoff timestamp
 * formatted in the visitor's local timezone instead of the server's UTC.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
