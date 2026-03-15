'use client';

interface QualifyWidgetsProps {
  qualifyProb: number;
  eliminateProb: number;
  prob1st: number;
  prob2nd: number;
  prob3rd: number;
  prob4th: number;
  totalScenarios: number;
  matchesRemaining: number;
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

  return (
    <div className="row g-3 mb-4">
      {/* Qualify widget (green) */}
      <div className="col-sm-6">
        <div
          className="qualify-widget"
          style={{ background: 'linear-gradient(135deg, #007E33, #00C851)' }}
        >
          <div className="qualify-widget-header">CLINCHES PLAY-OFF</div>
          <div className="qualify-widget-body">
            <span className="qualify-widget-pct">{fmt(qualifyProb)}%</span>
          </div>
          <div className="qualify-widget-footer">
            <span>1st: {fmt(prob1st)}%</span>
            <span>2nd: {fmt(prob2nd)}%</span>
          </div>
        </div>
      </div>

      {/* Eliminate widget (red) */}
      <div className="col-sm-6">
        <div
          className="qualify-widget"
          style={{ background: 'linear-gradient(135deg, #CC0000, #e57373)' }}
        >
          <div className="qualify-widget-header">WILL BE ELIMINATED</div>
          <div className="qualify-widget-body">
            <span className="qualify-widget-pct">{fmt(eliminateProb)}%</span>
          </div>
          <div className="qualify-widget-footer">
            <span>3rd: {fmt(prob3rd)}%</span>
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
