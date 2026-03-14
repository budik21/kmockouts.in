'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('wc2026-theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem('wc2026-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', next ? 'dark' : 'light');
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
      {dark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  );
}
