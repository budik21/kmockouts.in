/** Shared card icon SVG components used in admin and match displays */

export function YellowCardIcon({ size = 1 }: { size?: number }) {
  const w = Math.round(14 * size);
  const h = Math.round(18 * size);
  return (
    <svg width={w} height={h} viewBox="0 0 14 18" className="card-icon">
      <rect x="1" y="1" width="12" height="16" rx="1.5" fill="#ffc107" stroke="#b8860b" strokeWidth="1" />
    </svg>
  );
}

export function SecondYellowIcon({ size = 1 }: { size?: number }) {
  const w = Math.round(20 * size);
  const h = Math.round(18 * size);
  return (
    <svg width={w} height={h} viewBox="0 0 20 18" className="card-icon">
      <rect x="1" y="1" width="12" height="16" rx="1.5" fill="#ffc107" stroke="#b8860b" strokeWidth="1" />
      <rect x="7" y="1" width="12" height="16" rx="1.5" fill="#dc3545" stroke="#a71d2a" strokeWidth="1" />
    </svg>
  );
}

export function RedCardIcon({ size = 1 }: { size?: number }) {
  const w = Math.round(14 * size);
  const h = Math.round(18 * size);
  return (
    <svg width={w} height={h} viewBox="0 0 14 18" className="card-icon">
      <rect x="1" y="1" width="12" height="16" rx="1.5" fill="#dc3545" stroke="#a71d2a" strokeWidth="1" />
    </svg>
  );
}
