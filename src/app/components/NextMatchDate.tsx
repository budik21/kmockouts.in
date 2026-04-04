'use client';

interface NextMatchDateProps {
  kickOff: string;
  venue: string;
}

function daysLabel(kickOff: string): string {
  const now = new Date();
  const match = new Date(kickOff);
  // Compare calendar dates in user's local timezone
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchStart = new Date(match.getFullYear(), match.getMonth(), match.getDate());
  const diffDays = Math.round((matchStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1) return `in ${diffDays} days`;
  return '';
}

export default function NextMatchDate({ kickOff, venue }: NextMatchDateProps) {
  const d = new Date(kickOff);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const countdown = daysLabel(kickOff);

  return (
    <span>
      {date}, {time} · {venue}{countdown && ` (${countdown})`}
    </span>
  );
}
