import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireSuperadminApi } from '@/lib/admin-auth';
import { pregenerateTeamScenarioSummaries } from '@/lib/probability-cache';
import { WC_TAG, LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { warmWcPages } from '@/lib/cache-warmup';
import { ALL_GROUPS } from '@/lib/constants';
import type { GroupId } from '@/lib/types';
import type { AiUsageStats } from '@/engine/scenario-summary-ai';

// Hardcoded Haiku 4.5 list pricing — kept here intentionally so the admin
// dashboard always shows a cost estimate even without external rate config.
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

interface Body {
  scope?: 'team' | 'group';
  groupId?: string;
  teamId?: number;
}

/**
 * POST /api/admin/ai-predictions/regenerate
 *
 * Superadmin-only force regeneration of AI scenario summaries.
 * Bypasses both the AI_PREDICTIONS_ENABLED env kill-switch and the
 * `ai_predictions` DB feature flag. Always overwrites the
 * ai_summary_cache entries.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireSuperadminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Body;
    const scope = body.scope;
    const groupId = body.groupId as GroupId | undefined;
    const teamId = body.teamId;

    if (scope !== 'team' && scope !== 'group') {
      return NextResponse.json({ error: 'scope must be "team" or "group"' }, { status: 400 });
    }
    if (!groupId || !ALL_GROUPS.includes(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }
    if (scope === 'team' && (!teamId || !Number.isInteger(teamId))) {
      return NextResponse.json({ error: 'teamId is required for scope=team' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 },
      );
    }

    const usage: AiUsageStats = { inputTokens: 0, outputTokens: 0, calls: 0 };
    const start = Date.now();

    await pregenerateTeamScenarioSummaries(groupId, {
      teamId: scope === 'team' ? teamId : undefined,
      force: true,
      ignoreFlags: true,
      usage,
    });

    const elapsedMs = Date.now() - start;

    // Purge caches in this request context so the very next render sees
    // freshly written summaries.
    revalidateTag(WC_TAG, 'max');
    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    // Warm Cloudflare so the next visitor doesn't pay for a cold edge.
    // Fire-and-forget — completion isn't required for the admin response.
    warmWcPages().catch(err => console.error('[ai-predictions/regenerate] warmup error:', err));

    const costUsd =
      (usage.inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK +
      (usage.outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;

    const scopeLabel = scope === 'team' ? `team ${teamId} in group ${groupId}` : `group ${groupId}`;
    const message =
      usage.calls === 0
        ? `No summaries regenerated for ${scopeLabel} (no eligible positions — group may be already finished or not enough matches played).`
        : `Regenerated ${usage.calls} summaries for ${scopeLabel} in ${(elapsedMs / 1000).toFixed(1)}s · ${usage.inputTokens.toLocaleString()} in + ${usage.outputTokens.toLocaleString()} out tokens · ~$${costUsd.toFixed(4)}`;

    return NextResponse.json({
      success: true,
      message,
      scope,
      groupId,
      teamId: teamId ?? null,
      elapsedMs,
      generated: usage.calls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
    });
  } catch (error) {
    console.error('POST /api/admin/ai-predictions/regenerate error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
