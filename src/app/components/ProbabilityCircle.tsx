'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface ProbabilityCircleProps {
  qualifyProb: number; // 1st + 2nd combined (direct qualification)
  probFirst: number;
  probSecond: number;
  probThird: number;
  probOut: number;
  disabled?: boolean; // show grey "?" instead of probability
}

export default function ProbabilityCircle({
  qualifyProb,
  probFirst,
  probSecond,
  probThird,
  probOut,
  disabled = false,
}: ProbabilityCircleProps) {
  if (disabled) {
    return (
      <span className="prob-circle" style={{ background: '#6c757d' }} aria-label="Not enough data yet">
        ?
      </span>
    );
  }

  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<{ dispose: () => void; show: () => void; hide: () => void } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const initTooltip = useCallback(async () => {
    if (!ref.current || typeof window === 'undefined') return;
    const bs = await import('bootstrap/dist/js/bootstrap.bundle.min.js');
    if (!ref.current) return;

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

  // Close tooltip when clicking outside (for touch devices)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        tooltipRef.current?.hide();
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Desktop: show on hover
  const handleMouseEnter = () => {
    if (!isTouchDevice) {
      tooltipRef.current?.show();
    }
  };

  const handleMouseLeave = () => {
    if (!isTouchDevice) {
      tooltipRef.current?.hide();
    }
  };

  // Mobile: toggle on tap
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isTouchDevice) return;
    const el = ref.current;
    if (el) {
      if (el.getAttribute('aria-describedby')) {
        tooltipRef.current?.hide();
      } else {
        tooltipRef.current?.show();
      }
    }
  };

  const displayProb = Math.round(qualifyProb);

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
      aria-label={`${displayProb}% qualify — hover for details`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {displayProb}
    </span>
  );
}
