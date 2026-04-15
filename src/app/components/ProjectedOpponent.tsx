import Link from 'next/link';
import TeamFlag from './TeamFlag';
import NextMatchDate from './NextMatchDate';

interface ProjectedOpponentProps {
  roundLabel: string;
  opponent: { name: string; countryCode: string } | null;
  opponentPlaceholder: string;
  kickOff: string | null;
  venue: string | null;
  teamName: string;
  matchNumber: number;
}

export default function ProjectedOpponent({
  roundLabel,
  opponent,
  opponentPlaceholder,
  kickOff,
  venue,
  teamName,
  matchNumber,
}: ProjectedOpponentProps) {
  return (
    <Link
      href={`/worldcup2026/knockout-bracket?highlight=${matchNumber}`}
      className="group-card mb-4 text-center d-block projected-opponent"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <div className="group-card-body py-4">
        <div className="mb-2" style={{ fontSize: '0.8rem', color: 'var(--bs-secondary-color, #adb5bd)', opacity: 0.8 }}>
          As things stand, {teamName} would face
        </div>
        <div
          className="d-flex justify-content-center align-items-center gap-2 fw-bold"
          style={{ fontSize: '1.6rem', lineHeight: 1.1 }}
        >
          {opponent ? (
            <>
              <TeamFlag countryCode={opponent.countryCode} size="lg" />
              <span>{opponent.name}</span>
            </>
          ) : (
            <span>{opponentPlaceholder}</span>
          )}
        </div>
        {kickOff && venue && (
          <div className="mt-3" style={{ fontSize: '0.78rem', color: 'var(--bs-secondary-color, #adb5bd)', opacity: 0.75 }}>
            <NextMatchDate kickOff={kickOff} venue={venue} />
          </div>
        )}
      </div>
      <div
        className="bg-body-tertiary border-top text-center"
        style={{
          padding: '0.6rem 1rem',
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--bs-secondary-color, #6c757d)',
        }}
      >
        {roundLabel} Opponent Projection →
      </div>
    </Link>
  );
}
