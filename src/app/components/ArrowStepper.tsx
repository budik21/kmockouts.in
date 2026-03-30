'use client';

/** Horizontal arrow stepper: ▲ [value] ▼ */
export default function ArrowStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  nullable = false,
  big = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  big?: boolean;
}) {
  const display = value === null ? '–' : value;
  const canDec = value !== null && value > min;
  const canInc = value === null || value < max;

  return (
    <div className={`arrow-stepper ${big ? 'arrow-stepper-big' : ''}`}>
      <button
        type="button"
        className="arrow-stepper-btn"
        disabled={!canInc}
        onClick={() => {
          if (value === null) onChange(0);
          else if (value < max) onChange(value + 1);
        }}
      >
        ▲
      </button>
      <span className="arrow-stepper-value">{display}</span>
      <button
        type="button"
        className="arrow-stepper-btn"
        disabled={!canDec}
        onClick={() => {
          if (value !== null && value > min) onChange(value - 1);
        }}
      >
        ▼
      </button>
    </div>
  );
}
