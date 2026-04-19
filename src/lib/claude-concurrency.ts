/**
 * Process-wide concurrency limiter for Claude API calls.
 *
 * Background recalculation after a match update can fan out to dozens of
 * AI requests (per-team scenario summaries × 4 positions × up to 4 teams,
 * plus 12 best-third summaries). Without a cap they'd all fire at once
 * and hammer the Anthropic rate limit. This semaphore caps the number of
 * in-flight Claude calls globally across all callers.
 */

const MAX_CONCURRENT_CLAUDE_CALLS = 6;

let inFlight = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_CLAUDE_CALLS) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function release(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

/**
 * Run `fn` with a global cap on parallel Claude API calls. Awaits a slot,
 * runs the function, and always releases the slot — even on rejection.
 */
export async function withClaudeSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
