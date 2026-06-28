'use client';

import Link from 'next/link';
import TeamFlag from './TeamFlag';
import LocalKickOff from './LocalKickOff';
import DayCalendar from './DayCalendar';
import { slugify } from '@/lib/slugify';

interface FixtureTeam {
  name: string;
  shortName: string;
  countryCode: string;
}

export interface FixtureItem {
  id: number;
  groupId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  venue: string;
  /** ISO 8601 kickoff (UTC). Grouping by day and the time label are both
   *  derived from this in the visitor's local zone, client-side. */
  kickOff: string;
  status: string;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
}

interface Props {
  fixtures: FixtureItem[];
}

/** Team page URL, e.g. "/worldcup2026/group-a/team/czech-republic". */
const teamHref = (groupId: string, name: string) =>
  `/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(name)}`;

export default function FixturesCalendar({ fixtures }: Props) {
  return (
    <DayCalendar
      items={fixtures}
      idPrefix="fixture"
      renderItem={(f) => <FixtureCard key={f.id} fixture={f} />}
    />
  );
}

function FixtureCard({ fixture: f }: { fixture: FixtureItem }) {
  const isFinished = f.status === 'FINISHED';
  const isLive = f.status === 'LIVE';

  return (
    <div className={`fixture-card${isFinished ? ' fixture-finished' : ''}${isLive ? ' fixture-live' : ''}`}>
      <div className="fixture-card-top">
        <Link href={`/worldcup2026/group-${f.groupId.toLowerCase()}`} className="fixture-group-link">Group {f.groupId}</Link>
        <span className="fixture-venue-time">
          <span className="fixture-venue">{f.venue}</span>
          <LocalKickOff
            iso={f.kickOff}
            className="fixture-kickoff"
            timeOptions={{ hour: '2-digit', minute: '2-digit' }}
          />
        </span>
      </div>
      <div className="fixture-card-main">
        <Link href={teamHref(f.groupId, f.homeTeam.name)} className="fixture-team fixture-team-home">
          <span className="fixture-team-name">{f.homeTeam.name}</span>
          <span className="fixture-team-short">{f.homeTeam.shortName}</span>
          <TeamFlag countryCode={f.homeTeam.countryCode} />
        </Link>

        <div className="fixture-score-box">
          {isFinished || isLive ? (
            <span className={`fixture-score${isLive ? ' fixture-score-live' : ''}`}>
              {f.homeGoals} – {f.awayGoals}
            </span>
          ) : (
            <span className="fixture-vs">—</span>
          )}
        </div>

        <Link href={teamHref(f.groupId, f.awayTeam.name)} className="fixture-team fixture-team-away">
          <TeamFlag countryCode={f.awayTeam.countryCode} />
          <span className="fixture-team-name">{f.awayTeam.name}</span>
          <span className="fixture-team-short">{f.awayTeam.shortName}</span>
        </Link>
      </div>
    </div>
  );
}
