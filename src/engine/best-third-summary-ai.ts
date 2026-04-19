/**
 * AI-powered summaries for best-third-placed teams.
 *
 * For each third-placed team, generates a short explanation of what
 * needs to happen for them to qualify as one of the best 8 third-placed teams.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query } from '../lib/db';
import { withClaudeSlot } from '../lib/claude-concurrency';
import type { QualificationThreshold } from './best-third';

// Lazy singleton — instantiating Anthropic() at module load throws when
// ANTHROPIC_API_KEY is not configured, which would crash any page that
// imports this module (even just to read cached summaries).
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM_PROMPT = `You are a football (soccer) analyst writing for a World Cup prediction website.

Your job: for a third-placed team, explain what needs to happen for them to qualify as one of the best 8 (out of 12) third-placed teams across all groups.

STRUCTURE:
1. FIRST SENTENCE: The key takeaway. What must happen? Examples:
   - "A win in the last match would almost guarantee qualification."
   - "Already in a strong position — even a loss could be enough."
   - "Needs a big win and results from other groups to go their way."
2. SECOND SENTENCE: Probability context — one sentence.
3. THEN (only if needed): Brief details about what matters most.

LENGTH:
- 2–4 sentences total. Never more.
- Wrap each paragraph (max 2 sentences) in <p> tags.

LANGUAGE:
- Very simple English — many readers are not native speakers
- Short sentences. Simple words. No idioms.
- Do NOT use labels like "Bottom line:" or "Key factor:" — just write directly
- IMPORTANT: This is a tournament — all matches are played at neutral venues. Never say "home" or "away". Just say "plays against" or "faces".

FORMATTING:
- Use <strong> tags around team names INLINE
- Do NOT use markdown
- Output a single line of HTML with <p> tags for paragraphs
- Do NOT use <br> tags`;

export interface BestThirdTeamContext {
  teamName: string;
  teamId: number;
  groupId: string;
  currentRank: number; // 1-12 in the best-third table
  points: number;
  goalDifference: number;
  goalsFor: number;
  qualProbability: number; // per-team probability of finishing 3rd AND qualifying
  remainingMatch: { opponent: string } | null;
}

export interface BestThirdSummaryInput {
  /** All 12 third-placed teams with their context */
  allTeams: BestThirdTeamContext[];
  /** Which team we're generating the summary for */
  targetTeam: BestThirdTeamContext;
  /** What the 8th-place team typically looks like (from Monte Carlo) */
  threshold: QualificationThreshold | null;
}

async function generateBestThirdSummary(input: BestThirdSummaryInput): Promise<string> {
  const tableLines = input.allTeams
    .map(t => `  ${t.currentRank}. ${t.teamName} (Group ${t.groupId}) — ${t.points} pts, GD ${t.goalDifference >= 0 ? '+' : ''}${t.goalDifference}, GF ${t.goalsFor} — qual. prob: ${t.qualProbability.toFixed(1)}%${t.remainingMatch ? ` — plays ${t.remainingMatch.opponent}` : ' — all matches done'}${t.teamId === input.targetTeam.teamId ? ' ← THIS TEAM' : ''}`)
    .join('\n');

  const target = input.targetTeam;
  const matchInfo = target.remainingMatch
    ? `Remaining match: vs ${target.remainingMatch.opponent}`
    : 'All matches played.';

  // Build threshold context from simulation data
  let thresholdInfo = '';
  if (input.threshold?.pointsBreakdown.length) {
    const lines = input.threshold.pointsBreakdown
      .filter(b => b.pctExact >= 1 || b.pctQualifyRegardless >= 1)
      .map(b => {
        const gdNote = b.gdThresholds?.length
          ? b.gdThresholds
              .filter(g => g.pctQualify >= 50 && g.pctQualify <= 95)
              .slice(0, 2)
              .map(g => `with GD ≥ ${g.gd >= 0 ? '+' : ''}${g.gd}: ${g.pctQualify.toFixed(0)}%`)
              .join(', ')
          : '';
        return `  ${b.points} pts: qualifies regardless of GD in ${b.pctQualifyRegardless.toFixed(0)}% of simulations${gdNote ? ` (${gdNote})` : ''}`;
      });
    if (lines.length) {
      thresholdInfo = `\nQualification threshold (what the 8th-place team typically looks like based on simulations):\n${lines.join('\n')}\nIMPORTANT: Use this threshold data to assess whether a team's points and GD are enough. Do NOT just rely on the qualification probability — explain in terms of points and goal difference.\n`;
    }
  }

  const userPrompt = `Best third-placed teams table (top 8 qualify, bottom 4 eliminated):
${tableLines}
${thresholdInfo}
Team to analyze: ${target.teamName} (Group ${target.groupId})
Current rank: ${target.currentRank} of 12 (${target.currentRank <= 8 ? 'currently qualifying' : 'currently NOT qualifying'})
Stats: ${target.points} pts, GD ${target.goalDifference >= 0 ? '+' : ''}${target.goalDifference}, GF ${target.goalsFor}
Qualification probability (chance of finishing 3rd in group AND qualifying as best third): ${target.qualProbability.toFixed(1)}%
${matchInfo}

Write a short summary (2-4 sentences) of what this team needs to qualify as best third-placed.`;

  const response = await withClaudeSlot(() => getClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }));

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text ?? '';
}

// ============================================================
// Cache
// ============================================================

function hashContext(allTeams: BestThirdTeamContext[], threshold: QualificationThreshold | null): string {
  const thresholdStr = threshold
    ? threshold.pointsBreakdown.map(b => `${b.points}:${b.pctQualifyRegardless}:${b.medianGD}`).join(',')
    : 'none';
  const str = allTeams.map(t => `${t.teamId}:${t.points}:${t.goalDifference}:${t.goalsFor}:${t.qualProbability}`).join('|') + '||' + thresholdStr;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

async function getCached(teamId: number, contextHash: string): Promise<string | null> {
  const rows = await query<{ summary_html: string }>(
    'SELECT summary_html FROM ai_summary_cache WHERE group_id = $1 AND team_id = $2 AND patterns_hash = $3',
    ['B3', teamId, contextHash],
  );
  return rows.length > 0 ? rows[0].summary_html : null;
}

/**
 * Fallback: return the most recent cached summary for a team regardless of
 * the patterns_hash. Used when an exact (stats-matching) cache entry is not
 * available — better to show a slightly stale summary than nothing.
 */
async function getCachedAny(teamId: number): Promise<string | null> {
  const rows = await query<{ summary_html: string }>(
    `SELECT summary_html FROM ai_summary_cache
     WHERE group_id = $1 AND team_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    ['B3', teamId],
  );
  return rows.length > 0 ? rows[0].summary_html : null;
}

async function saveCache(teamId: number, summaryHtml: string, contextHash: string): Promise<void> {
  await query(
    `INSERT INTO ai_summary_cache (group_id, team_id, position, summary_html, patterns_hash)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (group_id, team_id, position)
     DO UPDATE SET summary_html = $3, patterns_hash = $4, created_at = NOW()`,
    ['B3', teamId, summaryHtml, contextHash],
  );
}

// ============================================================
// Public API
// ============================================================

const AI_CALL_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Generate AI summaries for all teams in the best-third table.
 * Returns Map<teamId, htmlString>.
 */
export async function generateBestThirdSummaries(
  allTeams: BestThirdTeamContext[],
  threshold?: QualificationThreshold | null,
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  if (allTeams.length === 0) return result;

  const ctxHash = hashContext(allTeams, threshold ?? null);
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // Always check cache first — even when no API key is configured we want
  // to serve previously generated summaries rather than silently hide the
  // feature. Missing exact hash match falls back to the most recent entry.
  const tasks: BestThirdTeamContext[] = [];
  for (const team of allTeams) {
    try {
      const cached = await getCached(team.teamId, ctxHash);
      if (cached) {
        result.set(team.teamId, cached);
        continue;
      }
    } catch {
      // Cache lookup failed — fall through to fallback / regeneration
    }

    // No exact-hash hit. If we cannot regenerate (no API key), try to serve
    // the latest stale cache entry so the UI still shows something useful.
    if (!hasApiKey) {
      try {
        const stale = await getCachedAny(team.teamId);
        if (stale) {
          result.set(team.teamId, stale);
          continue;
        }
      } catch {
        // Ignore — nothing we can do
      }
      continue;
    }

    tasks.push(team);
  }

  // Nothing left to generate (either all served from cache or no API key).
  if (tasks.length === 0 || !hasApiKey) return result;

  // Fire all tasks in parallel — the shared withClaudeSlot semaphore caps
  // in-flight Claude calls process-wide, so we don't need a local batch loop.
  const promises = tasks.map(async (targetTeam) => {
    try {
      const summary = await withTimeout(
        generateBestThirdSummary({ allTeams, targetTeam, threshold: threshold ?? null }),
        AI_CALL_TIMEOUT_MS,
      );
      if (summary) {
        result.set(targetTeam.teamId, summary);
        try {
          await saveCache(targetTeam.teamId, summary, ctxHash);
        } catch {
          // Non-fatal
        }
      }
    } catch (err) {
      console.error(`Best-third AI summary failed for ${targetTeam.teamName}:`, err);
    }
  });
  await Promise.allSettled(promises);
  return result;
}
