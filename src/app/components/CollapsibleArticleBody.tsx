'use client';

import { useState } from 'react';

interface Props {
  html: string;
}

/**
 * Renders the article body. On mobile (CSS-controlled via the
 * `.group-article-body` rules in globals.css) only the first two paragraphs
 * are visible until the user expands. On desktop everything is shown
 * regardless and the toggle button is hidden.
 */
export default function CollapsibleArticleBody({ html }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={`group-article-body${expanded ? ' is-expanded' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        className="group-article-readmore"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Read less' : 'Read more…'}
      </button>
    </>
  );
}
