'use client';

import { useState } from 'react';
import FeedbackWidget from './FeedbackWidget';

const PAYPAL_BUTTON_ID = 'KL6HYXE53XDTG';

export default function Footer() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <footer className="site-footer">
        <div className="container">
          <p className="footer-brand">
            Knockouts.in &mdash; FIFA World Cup 2026 Tracker
          </p>
          <p className="footer-subtitle">
            Canada, Mexico &amp; USA &bull; June 11 &ndash; July 19, 2026
          </p>
          <nav className="footer-links">
            <a href="/worldcup2026/fixtures">
              Fixtures
            </a>
            <span className="footer-sep">&middot;</span>
            <a href="/worldcup2026/how-to-clinch-play-off-worldcup2026">
              How to Clinch a Play-Off Spot
            </a>
            <span className="footer-sep">&middot;</span>
            <a href="/worldcup2026/fifa-ranking">
              FIFA Ranking
            </a>
            <span className="footer-sep">&middot;</span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setFeedbackOpen(true);
              }}
            >
              Feedback
            </a>
            <span className="footer-sep">&middot;</span>
            <form
              action="https://www.paypal.com/donate"
              method="post"
              target="_blank"
              className="footer-donate-form"
            >
              <input type="hidden" name="hosted_button_id" value={PAYPAL_BUTTON_ID} />
              <button type="submit" className="footer-donate-btn" title="Support us via PayPal">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: 4, verticalAlign: '-1px' }}>
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H9.56c-.525 0-.963.38-1.045.9l-1.44 7.106zm7.834-15.33c-.193 0-.378.15-.41.348l-.478 2.453c-.032.197.098.348.29.348h.598c1.43 0 2.683-.29 3.227-1.852.2-.574.235-1.058.065-1.39-.2-.39-.728-.606-1.56-.606h-1.732z" />
                </svg>
                Donate
              </button>
            </form>
          </nav>
        </div>
      </footer>

      <FeedbackWidget open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
