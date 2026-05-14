import Link from 'next/link';

export default function LeagueNotFound() {
  return (
    <main className="container py-5">
      <div className="tipovacka-revoked">
        <div className="tipovacka-revoked-icon">&#128269;</div>
        <h2>League not found</h2>
        <p>
          We couldn&apos;t find a tipping league with that code. Double-check the
          6-character code, or ask the league owner to send you the invite link.
        </p>
        <div className="d-flex gap-2 justify-content-center flex-wrap">
          <Link href="/me/leagues" className="tipovacka-revoked-link">
            My leagues
          </Link>
          <Link href="/pickem/leaderboard" className="tipovacka-revoked-link">
            Global leaderboard
          </Link>
        </div>
      </div>
    </main>
  );
}
