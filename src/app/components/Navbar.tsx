'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import ScenarioSwitcher from './ScenarioSwitcher';

export default function Navbar() {
  const router = useRouter();
  const offcanvasRef = useRef<HTMLDivElement>(null);

  const navigateAndClose = useCallback(
    (href: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      // Close offcanvas via Bootstrap API
      const el = offcanvasRef.current;
      if (el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bsOffcanvas = (window as any).bootstrap?.Offcanvas?.getInstance(el);
        bsOffcanvas?.hide();
      }
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <nav className="navbar navbar-wc sticky-top">
        <div className="container">
          <Link href="/worldcup2026" className="navbar-brand">
            Knockouts.in
          </Link>
          <div className="d-flex align-items-center gap-2">
            <ScenarioSwitcher />
            <button
              className="navbar-hamburger"
              type="button"
              data-bs-toggle="offcanvas"
              data-bs-target="#navMenu"
              aria-controls="navMenu"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>
      </nav>

      {/* Offcanvas side menu */}
      <div
        className="offcanvas offcanvas-end offcanvas-wc"
        tabIndex={-1}
        id="navMenu"
        ref={offcanvasRef}
        aria-labelledby="navMenuLabel"
      >
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id="navMenuLabel">
            Menu
          </h5>
          <button
            type="button"
            className="btn-close btn-close-white"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          />
        </div>
        <div className="offcanvas-body">
          <nav className="nav flex-column gap-1">
            <a
              href="/worldcup2026"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026')}
            >
              🏆 Groups
            </a>
            <a
              href="/worldcup2026/best-third-placed"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026/best-third-placed')}
            >
              🥉 Best 3rd
            </a>
            <hr className="offcanvas-divider" />
            <a
              href="/admin"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/admin')}
            >
              ⚙️ Administration
            </a>
          </nav>
          <hr className="offcanvas-divider" />
          <div className="d-flex align-items-center gap-2 px-2">
            <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </>
  );
}
