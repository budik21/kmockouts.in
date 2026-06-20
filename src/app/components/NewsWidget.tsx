'use client';

interface Article {
  title: string;
  url: string;
  imageUrl: string;
  publishedAt: string | null;
}

interface NewsWidgetProps {
  articles: Article[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Fixed locale + timezone so the SSR and client render produce identical
  // text — `undefined` locale / the runtime timezone differ between the Node
  // server (en/UTC) and the visitor's browser, which trips a hydration
  // mismatch (React #418). en-GB matches the app's date convention (see
  // LocalKickOff).
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function NewsWidget({ articles }: NewsWidgetProps) {
  if (articles.length === 0) return null;

  return (
    <div className="news-widget mb-3">
      {articles.map((article) => (
        <a
          key={article.url}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="news-card"
        >
          {article.imageUrl ? (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="news-card-img"
              loading="lazy"
            />
          ) : (
            <span className="news-card-placeholder">&#9917;</span>
          )}
          <div className="news-card-body">
            <span className="news-card-title">{article.title}</span>
            <span className="news-card-meta">
              Flashscore News{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ''}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
