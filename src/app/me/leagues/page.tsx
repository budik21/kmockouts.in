import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { createInviteHash } from '@/lib/league-hash';
import LeaguesView, { type LeagueListItem } from './LeaguesView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tipping leagues — Knockouts.in',
  robots: { index: false, follow: false },
};

interface OwnedRow {
  code: string;
  name: string;
  member_count: string;
  created_at: string;
}

interface MemberRow {
  code: string;
  name: string;
  member_count: string;
  owner_name: string;
  joined_at: string;
}

export default async function LeaguesPage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  if (!session?.tipsterId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent('/me/leagues')}`);
  }

  const myUserId = session.tipsterId;

  // Leagues owned by me — every league I own (regardless of membership row).
  const ownedRows = await query<OwnedRow>(
    `SELECT l.code, l.name,
            (SELECT COUNT(*) FROM pickem_league_member m WHERE m.league_id = l.id)::text AS member_count,
            l.created_at::text AS created_at
       FROM pickem_league l
      WHERE l.owner_user_id = $1
      ORDER BY l.created_at DESC`,
    [myUserId],
  );

  // Leagues where I'm a member (includes ones I own — per design, owner sees
  // their own league in both tabs).
  const memberRows = await query<MemberRow>(
    `SELECT l.code, l.name,
            (SELECT COUNT(*) FROM pickem_league_member m2 WHERE m2.league_id = l.id)::text AS member_count,
            owner.name AS owner_name,
            m.joined_at::text AS joined_at
       FROM pickem_league_member m
       JOIN pickem_league l ON l.id = m.league_id
       JOIN tipster_user owner ON owner.id = l.owner_user_id
      WHERE m.user_id = $1
      ORDER BY m.joined_at DESC`,
    [myUserId],
  );

  const myLeagues: LeagueListItem[] = ownedRows.map((r) => ({
    code: r.code,
    name: r.name,
    memberCount: parseInt(r.member_count, 10),
    inviteHash: createInviteHash(r.code, r.name),
    isOwner: true,
  }));

  const participating: LeagueListItem[] = memberRows.map((r) => ({
    code: r.code,
    name: r.name,
    memberCount: parseInt(r.member_count, 10),
    ownerName: r.owner_name,
    isOwner: false,
  }));

  return (
    <main className="container py-4">
      <p className="mb-2">
        <Link href="/me" className="text-decoration-none">← Back to profile</Link>
      </p>
      <h1 className="mb-2">Tipping leagues</h1>
      <p className="text-muted mb-4">
        Create your own private leagues with friends, or join one with a 6-character code.
        Your tips count once and are scored in every league you&apos;re part of.
      </p>
      <LeaguesView
        myLeagues={myLeagues}
        participating={participating}
        isAdmin={!!session.isAdmin}
      />
    </main>
  );
}
