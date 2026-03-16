'use client';

import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import ScenarioSwitcher from './ScenarioSwitcher';

export default function Navbar() {
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
            <Link
              href="/worldcup2026"
              className="nav-link offcanvas-nav-link"
              data-bs-dismiss="offcanvas"
            >
              🏆 Groups
            </Link>
            <Link
              href="/worldcup2026/best-third-placed"
              className="nav-link offcanvas-nav-link"
              data-bs-dismiss="offcanvas"
            >
              🥉 Best 3rd
            </Link>
            <hr className="offcanvas-divider" />
            <Link
              href="/admin"
              className="nav-link offcanvas-nav-link"
              data-bs-dismiss="offcanvas"
            >
              ⚙️ Administration
            </Link>
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
