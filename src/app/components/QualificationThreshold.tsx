import type { QualificationThreshold, PointsBreakdownEntry } from '@/engine/best-third';

interface QualificationThresholdBoxProps {
  threshold: QualificationThreshold;
}

function formatGD(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return `${gd}`;
}

function findGDForPct(entry: PointsBreakdownEntry, targetPct: number): number | null {
  if (!entry.gdThresholds?.length) return null;
  // Find the lowest GD threshold that reaches at least targetPct qualify
  for (const t of entry.gdThresholds) {
    if (t.pctQualify >= targetPct) return t.gd;
  }
  return null;
}

function generateThresholdText(threshold: QualificationThreshold): string[] {
  const lines: string[] = [];
  const { pointsBreakdown } = threshold;

  // pointsBreakdown is sorted by points descending
  for (const entry of pointsBreakdown) {
    // Skip entries with negligible occurrence
    const qualPct = entry.pctQualifyRegardless ?? 0;
    if (entry.pctExact < 1 && qualPct < 1) continue;

    const pts = entry.points;
    const gdt = entry.gdThresholds;
    const totalBestCase = gdt?.length ? gdt[gdt.length - 1].pctQualify : qualPct;

    if (qualPct >= 95) {
      // Almost always enough
      lines.push(
        `${pts} points should be enough to qualify regardless of goal difference (${Math.round(qualPct)}%).`
      );
    } else if (qualPct >= 70) {
      // Usually enough, GD helps
      const gdFor90 = findGDForPct(entry, 90);
      const gdNote = gdFor90 !== null
        ? ` With GD ${formatGD(gdFor90)} or better, it's near-certain (${Math.round(entry.gdThresholds.find(t => t.gd === gdFor90)!.pctQualify)}%).`
        : '';
      lines.push(
        `${pts} points is likely enough (${Math.round(qualPct)}% regardless of GD).${gdNote}`
      );
    } else if (totalBestCase >= 15) {
      // Borderline — GD matters a lot
      const gdFor50 = findGDForPct(entry, 50);
      const gdFor80 = findGDForPct(entry, 80);

      let gdNote = '';
      if (gdFor50 !== null && gdFor80 !== null) {
        gdNote = ` With GD ${formatGD(gdFor50)} it's a coin flip (${Math.round(entry.gdThresholds.find(t => t.gd === gdFor50)!.pctQualify)}%); GD ${formatGD(gdFor80)} or better makes it likely (${Math.round(entry.gdThresholds.find(t => t.gd === gdFor80)!.pctQualify)}%).`;
      } else if (gdFor50 !== null) {
        gdNote = ` With GD ${formatGD(gdFor50)} or better, chances improve to ${Math.round(entry.gdThresholds.find(t => t.gd === gdFor50)!.pctQualify)}%.`;
      } else {
        gdNote = ` Even with a strong goal difference, chances max out at ${Math.round(totalBestCase)}%.`;
      }
      lines.push(
        `${pts} points on its own is not enough (${Math.round(qualPct)}%).${gdNote}`
      );
    } else if (entry.pctExact >= 2) {
      // Very unlikely
      lines.push(
        `${pts} points is rarely enough (${Math.round(totalBestCase)}% even with the best GD).`
      );
    }
  }

  if (lines.length === 0) {
    const most = pointsBreakdown.reduce((a, b) => b.pctExact > a.pctExact ? b : a, pointsBreakdown[0]);
    lines.push(
      `The most common threshold is ${most.points} points with a goal difference around ${formatGD(most.medianGD)}.`
    );
  }

  return lines;
}

export default function QualificationThresholdBox({ threshold }: QualificationThresholdBoxProps) {
  const lines = generateThresholdText(threshold);

  return (
    <div className="best-third-info-box mb-3">
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.95rem' }}>
        What does it take to qualify?
      </div>
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
        <p className="mb-1" style={{ opacity: 0.8 }}>
          Based on simulations of the remaining matches:
        </p>
        {lines.map((line, i) => (
          <p key={i} className={i < lines.length - 1 ? 'mb-1' : 'mb-0'}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
