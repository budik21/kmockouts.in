import Link from 'next/link';
import type { Metadata } from 'next';
import JsonLd from '@/app/components/JsonLd';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title:
    'How to Qualify for the FIFA World Cup 2026 Knockout Stage — Play-Off Rules',
  description:
    'Complete guide to FIFA World Cup 2026 qualification: how 32 of 48 soccer teams advance from the group stage to the knockout bracket, third-placed play-off ranking, FIFA tiebreaker rules and probability simulation.',
  keywords: [
    'FIFA World Cup 2026 qualification',
    'how to qualify World Cup',
    'play-off rules',
    'knockout stage rules',
    'Round of 32',
    'third-placed teams',
    'FIFA tiebreaker rules',
    'World Cup play-off',
    'soccer qualification rules',
  ],
  alternates: { canonical: '/worldcup2026/how-to-clinch-play-off-worldcup2026' },
  openGraph: {
    title: 'How to Qualify for the FIFA World Cup 2026 Knockout Stage',
    description:
      'How 32 of 48 teams advance from the group stage to the knockout bracket — play-off rules, tiebreakers and probabilities.',
    url: `${SITE_URL}/worldcup2026/how-to-clinch-play-off-worldcup2026`,
    type: 'article',
  },
};

export default function HowToQualifyPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${SITE_URL}/worldcup2026`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'How to Clinch a Play-Off Spot',
          item: `${SITE_URL}/worldcup2026/how-to-clinch-play-off-worldcup2026`,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How does a team qualify for the FIFA World Cup 2026 knockout stage?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '32 of 48 teams advance to the Round of 32: the 12 group winners, the 12 runners-up, and the 8 best third-placed teams ranked across all 12 groups.',
          },
        },
        {
          '@type': 'Question',
          name: 'What are the FIFA tiebreaker rules?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'FIFA Article 13 applies head-to-head points, head-to-head goal difference and head-to-head goals first. If still tied, overall goal difference, overall goals scored and fair play points are used. The final tiebreaker is the FIFA / Coca-Cola Men\'s World Ranking.',
          },
        },
        {
          '@type': 'Question',
          name: 'How are the best third-placed teams ranked?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The 12 third-placed teams are ranked by points, goal difference, goals scored, fair play points and FIFA ranking. The top 8 advance to the knockout Round of 32.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does Knockouts.in calculate qualification probabilities?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'For each group with five or fewer remaining matches we enumerate every possible score combination (up to 537,824). For larger groups we run a 50,000-iteration Monte Carlo simulation, then apply FIFA tiebreaker rules to determine final positions.',
          },
        },
      ],
    },
  ];

  return (
    <main className="container py-4">
      <JsonLd data={jsonLd} />

      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link href="/worldcup2026">Home</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            How to Clinch a Play-Off Spot
          </li>
        </ol>
      </nav>

      <h1 className="mb-2">How to Clinch a Play-Off Spot at the FIFA World Cup 2026</h1>
      <p className="text-muted mb-4" style={{ fontSize: '1.05rem' }}>
        Everything you need to know about advancing from the FIFA World Cup 2026 group stage to the
        knockout bracket: qualification rules, third-placed play-off ranking and FIFA tiebreaker rules.
      </p>

      {/* ── Section A: Path to the Knockout Stage ── */}
      <section className="group-card mb-4">
        <div className="group-card-header">Path to the Knockout Stage</div>
        <div className="group-card-body p-3 p-md-4">

          {/* Funnel diagram */}
          <div className="htw-funnel">
            <div className="htw-funnel-step">
              <div className="htw-funnel-number">48</div>
              <div className="htw-funnel-label">teams</div>
              <div className="htw-funnel-detail">12 groups of 4</div>
            </div>
            <div className="htw-funnel-arrow">&darr;</div>
            <div className="htw-funnel-step">
              <div className="htw-funnel-number">3</div>
              <div className="htw-funnel-label">matches per team</div>
              <div className="htw-funnel-detail">Win = 3 pts &bull; Draw = 1 pt &bull; Loss = 0 pts</div>
            </div>
            <div className="htw-funnel-arrow">&darr;</div>
            <div className="htw-funnel-step htw-funnel-result">
              <div className="htw-funnel-number">32</div>
              <div className="htw-funnel-label">teams advance</div>
            </div>
          </div>

          {/* Qualification breakdown */}
          <div className="htw-qualify-grid mt-4">
            <div className="htw-qualify-box htw-qualify-auto">
              <div className="htw-qualify-count">12</div>
              <div className="htw-qualify-desc">Group winners</div>
              <small>1st place in each group</small>
            </div>
            <div className="htw-qualify-plus">+</div>
            <div className="htw-qualify-box htw-qualify-auto">
              <div className="htw-qualify-count">12</div>
              <div className="htw-qualify-desc">Runners-up</div>
              <small>2nd place in each group</small>
            </div>
            <div className="htw-qualify-plus">+</div>
            <div className="htw-qualify-box htw-qualify-third">
              <div className="htw-qualify-count">8</div>
              <div className="htw-qualify-desc">Best 3rd-placed</div>
              <small>8 of 12 third-placed teams</small>
            </div>
            <div className="htw-qualify-equals">=</div>
            <div className="htw-qualify-box htw-qualify-total">
              <div className="htw-qualify-count">32</div>
              <div className="htw-qualify-desc">Round of 32</div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Section B: How Third-Placed Teams Are Ranked ── */}
      <section className="group-card mb-4">
        <div className="group-card-header">How Third-Placed Teams Are Ranked</div>
        <div className="group-card-body p-3 p-md-4">
          <p>
            After the group stage, the 12 third-placed teams are compared across all groups.
            The <strong>top 8</strong> advance to the Round of 32. They are ranked by:
          </p>
          <div className="htw-criteria-list">
            <div className="htw-criteria-item">
              <span className="htw-criteria-num">1</span>
              <div><strong>Points</strong><br /><small className="text-muted">More points = higher rank</small></div>
            </div>
            <div className="htw-criteria-item">
              <span className="htw-criteria-num">2</span>
              <div><strong>Goal difference</strong><br /><small className="text-muted">Goals scored minus goals conceded</small></div>
            </div>
            <div className="htw-criteria-item">
              <span className="htw-criteria-num">3</span>
              <div><strong>Goals scored</strong><br /><small className="text-muted">More goals = higher rank</small></div>
            </div>
            <div className="htw-criteria-item">
              <span className="htw-criteria-num">4</span>
              <div><strong>Fair play points</strong><br /><small className="text-muted">Fewer cards = better score</small></div>
            </div>
            <div className="htw-criteria-item">
              <span className="htw-criteria-num">5</span>
              <div><strong>FIFA World Ranking</strong><br /><small className="text-muted">Final tiebreaker</small></div>
            </div>
          </div>
          <p className="mt-3 mb-0" style={{ fontSize: '0.9rem' }}>
            <strong>8 of 12</strong> third-placed teams advance &mdash; making every goal matter,
            even in a loss.
          </p>
        </div>
      </section>

      {/* ── Section C: How We Calculate Probabilities ── */}
      <section className="group-card mb-4">
        <div className="group-card-header">How We Calculate Probabilities</div>
        <div className="group-card-body p-3 p-md-4">
          <p>
            Our engine simulates every possible outcome of the remaining matches
            to determine each team&apos;s chances of qualifying.
          </p>

          <div className="htw-steps">
            <div className="htw-step">
              <div className="htw-step-icon">1</div>
              <div>
                <strong>Identify remaining matches</strong>
                <p className="mb-0 text-muted">For each group, find all unplayed matches.</p>
              </div>
            </div>
            <div className="htw-step">
              <div className="htw-step-icon">2</div>
              <div>
                <strong>Define possible outcomes</strong>
                <p className="mb-0 text-muted">
                  Each match has 14 possible score buckets: home win by 1&ndash;6+ goals,
                  two types of draw, and away win by 1&ndash;6+ goals.
                </p>
              </div>
            </div>
            <div className="htw-step">
              <div className="htw-step-icon">3</div>
              <div>
                <strong>Simulate all combinations</strong>
                <p className="mb-0 text-muted">
                  With 5 or fewer remaining matches, we check <em>every</em> combination
                  (up to 537,824). With 6+, we run a Monte Carlo simulation with 50,000 random samples.
                </p>
              </div>
            </div>
            <div className="htw-step">
              <div className="htw-step-icon">4</div>
              <div>
                <strong>Calculate standings for each scenario</strong>
                <p className="mb-0 text-muted">
                  Apply FIFA&apos;s official tiebreaker rules (Article 13) to determine
                  final group positions.
                </p>
              </div>
            </div>
            <div className="htw-step">
              <div className="htw-step-icon">5</div>
              <div>
                <strong>Count finishing positions</strong>
                <p className="mb-0 text-muted">
                  Probability = number of scenarios where a team finishes in a given position
                  divided by total scenarios.
                </p>
              </div>
            </div>
            <div className="htw-step">
              <div className="htw-step-icon">6</div>
              <div>
                <strong>Cross-group best-third simulation</strong>
                <p className="mb-0 text-muted">
                  A separate Monte Carlo run (10,000 iterations) across all 12 groups
                  determines which third-placed teams would qualify.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section D: FIFA Tiebreaker Rules ── */}
      <section className="group-card mb-4">
        <div className="group-card-header">FIFA Tiebreaker Rules (Article 13)</div>
        <div className="group-card-body p-3 p-md-4">
          <p>When two or more teams in the same group are equal on points:</p>

          <div className="htw-tiebreak-steps">
            <div className="htw-tiebreak-step">
              <div className="htw-tiebreak-label">Step 1 &mdash; Head-to-Head</div>
              <p className="mb-0">Points, goal difference, and goals scored in matches <em>between the tied teams</em>.</p>
            </div>
            <div className="htw-tiebreak-step">
              <div className="htw-tiebreak-label">Step 2 &mdash; Overall Group</div>
              <p className="mb-0">
                Goal difference, goals scored, and <strong>fair play score</strong> across
                all group matches. Fair play: yellow card = &minus;1 pt, direct red card = &minus;4 pts.
              </p>
            </div>
            <div className="htw-tiebreak-step">
              <div className="htw-tiebreak-label">Step 3 &mdash; FIFA Ranking</div>
              <p className="mb-0">If still tied, teams are ranked by the latest FIFA/Coca-Cola Men&apos;s World Ranking.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Navigation CTAs ── */}
      <section className="htw-cta-grid mb-4">
        <Link href="/worldcup2026" className="htw-cta-card">
          <div className="htw-cta-icon">&#9917;</div>
          <div>
            <strong>View All Groups</strong>
            <p className="mb-0 text-muted">Live standings and probabilities for all 12 groups</p>
          </div>
        </Link>
        <Link href="/worldcup2026/best-third-placed" className="htw-cta-card">
          <div className="htw-cta-icon">&#127942;</div>
          <div>
            <strong>Best Third-Placed Teams</strong>
            <p className="mb-0 text-muted">See which third-placed teams are currently qualifying</p>
          </div>
        </Link>
      </section>
    </main>
  );
}
