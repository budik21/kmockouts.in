export async function onRequestError() {
  // Required export — no-op
}

export async function register() {
  // Runs once when the Next.js server starts — ensures DB tables exist
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeSchema } = await import('./lib/db');
    try {
      await initializeSchema();
      console.log('[instrumentation] DB schema initialized');
    } catch (e) {
      console.error('[instrumentation] Failed to initialize DB schema:', e);
      return;
    }

    // Sync kick_off and venue from seed data (ensures DB matches latest schedule)
    const { syncMatchSchedule } = await import('./lib/sync-schedule');
    try {
      const synced = await syncMatchSchedule();
      console.log(`[instrumentation] Synced schedule for ${synced} matches`);
    } catch (e) {
      console.error('[instrumentation] Failed to sync match schedule:', e);
    }
  }
}
