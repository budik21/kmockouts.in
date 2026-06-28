'use client';

import Link from 'next/link';
import TeamFlag from './TeamFlag';
import LocalKickOff from './LocalKickOff';
import DayCalendar from './DayCalendar';
import { slugify } from '@/lib/slugify';
import type { PlayoffFixture, PlayoffFixtureTeam } from '@/lib/playoff-data';

interface Props {
  fixtures: PlayoffFixture[];
}

/** Team page URL, e.g. "/worldcup2026/group-a/team/czech-republic". */
const teamHref = (groupId: string, name: string) =>
  `/worldcup2026/group-${groupId.toLowerCase()}/team/${slugify(name)}`;

const groupHref = (groupId: string) => `/worldcup2026/group-${groupId.toLowerCase()}`;

/** The score shown on one side of a finished knockout match. */
interface SideScore {
  /** Goals after extra time if it was played, otherwise the 90' score. */
  goals: number;
  /** Penalty shoot-out tally, when the tie went to penalties. */
  pens: number | null;
}

/** Per-side scores from a finished knockout fixture, or null if not finished. */
function sideScores(f: PlayoffFixture): { home: SideScore; away: SideScore; aet: boolean } | null {
  if (f.status !== 'FINISHED') return null;
  const aet = f.homeGoalsEt != null && f.awayGoalsEt != null;
  const homeGoals = f.homeGoalsEt ?? f.homeGoals;
  const awayGoals = f.awayGoalsEt ?? f.awayGoals;
  if (homeGoals == null || awayGoals == null) return null;
  return {
    home: { goals: homeGoals, pens: f.homePens },
    away: { goals: awayGoals, pens: f.awayPens },
    aet,
  };
}

export default function PlayoffFixturesCalendar({ fixtures }: Props) {
  if (fixtures.length === 0) {
    return (
      <div className="alert alert-info">
        Knockout fixtures will appear here once the bracket schedule is published.
      </div>
    );
  }
  return (
    <DayCalendar
      items={fixtures.map((f) => ({ ...f, id: f.matchNumber }))}
      idPrefix="playoff"
      renderItem={(f) => <PlayoffFixtureCard key={f.matchNumber} fixture={f} />}
    />
  );
}

/** One side of a play-off card: resolved team (flag + clickable name + group
 *  link) when known, otherwise the static placeholder label. */
function TeamSlot({
  team,
  placeholder,
  side,
  isWinner,
}: {
  team: PlayoffFixtureTeam | null;
  placeholder: string;
  side: 'home' | 'away';
  isWinner: boolean;
}) {
  if (!team) {
    return (
      <div className={`playoff-team playoff-team-${side} playoff-team-placeholder`}>
        <span className="playoff-team-ph">{placeholder}</span>
      </div>
    );
  }

  const name = (
    <Link
      href={teamHref(team.groupId, team.name)}
      className={`playoff-team-link${isWinner ? ' playoff-team-winner' : ''}`}
    >
      <span className="fixture-team-name">{team.name}</span>
      <span className="fixture-team-short">{team.shortName}</span>
    </Link>
  );

  const group = team.groupId ? (
    <Link href={groupHref(team.groupId)} className="playoff-team-group">
      Grp {team.groupId}
    </Link>
  ) : null;

  return (
    <div className={`playoff-team playoff-team-${side}`}>
      {side === 'home' ? (
        <>
          <span className="playoff-team-body">{name}{group}</span>
          <TeamFlag countryCode={team.countryCode} />
        </>
      ) : (
        <>
          <TeamFlag countryCode={team.countryCode} />
          <span className="playoff-team-body">{name}{group}</span>
        </>
      )}
    </div>
  );
}

function PlayoffFixtureCard({ fixture: f }: { fixture: PlayoffFixture }) {
  const scores = sideScores(f);
  const isFinished = scores != null;
  const advId = f.advancingTeamId;

  return (
    <div className={`fixture-card playoff-card${isFinished ? ' fixture-finished' : ''}`}>
      <div className="fixture-card-top">
        <Link
          href={`/worldcup2026/knockout-bracket?highlight=${f.matchNumber}`}
          className="fixture-group-link"
        >
          {f.roundLabel}
        </Link>
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
        <TeamSlot
          team={f.homeTeam}
          placeholder={f.homePlaceholder}
          side="home"
          isWinner={advId != null && f.homeTeam?.id === advId}
        />

        <div className="fixture-score-box">
          {isFinished ? (
            <span className="fixture-score">
              {scores!.home.goals} – {scores!.away.goals}
              {scores!.home.pens != null && scores!.away.pens != null && (
                <span className="playoff-pens"> ({scores!.home.pens}–{scores!.away.pens})</span>
              )}
              {scores!.aet && <span className="playoff-aet">AET</span>}
            </span>
          ) : (
            <span className="fixture-vs">—</span>
          )}
        </div>

        <TeamSlot
          team={f.awayTeam}
          placeholder={f.awayPlaceholder}
          side="away"
          isWinner={advId != null && f.awayTeam?.id === advId}
        />
      </div>
    </div>
  );
}
