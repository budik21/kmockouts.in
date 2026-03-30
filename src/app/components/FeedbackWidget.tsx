'use client';

import { useState, useCallback, useRef } from 'react';

type FeedbackState = 'idle' | 'sending' | 'success' | 'error';

const SEND_TIMEOUT_MS = 10_000;

interface FeedbackWidgetProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackWidget({ open, onClose }: FeedbackWidgetProps) {
  const [state, setState] = useState<FeedbackState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const message = messageRef.current?.value.trim() ?? '';
    if (!message) return;

    setState('sending');
    setErrorMsg('');

    // AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameRef.current?.value ?? '',
          email: emailRef.current?.value ?? '',
          message,
          pageUrl: window.location.href,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong');
      }

      setState('success');
      if (nameRef.current) nameRef.current.value = '';
      if (emailRef.current) emailRef.current.value = '';
      if (messageRef.current) messageRef.current.value = '';

      // Auto-close after showing success (4s so user clearly sees it)
      setTimeout(() => {
        onClose();
        setTimeout(() => setState('idle'), 300);
      }, 4000);
    } catch (err) {
      clearTimeout(timeout);
      setState('error');
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('Something went wrong with your feedback. Please try again later.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong with your feedback. Please try again later.');
      }
    }
  }, [onClose]);

  const handleClose = useCallback(() => {
    onClose();
    if (state === 'success' || state === 'error') {
      setTimeout(() => setState('idle'), 300);
    }
  }, [state, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && <div className="feedback-backdrop" onClick={handleClose} />}

      {/* Slide-out panel */}
      <div className={`feedback-panel ${open ? 'feedback-panel-open' : ''}`}>
        <div className="feedback-panel-header">
          <span className="feedback-panel-title">Send Feedback</span>
          <button type="button" className="feedback-panel-close" onClick={handleClose} aria-label="Close">
            &times;
          </button>
        </div>

        {state === 'success' ? (
          <div className="feedback-panel-body feedback-panel-body-success">
            <div className="feedback-success">
              <div className="feedback-success-icon">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p className="feedback-success-text">Thank you!</p>
              <p className="feedback-success-sub">Your feedback has been sent successfully. We appreciate you taking the time to help us improve.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-panel-body">
            <p className="feedback-intro">
              Found a bug, have a suggestion, or just want to say hi? We&apos;d love to hear from you.
            </p>

            <div className="feedback-field">
              <label htmlFor="feedback-name">Name <span className="text-muted">(optional)</span></label>
              <input
                ref={nameRef}
                id="feedback-name"
                type="text"
                className="form-control form-control-sm"
                placeholder="Your name"
                maxLength={255}
                disabled={state === 'sending'}
              />
            </div>

            <div className="feedback-field">
              <label htmlFor="feedback-email">Email <span className="text-muted">(optional)</span></label>
              <input
                ref={emailRef}
                id="feedback-email"
                type="email"
                className="form-control form-control-sm"
                placeholder="your@email.com"
                maxLength={255}
                disabled={state === 'sending'}
              />
            </div>

            <div className="feedback-field">
              <label htmlFor="feedback-message">Message <span className="text-danger">*</span></label>
              <textarea
                ref={messageRef}
                id="feedback-message"
                className="form-control form-control-sm"
                placeholder="Tell us what you think..."
                rows={4}
                maxLength={5000}
                required
                disabled={state === 'sending'}
              />
            </div>

            {state === 'error' && (
              <div className="feedback-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="#dc3545" style={{ flexShrink: 0 }}>
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3v1h-1v3h1v1h-3v-1h1V8h-1V7z"/>
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-sm feedback-submit-btn"
              disabled={state === 'sending'}
            >
              {state === 'sending' ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" />
                  Sending...
                </>
              ) : (
                'Send Feedback'
              )}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
