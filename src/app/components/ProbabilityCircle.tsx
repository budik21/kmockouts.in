'use client';

import { useRef, useEffect, useCallback } from 'react';

interface ProbabilityCircleProps {
  qualifyProb: number; // 1st + 2nd + 3rd combined (3rd can qualify via best-third table)
  probFirst: number;
  probSecond: number;
  probThird: number;
  probOut: number;
}

export default function ProbabilityCircle({
  qualifyProb,
  probFirst,
  probSecond,
  probThird,
  probOut,
}: ProbabilityCircleProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<{ dispose: () => void } | null>(null);

  const initTooltip = useCallback(async () => {
    if (!ref.current || typeof window === 'undefined') return;
    const bs = await import('bootstrap/dist/js/bootstrap.bundle.min.js');
    if (!ref.current) return;

    // Dispose existing
    const existing = bs.Tooltip.getInstance(ref.current);
    if (existing) existing.dispose();

    tooltipRef.current = new bs.Tooltip(ref.current, {
      html: true,
      placement: 'top',
      trigger: 'manual',
      customClass: 'prob-tooltip',
    });
  }, []);

  useEffect(() => {
    initTooltip();
    return () => {
      tooltipRef.current?.dispose();
      tooltipRef.current = null;
    };
  }, [qualifyProb, probFirst, probSecond, probThird, probOut, initTooltip]);

  // Close tooltip when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        tooltipRef.current?.dispose();
        initTooltip();
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [initTooltip]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (tooltipRef.current) {
      // Toggle: check if tooltip is currently shown
      const el = ref.current;
      if (el) {
        import('bootstrap/dist/js/bootstrap.bundle.min.js').then((bs) => {
          const instance = bs.Tooltip.getInstance(el);
          if (instance) {
            // Check if visible by looking for aria-describedby
            if (el.getAttribute('aria-describedby')) {
              instance.hide();
            } else {
              instance.show();
            }
          }
        });
      }
    }
  };

  // Display qualify probability (1st + 2nd + 3rd, since 3rd can qualify via best-third)
  const displayProb = Math.round(qualifyProb);

  // Color: green shades for qualify, red shades for eliminate
  let bgColor: string;
  if (qualifyProb >= 75) bgColor = '#198754';
  else if (qualifyProb >= 50) bgColor = '#5cb85c';
  else if (qualifyProb >= 25) bgColor = '#e57373';
  else bgColor = '#dc3545';

  const tooltipContent =
    `<div class="prob-tooltip-inner">` +
    `<div class="prob-tooltip-title">Qualification breakdown</div>` +
    `<div class="prob-tooltip-row"><span class="prob-tooltip-dot" style="background:#28a745"></span><span class="prob-tooltip-label">1st place</span><span class="prob-tooltip-val">${probFirst.toFixed(1)}%</span></div>` +
    `<div class="prob-tooltip-row"><span class="prob-tooltip-dot" style="background:#4d8eff"></span><span class="prob-tooltip-label">2nd place</span><span class="prob-tooltip-val">${probSecond.toFixed(1)}%</span></div>` +
    `<div class="prob-tooltip-row"><span class="prob-tooltip-dot" style="background:#ffd43b"></span><span class="prob-tooltip-label">3rd place</span><span class="prob-tooltip-val">${probThird.toFixed(1)}%</span></div>` +
    `<div class="prob-tooltip-row"><span class="prob-tooltip-dot" style="background:#ff6b6b"></span><span class="prob-tooltip-label">4th place</span><span class="prob-tooltip-val">${probOut.toFixed(1)}%</span></div>` +
    `</div>`;

  return (
    <span
      ref={ref}
      className="prob-circle"
      style={{ background: bgColor }}
      data-bs-toggle="tooltip"
      data-bs-title={tooltipContent}
      role="button"
      aria-label={`${displayProb}% qualify — click for details`}
      onClick={handleClick}
    >
      {displayProb}
    </span>
  );
}
