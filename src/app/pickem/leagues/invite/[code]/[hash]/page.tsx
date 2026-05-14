import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { isValidLeagueCode, normalizeLeagueCode } from '@/lib/league-code';
import { isValidInviteHashFormat, verifyInviteHash } from '@/lib/league-hash';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import InviteConfirm from './InviteConfirm';
import InviteSignIn from './InviteSignIn';
import InviteAlreadyMember from './InviteAlreadyMember';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ code: string; hash: string }>;
}

export const metadata: Metadata = {
  title: 'League invite — Knockouts.in',
  robots: { index: false, follow: false },
};

interface LeagueDb {
  id: number;
  name: string;
  owner_name: string;
}

export default async function InvitePage({ params }: Props) {
  const { code: rawCode, hash: rawHash } = await params;
  const code = normalizeLeagueCode(rawCode);
  const hash = rawHash.toLowerCase();

  if (!isValidLeagueCode(code) || !isValidInviteHashFormat(hash)) notFound();

  const league = await queryOne<LeagueDb>(
    `SELECT l.id, l.name, owner.name AS owner_name
       FROM pickem_league l
       JOIN tipster_user owner ON owner.id = l.owner_user_id
      WHERE l.code = $1`,
    [code],
  );
  if (!league) notFound();

  if (!verifyInviteHash(code, league.name, hash)) notFound();

  const session = await auth().catch(() => null);

  // Not signed in: prompt Google login, then bounce back to this URL.
  if (!session?.tipsterId) {
    return (
      <main className="container py-5">
        <InviteSignIn
          leagueName={league.name}
          ownerName={league.owner_name}
          callbackUrl={`/pickem/leagues/invite/${code}/${hash}`}
        />
      </main>
    );
  }

  // Already a member?
  const existing = await queryOne<{ user_id: number }>(
    'SELECT user_id FROM pickem_league_member WHERE league_id = $1 AND user_id = $2',
    [league.id, session.tipsterId],
  );
  if (existing) {
    return (
      <main className="container py-5">
        <InviteAlreadyMember code={code} leagueName={league.name} />
      </main>
    );
  }

  return (
    <main className="container py-5">
      <InviteConfirm
        code={code}
        hash={hash}
        leagueName={league.name}
        ownerName={league.owner_name}
      />
    </main>
  );
}
