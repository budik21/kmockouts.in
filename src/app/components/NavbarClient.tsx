'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import ThemeToggle from './ThemeToggle';
import FeedbackWidget from './FeedbackWidget';
import TeamSearch from './TeamSearch';

interface NavbarUser {
  name: string;
  email: string;
  initials: string;
}

interface Props {
  user: NavbarUser | null;
}

export default function NavbarClient({ user }: Props) {
  const router = useRouter();
  const offcanvasRef = useRef<HTMLDivElement>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const closeOffcanvas = useCallback(() => {
    const el = offcanvasRef.current;
    if (!el) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bs = (window as any).bootstrap;
    const instance = bs?.Offcanvas?.getInstance(el);
    if (instance) {
      instance.hide();
      return;
    }
    el.classList.remove('show');
    document.body.classList.remove('offcanvas-backdrop-active');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    const backdrop = document.querySelector('.offcanvas-backdrop');
    backdrop?.remove();
  }, []);

  const navigateAndClose = useCallback(
    (href: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      closeOffcanvas();
      router.push(href);
    },
    [router, closeOffcanvas],
  );

  const handleLogin = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      closeOffcanvas();
      signIn('google', { callbackUrl: '/me' });
    },
    [closeOffcanvas],
  );

  const handleLogout = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      closeOffcanvas();
      signOut({ callbackUrl: '/' });
    },
    [closeOffcanvas],
  );

  return (
    <>
      <nav className="navbar navbar-wc sticky-top">
        <div className="container">
          <Link href="/worldcup2026" className="navbar-brand">
            Knockouts.in
          </Link>
          <div className="d-flex align-items-center gap-2">
            <TeamSearch />
            {user ? (
              <button
                className="navbar-avatar-btn"
                type="button"
                data-bs-toggle="offcanvas"
                data-bs-target="#navMenu"
                aria-controls="navMenu"
                aria-label="Open user menu"
                title={user.name || user.email}
              >
                <span className="navbar-avatar-circle">{user.initials}</span>
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </nav>

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
              href="/worldcup2026/fixtures"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026/fixtures')}
            >
              📅 Fixtures
            </a>
            <a
              href="/worldcup2026/best-third-placed"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026/best-third-placed')}
            >
              🥉 Best 3rd
            </a>
            <a
              href="/worldcup2026/knockout-bracket"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026/knockout-bracket')}
            >
              🏟️ Knockout Bracket
            </a>
            <a
              href="/worldcup2026/fifa-ranking"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/worldcup2026/fifa-ranking')}
            >
              📊 FIFA Ranking
            </a>
            <hr className="offcanvas-divider" />
            <a
              href="/pickem"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/pickem')}
            >
              🎯 Pick&apos;em
            </a>
            <a
              href="/pickem/leaderboard"
              className="nav-link offcanvas-nav-link"
              onClick={navigateAndClose('/pickem/leaderboard')}
            >
              🏅 Leaderboard
            </a>
            <hr className="offcanvas-divider" />
            {user ? (
              <>
                <a
                  href="/me"
                  className="nav-link offcanvas-nav-link"
                  onClick={navigateAndClose('/me')}
                >
                  👤 User profile
                </a>
                <a
                  href="#"
                  className="nav-link offcanvas-nav-link"
                  onClick={handleLogout}
                >
                  🚪 Log out
                </a>
              </>
            ) : (
              <a
                href="#"
                className="nav-link offcanvas-nav-link"
                onClick={handleLogin}
              >
                🔐 Login
              </a>
            )}
            <a
              href="#"
              className="nav-link offcanvas-nav-link"
              onClick={(e) => {
                e.preventDefault();
                closeOffcanvas();
                setFeedbackOpen(true);
              }}
            >
              💬 Feedback
            </a>
          </nav>
          <hr className="offcanvas-divider" />
          <div className="d-flex align-items-center gap-2 px-2">
            <span style={{ color: 'var(--wc-text-muted)', fontSize: '0.85rem' }}>Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <FeedbackWidget open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
