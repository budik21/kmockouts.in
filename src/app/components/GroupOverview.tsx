'use client';

import Link from 'next/link';
import GroupStandings, { TeamProbData } from './GroupStandings';
import NextMatchesRow, { NextMatchDisplay } from './NextMatchesRow';

interface GroupData {
  groupId: string;
  /** Finished group-stage matches in this group (out of `totalMatches`). */
  finishedMatches?: number;
  /** Total scheduled group-stage matches in this group (typically 6). */
  totalMatches?: number;
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
  /** Full article body (HTML). The homepage card pulls the first paragraph
   *  from it to fill the widget alongside the lede so the widget height
   *  roughly matches the standings table next to it. */
  body_html?: string;
}

/** Pull the first <p>...</p> from a body_html string and return its inner
 *  HTML (without the wrapping <p> tags). Returns null if no paragraph found. */
function firstParagraphInner(html: string | undefined): string | null {
  if (!html) return null;
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return match ? match[1].trim() : null;
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

        const firstBodyParagraph = article ? firstParagraphInner(article.body_html) : null;

        // Counter in header: finished out of total matches across the group
        // (not rounds-played-per-team). Falls back to per-team count for
        // older callers that don't pass the new fields.
        const finished = group.finishedMatches ?? group.standings[0]?.matchesPlayed ?? 0;
        const total = group.totalMatches ?? 6;

        return (
          <div key={gid} className="group-card group-overview-card">
            <div className="group-card-header">
              <Link href={groupHref} className="group-overview-header-link">
                Group {gid}
              </Link>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                {finished}/{total} played
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
                      {firstBodyParagraph && (
                        <p
                          className="group-overview-body-excerpt"
                          dangerouslySetInnerHTML={{
                            __html: `${firstBodyParagraph} <a class="group-overview-readmore-inline" href="${groupHref}">Read more &rarr;</a>`,
                          }}
                        />
                      )}
                      {!firstBodyParagraph && (
                        <p className="group-overview-lede">
                          <Link href={groupHref} className="group-overview-readmore-inline">
                            Read more &rarr;
                          </Link>
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {group.nextMatches && group.nextMatches.length > 0 ? (
                        <>
                          <h3 className="group-overview-next-heading">Next matches</h3>
                          <NextMatchesRow matches={group.nextMatches.slice(0, 2)} large />
                        </>
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
