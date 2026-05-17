'use client';

import { useEffect, useState } from 'react';

interface ArticleTimestampProps {
  /** ISO 8601 timestamp from `ai_*_article_cache.created_at`. */
  generatedAt: string;
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/**
 * Renders the date+time an AI article was last generated, formatted in the
 * visitor's local timezone. Runs client-side so `toLocaleString` picks up the
 * browser's IANA zone rather than the server's; before hydration we render a
 * UTC fallback so search engines and copy-paste have a readable value too.
 */
export default function ArticleTimestamp({ generatedAt }: ArticleTimestampProps) {
  const [formatted, setFormatted] = useState<string>(() => {
    const d = new Date(generatedAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  });

  useEffect(() => {
    setFormatted(formatLocal(generatedAt));
  }, [generatedAt]);

  if (!formatted) return null;

  return (
    <div
      className="text-muted"
      style={{ fontSize: '0.8rem', textAlign: 'right', marginTop: '-0.5rem', marginBottom: '1rem' }}
    >
      AI prediction generated {formatted}
    </div>
  );
}
