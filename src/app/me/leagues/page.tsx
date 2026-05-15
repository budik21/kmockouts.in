import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function MeLeaguesRedirectPage() {
  redirect('/pickem/tips?tab=leagues');
}
