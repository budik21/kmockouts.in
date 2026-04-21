import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LandingPage from './components/LandingPage';

export default async function PredictionsPage() {
  let session;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  // Already logged in — go to tips
  if (session?.tipsterId) {
    redirect('/pickem/tips');
  }

  return <LandingPage />;
}
