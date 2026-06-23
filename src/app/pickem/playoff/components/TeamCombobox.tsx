'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { PlayoffTeam } from '@/lib/playoff-data';

interface Props {
  teams: PlayoffTeam[];
  value: number | null;
  onChange: (teamId: number) => void;
  /** Teams already chosen in the other slots — shown disabled. */
  disabledTeamIds?: Set<number>;
  disabled?: boolean;
  placeholder?: string;
}

function TeamFlag({ code }: { code: string }) {
  if (!code) return <span className="playoff-flag-placeholder" aria-hidden />;
  return <span className={`fi fi-${code.toLowerCase()} playoff-combo-flag`} aria-hidden />;
}

export default function TeamCombobox({ teams, value, onChange, disabledTeamIds, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => teams.find((t) => t.id === value) ?? null, [teams, value]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q),
    );
  }, [teams, filter]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div className="playoff-combo" ref={wrapRef}>
      <button
        type="button"
        className={`playoff-combo-trigger ${open ? 'open' : ''} ${selected ? 'has-value' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="playoff-combo-value">
            <TeamFlag code={selected.countryCode} />
            <span className="playoff-combo-name">{selected.name}</span>
          </span>
        ) : (
          <span className="playoff-combo-placeholder">{placeholder ?? 'Select a team…'}</span>
        )}
        {!disabled && <span className="playoff-combo-caret">▾</span>}
      </button>

      {open && (
        <div className="playoff-combo-panel">
          <input
            ref={inputRef}
            type="text"
            className="playoff-combo-search"
            placeholder="Filter by country…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="playoff-combo-list" role="listbox">
            {filtered.length === 0 && <li className="playoff-combo-empty">No teams match</li>}
            {filtered.map((t) => {
              const isDisabled = disabledTeamIds?.has(t.id) && t.id !== value;
              const isSelected = t.id === value;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`playoff-combo-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                  >
                    <TeamFlag code={t.countryCode} />
                    <span className="playoff-combo-name">{t.name}</span>
                    {isDisabled && <span className="playoff-combo-taken">picked</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
