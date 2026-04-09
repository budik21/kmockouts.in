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
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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
