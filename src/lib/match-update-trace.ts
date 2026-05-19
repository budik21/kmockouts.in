/**
 * Trace object built up during the synchronous match-update cascade.
 *
 * Captured for one purpose: the superadmin summary e-mail. Every step of
 * the cascade pushes what it received and what it produced into this
 * structure; the e-mail builder then renders it as a per-step report so
 * we can see exactly what data the AI was fed and what came back.
 *
 * Diagnostic only — nothing on the public site reads this.
 */

import type { TipTransition } from './tip-recalc';

export interface ArticleCallTrace {
  /** Cache hit short-circuit — no API call was made. */
  cacheHit: boolean;
  /** User prompt that was sent to Claude (system prompt omitted — it's constant). */
  userPrompt?: string;
  /** Structured input data fed to the prompt builder. */
  inputData?: unknown;
  /** Parsed article (or null when generation failed). */
  output?: { headline: string; lede: string; body_html: string } | null;
  /** Failure reason — timeout, parse error, API error, DB write error. */
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  /** Hash key under which the article is stored (so we can match against DB). */
  contentHash?: string;
}

export interface ScenarioSummaryTrace {
  teamId: number;
  teamName: string;
  position: number;
  probability: number;
  /** Hardcoded "Guaranteed." for 100% positions, AI-generated HTML otherwise. */
  output: string;
  cacheHit: boolean;
  error?: string;
}

export interface MatchUpdateTrace {
  startedAt: string;
  match: {
    matchId: number;
    groupId: string;
    homeTeam: string;
    awayTeam: string;
    homeGoals: number | null;
    awayGoals: number | null;
    status: string;
  };
  /** Group standings AFTER probability recalc — read from DB. */
  standingsAfter?: Array<{
    position: number;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
  }>;
  /** Per-team probability cache rows AFTER recalc. */
  probabilities?: Array<{
    teamName: string;
    pPos1: number;
    pPos2: number;
    pPos3: number;
    pPos4: number;
    pThirdQual: number;
  }>;
  scenarioSummaries: ScenarioSummaryTrace[];
  groupArticle?: ArticleCallTrace & { groupId: string };
  teamArticles: Array<ArticleCallTrace & { teamId: number; teamName: string }>;
  tipTransitions?: Array<{
    tipId: number;
    userName: string;
    userEmail: string;
    matchLabel: string;
    tipScore: string;
    oldPoints: number | null;
    newPoints: number | null;
  }>;
  /** How many tip-result e-mails were queued for delivery (fire-and-forget). */
  tipEmailsQueued?: number;
  cacheInvalidation?: {
    revalidatedTags: string[];
    cloudflarePurged: boolean;
    cloudflareError?: string;
  };
  /** Set when THIS update was the one that closed out a group (every match
   *  in the group is now FINISHED for the first time). Surfaces in the
   *  diagnostic e-mail so it's obvious which save triggered the expensive
   *  cross-group regen of every other group's article + 3rd-place team
   *  article. */
  groupClosure?: {
    groupId: string;
    finishedMatches: number;
    totalMatches: number;
  };
  /** Audit of the cross-group 3rd-place regen step. Every match-update save
   *  can shift the best-third table, so the predictions/articles for
   *  3rd-placed teams in OTHER already-fully-decided groups need refreshing
   *  even when THIS update did not close a group. This field records what
   *  the regen step actually did (or why it skipped) so the diagnostic
   *  e-mail can show which teams from other groups had their articles
   *  refreshed because of the snapshot shift.
   *
   *  - `closure-covered`: skipped because the closure regen pass already
   *    covers every other group (closure regen is a superset).
   *  - `no-decided-others`: no other group is fully decided yet, so there
   *    is nothing to refresh.
   *  - `snapshot-shift`: the regen ran; `regeneratedTeams` lists the
   *    3rd-placed teams (one per decided other group) whose articles were
   *    force-regenerated against the fresh best-third snapshot.
   */
  crossGroupThirdPlaceRegen?: {
    mode: 'closure-covered' | 'no-decided-others' | 'snapshot-shift';
    regeneratedTeams: Array<{
      groupId: string;
      teamId: number;
      teamName: string;
    }>;
  };
  /** Cross-group ranking of currently-3rd-placed teams as it stood when the
   *  AI articles were generated. Included in the diagnostic e-mail so the
   *  admin can verify the snapshot fed into the prompts. */
  bestThirdSnapshot?: {
    isFinal: boolean;
    groupsFullyPlayed: number;
    rows: Array<{
      rank: number;
      groupId: string;
      teamName: string;
      points: number;
      gd: number;
      goalsFor: number;
      goalsAgainst: number;
      fairPlayPoints: number;
      fifaRanking?: number;
      groupFullyPlayed: boolean;
      snapshotStatus: 'qualify' | 'eliminate';
    }>;
    tiebreakerNotes: string[];
  };
  /** Free-form error log — anything the cascade swallowed. */
  errors: Array<{ step: string; message: string }>;
  /** Total cascade duration in milliseconds. Set just before the e-mail is sent. */
  totalDurationMs?: number;
  /**
   * Set when the cascade hit its hard time budget and bailed out of a stage so
   * the diagnostic e-mail could still go out before the platform recycles the
   * container. `afterMs` is wall-clock since the stage started; `budgetMs` is
   * the budget that was exceeded. When set, the e-mail subject and body
   * surface this prominently — the partial trace is still useful (everything
   * that DID complete is captured), but the reader needs to know it is
   * incomplete and that some Claude calls were abandoned in flight.
   */
  timedOut?: {
    stage: string;
    afterMs: number;
    budgetMs: number;
  };
}

export function newMatchUpdateTrace(match: MatchUpdateTrace['match']): MatchUpdateTrace {
  return {
    startedAt: new Date().toISOString(),
    match,
    scenarioSummaries: [],
    teamArticles: [],
    errors: [],
  };
}
