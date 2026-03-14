'use client';

interface ProbabilityBarProps {
  probFirst: number;
  probSecond: number;
  probThird: number;
  probOut: number;
  showLegend?: boolean;
}

export default function ProbabilityBar({
  probFirst,
  probSecond,
  probThird,
  probOut,
  showLegend = false,
}: ProbabilityBarProps) {
  return (
    <div>
      <div className="prob-bar-container">
        {probFirst > 0 && (
          <div className="prob-bar-first" style={{ width: `${probFirst}%` }} title={`1st: ${probFirst}%`} />
        )}
        {probSecond > 0 && (
          <div className="prob-bar-second" style={{ width: `${probSecond}%` }} title={`2nd: ${probSecond}%`} />
        )}
        {probThird > 0 && (
          <div className="prob-bar-third" style={{ width: `${probThird}%` }} title={`3rd: ${probThird}%`} />
        )}
        {probOut > 0 && (
          <div className="prob-bar-out" style={{ width: `${probOut}%` }} title={`Out: ${probOut}%`} />
        )}
      </div>
      {showLegend && (
        <div className="prob-legend">
          <span className="prob-legend-item">
            <span className="prob-dot" style={{ background: 'var(--prob-first)' }} />
            1st {probFirst}%
          </span>
          <span className="prob-legend-item">
            <span className="prob-dot" style={{ background: 'var(--prob-second)' }} />
            2nd {probSecond}%
          </span>
          <span className="prob-legend-item">
            <span className="prob-dot" style={{ background: 'var(--prob-third)' }} />
            3rd {probThird}%
          </span>
          <span className="prob-legend-item">
            <span className="prob-dot" style={{ background: 'var(--prob-out)' }} />
            Out {probOut}%
          </span>
        </div>
      )}
    </div>
  );
}
