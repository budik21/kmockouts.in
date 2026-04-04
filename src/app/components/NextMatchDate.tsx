'use client';

interface NextMatchDateProps {
  kickOff: string;
  venue: string;
}

export default function NextMatchDate({ kickOff, venue }: NextMatchDateProps) {
  const d = new Date(kickOff);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <span>
      {date}, {time} · {venue}
    </span>
  );
}
