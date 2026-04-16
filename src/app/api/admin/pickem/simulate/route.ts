import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { slugify } from '@/lib/slugify';

/**
 * Fill the pick'em tables with 55 fake tipsters + tips.
 *
 * Destructive: wipes `tip` and `tipster_user` before inserting.
 * Points are set directly on `tip.points` (bypassing scoring from real results)
 * so the leaderboard reflects the intended distribution immediately.
 *
 * The distribution includes several edge cases:
 *  - pure ties (same total AND same exact count)
 *  - ties broken by exact count (same total, different exacts)
 *  - users without publish consent (tips_public = false) so the public
 *    leaderboard is a subset of the internal stats
 *  - a zero-points user
 */

interface Profile {
  name: string;
  exact: number;    // tips with points = 4
  outcome: number;  // tips with points = 1
  wrong: number;    // tips with points = 0
  pending: number;  // tips with points = NULL
  consent: boolean; // tips_public
}

// 55 profiles. Non-consent indices (1-based): 2, 5, 7, 10, 13, 16, 19, 22, 25,
// 28, 31, 34, 37, 40, 43, 46, 49, 52, 55 → 19 non-consent, 36 consent.
const PROFILES: Profile[] = [
  // Rank 1-3: triple tie at 48 pts, all with 9 exact (PURE TIE)
  { name: 'Jan Novák',        exact: 9, outcome: 12, wrong: 5, pending: 4, consent: true },
  { name: 'Petr Svoboda',     exact: 9, outcome: 12, wrong: 6, pending: 3, consent: false },
  { name: 'Pavel Novotný',    exact: 9, outcome: 12, wrong: 3, pending: 6, consent: true },
  // Rank 4-5: tied at 44 pts, different exact counts (tiebreaker case)
  { name: 'Tomáš Dvořák',     exact: 8, outcome: 12, wrong: 5, pending: 5, consent: true },
  { name: 'Martin Černý',     exact: 7, outcome: 16, wrong: 4, pending: 3, consent: false },
  // Rank 6-8: triple tie at 40 pts, 8 exact (PURE TIE)
  { name: 'Jakub Procházka',  exact: 8, outcome: 8,  wrong: 10, pending: 4, consent: true },
  { name: 'David Kučera',     exact: 8, outcome: 8,  wrong: 8,  pending: 6, consent: false },
  { name: 'Michal Veselý',    exact: 8, outcome: 8,  wrong: 11, pending: 3, consent: true },
  // Rank 9: solo 37 pts
  { name: 'Lukáš Horák',      exact: 7, outcome: 9,  wrong: 9,  pending: 5, consent: true },
  // Rank 10-11: tied at 34 pts, different exacts
  { name: 'Ondřej Němec',     exact: 7, outcome: 6,  wrong: 12, pending: 5, consent: false },
  { name: 'Jiří Marek',       exact: 6, outcome: 10, wrong: 10, pending: 4, consent: true },
  // Rank 12-14: triple tie at 30 pts, 6 exact
  { name: 'Václav Pokorný',   exact: 6, outcome: 6,  wrong: 13, pending: 5, consent: true },
  { name: 'Filip Pospíšil',   exact: 6, outcome: 6,  wrong: 14, pending: 4, consent: false },
  { name: 'Adam Hájek',       exact: 6, outcome: 6,  wrong: 11, pending: 7, consent: true },
  // Rank 15-16: tied at 28 pts
  { name: 'Štěpán Jelínek',   exact: 5, outcome: 8,  wrong: 12, pending: 5, consent: true },
  { name: 'Aleš Král',        exact: 5, outcome: 8,  wrong: 13, pending: 4, consent: false },
  // Rank 17
  { name: 'Matěj Růžička',    exact: 5, outcome: 7,  wrong: 14, pending: 4, consent: true },
  // Rank 18
  { name: 'Daniel Beneš',     exact: 5, outcome: 6,  wrong: 15, pending: 4, consent: true },
  // Rank 19-20: tied at 25 pts, different exacts
  { name: 'Radek Fiala',      exact: 4, outcome: 9,  wrong: 13, pending: 4, consent: false },
  { name: 'Libor Sedláček',   exact: 5, outcome: 5,  wrong: 16, pending: 4, consent: true },
  // Rank 21
  { name: 'Roman Doležal',    exact: 4, outcome: 8,  wrong: 14, pending: 4, consent: true },
  // Rank 22
  { name: 'Zdeněk Zeman',     exact: 4, outcome: 7,  wrong: 15, pending: 4, consent: false },
  // Rank 23
  { name: 'Karel Kolář',      exact: 4, outcome: 6,  wrong: 16, pending: 4, consent: true },
  // Rank 24-25: tied at 21 pts
  { name: 'Josef Navrátil',   exact: 3, outcome: 9,  wrong: 14, pending: 4, consent: true },
  { name: 'Milan Čermák',     exact: 4, outcome: 5,  wrong: 17, pending: 4, consent: false },
  // Rank 26-27: tied at 20 pts, different exacts
  { name: 'Eva Urbanová',     exact: 3, outcome: 8,  wrong: 15, pending: 4, consent: true },
  { name: 'Jana Vaňková',     exact: 4, outcome: 4,  wrong: 18, pending: 4, consent: true },
  // Rank 28-29: tied at 19 pts (PURE TIE: same exact AND outcome)
  { name: 'Petra Blažková',   exact: 3, outcome: 7,  wrong: 16, pending: 4, consent: false },
  { name: 'Lucie Křížová',    exact: 3, outcome: 7,  wrong: 17, pending: 3, consent: true },
  // Rank 30
  { name: 'Kateřina Kopecká', exact: 3, outcome: 6,  wrong: 17, pending: 4, consent: true },
  // Rank 31-32: tied at 17 pts
  { name: 'Tereza Bartošová', exact: 2, outcome: 9,  wrong: 15, pending: 4, consent: false },
  { name: 'Anna Poláková',    exact: 3, outcome: 5,  wrong: 18, pending: 4, consent: true },
  // Rank 33
  { name: 'Martina Musilová', exact: 3, outcome: 4,  wrong: 19, pending: 4, consent: true },
  // Rank 34-35: tied at 15 pts
  { name: 'Veronika Šimková', exact: 2, outcome: 7,  wrong: 17, pending: 4, consent: false },
  { name: 'Michaela Burešová',exact: 3, outcome: 3,  wrong: 20, pending: 4, consent: true },
  // Rank 36
  { name: 'Hana Holubová',    exact: 2, outcome: 6,  wrong: 18, pending: 4, consent: true },
  // Rank 37-38: tied at 13 pts (PURE TIE)
  { name: 'Monika Marešová',  exact: 2, outcome: 5,  wrong: 19, pending: 4, consent: false },
  { name: 'Zuzana Rybová',    exact: 2, outcome: 5,  wrong: 20, pending: 3, consent: true },
  // Rank 39-40: tied at 12 pts, different exacts
  { name: 'Barbora Straková', exact: 1, outcome: 8,  wrong: 17, pending: 4, consent: true },
  { name: 'Alena Máchalová',  exact: 2, outcome: 4,  wrong: 20, pending: 4, consent: false },
  // Rank 41-42: tied at 11 pts
  { name: 'Jitka Hrušková',   exact: 1, outcome: 7,  wrong: 18, pending: 4, consent: true },
  { name: 'Klára Kadlecová',  exact: 2, outcome: 3,  wrong: 21, pending: 4, consent: true },
  // Rank 43-44: tied at 10 pts
  { name: 'Helena Vlčková',   exact: 1, outcome: 6,  wrong: 19, pending: 4, consent: false },
  { name: 'Simona Langerová', exact: 2, outcome: 2,  wrong: 22, pending: 4, consent: true },
  // Rank 45
  { name: 'Iveta Vrbová',     exact: 1, outcome: 5,  wrong: 20, pending: 4, consent: true },
  // Rank 46-47: tied at 8 pts, one with 0 exacts
  { name: 'Oldřich Tichý',    exact: 1, outcome: 4,  wrong: 21, pending: 4, consent: false },
  { name: 'Bohumil Mlejnek',  exact: 0, outcome: 8,  wrong: 18, pending: 4, consent: true },
  // Rank 48
  { name: 'Vojtěch Říha',     exact: 1, outcome: 3,  wrong: 22, pending: 4, consent: true },
  // Rank 49
  { name: 'Dana Kuběnová',    exact: 1, outcome: 2,  wrong: 23, pending: 4, consent: false },
  // Rank 50-51: tied at 5 pts, one with 0 exacts
  { name: 'Renata Kvasničková', exact: 0, outcome: 5, wrong: 21, pending: 4, consent: true },
  { name: 'Ivan Čapek',       exact: 1, outcome: 1,  wrong: 24, pending: 4, consent: true },
  // Rank 52
  { name: 'Svatopluk Bednář', exact: 0, outcome: 4,  wrong: 22, pending: 4, consent: false },
  // Rank 53
  { name: 'Eliška Vondráková',exact: 0, outcome: 3,  wrong: 23, pending: 4, consent: true },
  // Rank 54
  { name: 'Magdalena Skálová',exact: 0, outcome: 2,  wrong: 24, pending: 4, consent: true },
  // Rank 55: zero-points user (still has tips, just all wrong + pending)
  { name: 'Gustav Sklenář',   exact: 0, outcome: 0,  wrong: 26, pending: 4, consent: false },
];

function generateShareToken(name: string, idx: number): string {
  const slug = slugify(name) || 'sim';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let hash = '';
  for (let i = 0; i < 6; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${slug}-sim${idx.toString().padStart(2, '0')}-${hash}`;
}

export async function POST() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const matchRows = await query<{ id: number }>(`SELECT id FROM match ORDER BY id`);
    const matchIds = matchRows.map((r) => r.id);
    if (matchIds.length === 0) {
      return NextResponse.json(
        { error: 'No matches in DB — cannot generate tips.' },
        { status: 400 },
      );
    }

    // Wipe existing pick'em data
    await query(`DELETE FROM tip`);
    await query(`DELETE FROM tipster_user`);

    let usersInserted = 0;
    let tipsInserted = 0;

    for (let i = 0; i < PROFILES.length; i++) {
      const p = PROFILES[i];
      const email = `${slugify(p.name)}-sim${i + 1}@sim.test`;
      const token = generateShareToken(p.name, i + 1);

      const userRow = await query<{ id: number }>(
        `INSERT INTO tipster_user (email, name, image, share_token, tips_public)
         VALUES ($1, $2, '', $3, $4)
         RETURNING id`,
        [email, p.name, token, p.consent],
      );
      const userId = userRow[0].id;
      usersInserted++;

      const needed = p.exact + p.outcome + p.wrong + p.pending;
      if (needed > matchIds.length) {
        throw new Error(
          `Profile ${p.name} needs ${needed} matches but DB only has ${matchIds.length}.`,
        );
      }

      // Assign match slots per bucket. Tips are dummy (1:1) — only `points` matters.
      const buckets: Array<[number, number | null]> = [
        ...Array(p.exact).fill([0, 4]) as Array<[number, number]>,
        ...Array(p.outcome).fill([0, 1]) as Array<[number, number]>,
        ...Array(p.wrong).fill([0, 0]) as Array<[number, number]>,
        ...Array(p.pending).fill([0, null]) as Array<[number, null]>,
      ];

      for (let j = 0; j < buckets.length; j++) {
        const matchId = matchIds[j];
        const points = buckets[j][1];
        await query(
          `INSERT INTO tip (user_id, match_id, home_goals, away_goals, points)
           VALUES ($1, $2, 1, 1, $3)`,
          [userId, matchId, points],
        );
        tipsInserted++;
      }
    }

    revalidateTag(LEADERBOARD_TAG, 'max');

    return NextResponse.json({
      success: true,
      usersInserted,
      tipsInserted,
      withConsent: PROFILES.filter((p) => p.consent).length,
      withoutConsent: PROFILES.filter((p) => !p.consent).length,
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/simulate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
