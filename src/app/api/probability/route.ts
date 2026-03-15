import { NextRequest, NextResponse } from 'next/server';
import { GroupId } from '@/lib/types';
import { ALL_GROUPS } from '@/lib/constants';
import { calculateGroupProbabilities } from '@/engine/probability';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('group')?.toUpperCase() as GroupId | undefined;

  if (!groupId || !ALL_GROUPS.includes(groupId)) {
    return NextResponse.json(
      { error: 'Group parameter required. Use A-L.' },
      { status: 400 }
    );
  }

  try {
    const summaries = await calculateGroupProbabilities(groupId);

    const result = summaries.map((s) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      probabilities: s.positionProbabilities,
      totalScenarios: s.totalScenarios,
      edgeScenariosByPosition: Object.fromEntries(
        Object.entries(s.edgeScenariosByPosition).map(([pos, combos]) => [pos, combos.slice(0, 12)])
      ),
    }));

    return NextResponse.json({
      groupId,
      teams: result,
    });
  } catch (error) {
    console.error('Probability calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate probabilities' },
      { status: 500 }
    );
  }
}
