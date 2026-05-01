'use client';

import Link from 'next/link';
import GroupStandings, { TeamProbData } from './GroupStandings';
import NextMatchesRow, { NextMatchDisplay } from './NextMatchesRow';

interface GroupData {
  groupId: string;
  standings: {
    position: number;
    team: { id: number; name: string; shortName: string; countryCode: string; isPlaceholder: boolean };
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }[];
  probabilities?: Record<number, TeamProbData>;
  nextMatches?: NextMatchDisplay[];
}

export interface GroupArticleSummary {
  headline: string;
  lede: string;
}

interface GroupOverviewProps {
  groups: Record<string, GroupData>;
  /** Map of groupId -> { headline, lede } pulled from ai_group_article_cache.
   *  When the entry for a group is missing, that card falls back to a
   *  next-matches-only widget (with bigger fonts). */
  articles?: Record<string, GroupArticleSummary>;
}

export default function GroupOverview({ groups, articles }: GroupOverviewProps) {
  const groupIds = Object.keys(groups).sort();

  return (
    <div className="d-flex flex-column gap-3">
      {groupIds.map((gid) => {
        const group = groups[gid];
        const article = articles?.[gid];
        const groupHref = `/worldcup2026/group-${gid.toLowerCase()}`;

        return (
          <div key={gid} className="group-card group-overview-card">
            <div className="group-card-header">
              <Link href={groupHref} className="group-overview-header-link">
                Group {gid}
              </Link>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                {group.standings[0]?.matchesPlayed ?? 0}/3 played
              </span>
            </div>

            <div className="group-card-body">
              <div className="group-overview-grid">
                {/* Standings — left on desktop, top on mobile */}
                <div className="group-overview-table">
                  <GroupStandings
                    standings={group.standings}
                    compact
                    groupId={gid}
                    probabilities={group.probabilities}
                  />
                </div>

                {/* Article widget — right on desktop, below on mobile */}
                <div className="group-overview-widget">
                  {article ? (
                    <>
                      <Link href={groupHref} className="group-overview-headline-link">
                        <h2 className="group-overview-headline">{article.headline}</h2>
                      </Link>
                      <p className="group-overview-lede">{article.lede}</p>
                      {group.nextMatches && group.nextMatches.length > 0 && (
                        <div className="group-overview-next">
                          <NextMatchesRow matches={group.nextMatches.slice(0, 2)} />
                        </div>
                      )}
                      <Link href={groupHref} className="group-overview-readmore">
                        Read more &rarr;
                      </Link>
                    </>
                  ) : (
                    <>
                      {group.nextMatches && group.nextMatches.length > 0 ? (
                        <NextMatchesRow matches={group.nextMatches.slice(0, 2)} large />
                      ) : (
                        <p className="group-overview-empty">
                          Group analysis will be available after the next match.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
