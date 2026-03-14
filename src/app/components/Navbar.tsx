'use client';

import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import ScenarioSwitcher from './ScenarioSwitcher';

export default function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-wc sticky-top">
      <div className="container">
        <Link href="/" className="navbar-brand">
          Knockouts.in
        </Link>
        <div className="d-flex align-items-center gap-2 gap-sm-3">
          <Link href="/" className="nav-link d-none d-sm-inline">
            Groups
          </Link>
          <ScenarioSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
