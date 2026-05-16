import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function NotificationsRedirect() {
  redirect('/pickem/tips?tab=settings');
}
