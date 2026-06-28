'use client';

/**
 * Generic two-position sliding toggle: a pill slides behind the active option.
 * Used for the Pick'em stage switch and the knockout result filter.
 */
export interface SliderOption<T extends string> {
  key: T;
  label: string;
}

export default function SliderToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  /** Exactly two options. */
  options: [SliderOption<T>, SliderOption<T>];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        display: 'inline-grid',
        gridTemplateColumns: '1fr 1fr',
        background: 'var(--wc-surface)',
        border: '1px solid var(--wc-border)',
        borderRadius: 999,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Sliding pill behind the active option. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '50%',
          background: 'var(--wc-accent)',
          borderRadius: 999,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          transform: `translateX(${activeIndex * 100}%)`,
          transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            style={{
              position: 'relative',
              zIndex: 1,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.35rem 1.1rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              color: active ? '#fff' : 'var(--wc-text-muted)',
              transition: 'color 0.2s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
