'use client';

import Link from 'next/link';

interface QualifyWidgetsProps {
  qualifyProb: number;
  eliminateProb: number;
  prob1st: number;
  prob2nd: number;
  prob3rd: number;
  prob4th: number;
  totalScenarios: number;
  matchesRemaining: number;
  teamName: string;
  bestThirdRank: number | null;
  bestThirdQualifies: boolean;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function QualifyWidgets({
  qualifyProb,
  eliminateProb,
  prob1st,
  prob2nd,
  prob3rd,
  prob4th,
  totalScenarios,
  matchesRemaining,
  teamName,
  bestThirdRank,
  bestThirdQualifies,
}: QualifyWidgetsProps) {
  const fmt = (v: number) => v.toFixed(1);

  if (matchesRemaining === 0) {
    const qualified = qualifyProb >= 50;
    return (
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div
            className="qualify-widget"
            style={{
              background: qualified
                ? 'linear-gradient(135deg, #007E33, #00C851)'
                : 'linear-gradient(135deg, #CC0000, #e57373)',
            }}
          >
            <div className="qualify-widget-body">
              <span className="qualify-widget-pct">
                {qualified ? 'QUALIFIED' : 'ELIMINATED'}
              </span>
            </div>
            <div className="qualify-widget-footer">
              <span>1st: {fmt(prob1st)}%</span>
              <span>2nd: {fmt(prob2nd)}%</span>
              <span>3rd: {fmt(prob3rd)}%</span>
              <span>4th: {fmt(prob4th)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 100% clinched play-off (0% chance of 4th place)
  const clinched = prob4th === 0 && matchesRemaining > 0;
  // 100% eliminated (100% chance of 4th place)
  const eliminated = prob4th === 100 && matchesRemaining > 0;

  if (clinched) {
    return (
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="clinch-infobox clinch-infobox--gold">
            <div className="clinch-infobox-icon">&#10003;</div>
            <div className="clinch-infobox-text">
              <strong>{teamName}</strong> has clinched play-off!
              <span className="clinch-infobox-detail">
                (1st: {fmt(prob1st)}% · 2nd: {fmt(prob2nd)}%)
              </span>
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="text-muted text-center" style={{ fontSize: '0.8rem' }}>
            Based on {totalScenarios.toLocaleString()} evaluated scenarios
            ({matchesRemaining} match{matchesRemaining !== 1 ? 'es' : ''} remaining)
          </div>
        </div>
      </div>
    );
  }

  if (eliminated) {
    return (
      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="clinch-infobox clinch-infobox--eliminated">
            <div className="clinch-infobox-icon">&#10007;</div>
            <div className="clinch-infobox-text">
              <strong>{teamName}</strong> has been eliminated.
            </div>
          </div>
        </div>
        <div className="col-12">
          <div className="text-muted text-center" style={{ fontSize: '0.8rem' }}>
            Based on {totalScenarios.toLocaleString()} evaluated scenarios
            ({matchesRemaining} match{matchesRemaining !== 1 ? 'es' : ''} remaining)
          </div>
        </div>
      </div>
    );
  }

  const onlyViaThird = prob1st === 0 && prob2nd === 0 && prob3rd > 0;
  const hasDirectQualify = prob1st > 0 || prob2nd > 0;
  const has3rdChance = prob3rd > 0;
  // 3-widget layout when team can finish 1st/2nd AND has 3rd chance
  const threeWidgets = hasDirectQualify && has3rdChance;
  const colClass = threeWidgets ? 'col-sm-4' : 'col-sm-6';

  return (
    <div className="row g-3 mb-4">
      {/* Best-3rd infobox when team has a chance of finishing 3rd */}
      {has3rdChance && (
        <div className="col-12">
          <div className={`best-third-infobox ${bestThirdRank !== null ? (bestThirdQualifies ? 'best-third-infobox--in' : 'best-third-infobox--out') : 'best-third-infobox--out'}`}>
            <div className="best-third-infobox-content">
              {onlyViaThird ? (
                <>
                  <strong>{teamName}</strong> won&apos;t clinch play-off directly &mdash; the only way is through the{' '}
                  <Link href="/worldcup2026/best-third-placed" className="best-third-infobox-link">
                    best 3rd-placed teams table
                  </Link>.
                </>
              ) : (
                <>
                  If <strong>{teamName}</strong> finishes 3rd, qualification depends on the{' '}
                  <Link href="/worldcup2026/best-third-placed" className="best-third-infobox-link">
                    best 3rd-placed teams table
                  </Link>.
                </>
              )}
              {bestThirdRank !== null ? (
                <span className="best-third-infobox-rank">
                  Currently {ordinal(bestThirdRank)} place &mdash;{' '}
                  {bestThirdQualifies ? (
                    <span className="best-third-infobox-status best-third-infobox-status--in">currently qualifies</span>
                  ) : (
                    <span className="best-third-infobox-status best-third-infobox-status--out">currently does not qualify</span>
                  )}
                </span>
              ) : (
                <span className="best-third-infobox-rank">
                  <span className="best-third-infobox-status best-third-infobox-status--out">Currently not in the table (not 3rd in group)</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Green filled widget: direct qualify (1st + 2nd) — shown when team can finish 1st or 2nd */}
      {hasDirectQualify && (
        <div className={colClass}>
          <div
            className="qualify-widget"
            style={{ background: 'linear-gradient(135deg, #007E33, #00C851)' }}
          >
            <div className="qualify-widget-header">CLINCHES PLAY-OFF</div>
            <div className="qualify-widget-body">
              <span className="qualify-widget-pct">{fmt(prob1st + prob2nd)}%</span>
            </div>
            <div className="qualify-widget-footer">
              <span>1st: {fmt(prob1st)}%</span>
              <span>2nd: {fmt(prob2nd)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Outlined green widget: 3rd position — shown when team can finish 3rd */}
      {has3rdChance && (
        <div className={colClass}>
          <div className="qualify-widget qualify-widget--outlined-green">
            <div className="qualify-widget-header">CLINCHES 3RD POSITION</div>
            <div className="qualify-widget-body">
              <span className="qualify-widget-pct">{fmt(prob3rd)}%</span>
            </div>
            <div className="qualify-widget-footer">
              <Link href="/worldcup2026/best-third-placed">
                <span className="d-none d-sm-inline">Best 3rd-placed table</span>
                <span className="d-inline d-sm-none">3rd placed table</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Eliminate widget (red) */}
      <div className={colClass}>
        <div
          className="qualify-widget"
          style={{ background: 'linear-gradient(135deg, #CC0000, #e57373)' }}
        >
          <div className="qualify-widget-header">WILL BE ELIMINATED</div>
          <div className="qualify-widget-body">
            <span className="qualify-widget-pct">{fmt(eliminateProb)}%</span>
          </div>
          <div className="qualify-widget-footer">
            <span>4th: {fmt(prob4th)}%</span>
          </div>
        </div>
      </div>

      {/* Scenario count info */}
      <div className="col-12">
        <div className="text-muted text-center" style={{ fontSize: '0.8rem' }}>
          Based on {totalScenarios.toLocaleString()} evaluated scenarios
          ({matchesRemaining} match{matchesRemaining !== 1 ? 'es' : ''} remaining)
        </div>
      </div>
    </div>
  );
}
