import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { query } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin-auth';
import { LEADERBOARD_TAG } from '@/lib/cache-tags';
import { purgeCloudflareCache } from '@/lib/cloudflare-purge';
import { slugify } from '@/lib/slugify';

/**
 * Fill the pick'em tables with 130 fake tipsters + random tips.
 *
 * Destructive: wipes `tip` and `tipster_user` before inserting.
 * Tipsters are created with completely random tips (goals 0-3 for each team).
 * No points are calculated - all tipsters start with 0 points in the leaderboard.
 * Points will be NULL on all tips, can be calculated later via recalculate action.
 */

// 130 exotic names for test tipsters
const NAMES = [
  'Akira Tanaka', 'Björn Eriksson', 'Chiara Rossini', 'Dmitri Volkov', 'Elena Müller',
  'Fatima Al-Rashid', 'Giovanni Bianchi', 'Hanna Kowalski', 'Ivan Petrović', 'Jasmine Chen',
  'Kenji Yamamoto', 'Lucia González', 'Marco Rossi', 'Naomi Adeyemi', 'Oleg Sokolov',
  'Pilar Hernández', 'Qi Wang', 'Ravi Patel', 'Sofia Novak', 'Thiago Santos',
  'Umer Khan', 'Valentina Popov', 'Wilfried Dupont', 'Xiaoming Liu', 'Yuki Nakamura',
  'Zainab Hassan', 'Andres Moreno', 'Bridget O\'Connor', 'Carlos Mendez', 'Diana Kovács',
  'Espen Andersen', 'Francesca Martinelli', 'Gunnar Sævarsson', 'Hideo Kojima', 'Iris Mueller',
  'Javier Alonso', 'Karim Benzema', 'Lena Gustafsson', 'Mustafa Al-Ali', 'Nadia Kovalenko',
  'Oskar Bergmann', 'Priya Sharma', 'Quincy Johnson', 'Roberto Ferreira', 'Samantha Klein',
  'Tariq Mohammed', 'Ulla Lindström', 'Viktor Novikov', 'Wanda Kowalski', 'Xander Blom',
  'Yasmin Faraji', 'Ziggy van der Berg', 'Alejandro Ruiz', 'Beatrice Marchetti', 'Casper Nielsen',
  'Dagmar Hoffmann', 'Emir Demir', 'Freja Johansen', 'Giacomo Colombo', 'Hedwig Schulz',
  'Iman Al-Mazrouei', 'Jens Larsen', 'Katrina Ivanova', 'Leonardo da Silva', 'Mariana Delgado',
  'Niels Hansen', 'Olaf Johansen', 'Parvez Ahmad', 'Qasim Al-Zahra', 'Rene Fontaine',
  'Siobhan O\'Brien', 'Torsten Bergström', 'Usha Gupta', 'Valerie Marchand', 'Werner Schulz',
  'Xenia Papadopoulou', 'Youssef Ben Ali', 'Zelda Friedman', 'Alvaro Castillo', 'Breanna Walsh',
  'Cristian Dragomir', 'Dorthe Andersen', 'Esteban Ruiz', 'Faisal Al-Harbi', 'Giselle Laurent',
  'Hamid Rezaei', 'Ingrid Bergman', 'Jamal Washington', 'Katrin Müller', 'Leonardo Moretti',
  'Marta Kowalczyk', 'Nihat Yilmaz', 'Olivia Chen', 'Pablo Sanchez', 'Radwa Khalil',
  'Svend Johansen', 'Tuğrul Demir', 'Urszula Nowak', 'Vesna Marković', 'Wendell Brown',
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

    for (let i = 0; i < NAMES.length; i++) {
      const name = NAMES[i];
      const email = `${slugify(name)}-sim${i + 1}@sim.test`;
      const token = generateShareToken(name, i + 1);
      // Random consent: ~70% consent, ~30% no consent
      const consent = Math.random() < 0.7;

      const userRow = await query<{ id: number }>(
        `INSERT INTO tipster_user (email, name, image, share_token, tips_public)
         VALUES ($1, $2, '', $3, $4)
         RETURNING id`,
        [email, name, token, consent],
      );
      const userId = userRow[0].id;
      usersInserted++;

      // Create random tips for each match (all with points = NULL, no scoring)
      for (const matchId of matchIds) {
        const homeGoals = Math.floor(Math.random() * 4); // 0-3
        const awayGoals = Math.floor(Math.random() * 4); // 0-3
        await query(
          `INSERT INTO tip (user_id, match_id, home_goals, away_goals, points)
           VALUES ($1, $2, $3, $4, NULL)`,
          [userId, matchId, homeGoals, awayGoals],
        );
        tipsInserted++;
      }
    }

    revalidateTag(LEADERBOARD_TAG, 'max');
    await purgeCloudflareCache();

    const withConsent = Math.round(NAMES.length * 0.7);
    const withoutConsent = NAMES.length - withConsent;

    return NextResponse.json({
      success: true,
      usersInserted,
      tipsInserted,
      withConsent,
      withoutConsent,
    });
  } catch (err) {
    console.error('POST /api/admin/pickem/simulate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
