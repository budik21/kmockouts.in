import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FEEDBACK_NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL; // e.g. radek.budar@gmail.com

/**
 * POST /api/feedback
 * Saves user feedback to the database and sends an email notification via Resend.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, message, pageUrl } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    if (message.trim().length > 5000) {
      return NextResponse.json({ error: 'Message is too long (max 5000 characters).' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? '';

    // Save to database
    await query(
      `INSERT INTO feedback (user_name, user_email, message, page_url, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        (name ?? '').slice(0, 255),
        (email ?? '').slice(0, 255),
        message.trim(),
        (pageUrl ?? '').slice(0, 500),
        userAgent.slice(0, 500),
      ]
    );

    // Send email notification (fire-and-forget)
    if (RESEND_API_KEY && FEEDBACK_NOTIFY_EMAIL) {
      sendEmailNotification({
        name: name ?? '',
        email: email ?? '',
        message: message.trim(),
        pageUrl: pageUrl ?? '',
      }).catch((err) => console.error('Email notification failed:', err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback save error:', error);
    return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }
}

/**
 * Send an email notification via Resend.
 *
 * Setup:
 * 1. Sign up at https://resend.com (free: 100 emails/day)
 * 2. Create an API key
 * 3. Set env vars: RESEND_API_KEY, FEEDBACK_NOTIFY_EMAIL
 * 4. (Optional) Verify your domain for custom "from" address
 *    — without a verified domain, use "onboarding@resend.dev"
 */
async function sendEmailNotification(data: {
  name: string;
  email: string;
  message: string;
  pageUrl: string;
}) {
  if (!RESEND_API_KEY || !FEEDBACK_NOTIFY_EMAIL) return;

  const resend = new Resend(RESEND_API_KEY);

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';

  await resend.emails.send({
    from: fromAddress,
    to: FEEDBACK_NOTIFY_EMAIL,
    subject: `New Feedback on Knockouts.in${data.name ? ` from ${data.name}` : ''}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px;">
        <h2 style="color: #6f003c; border-bottom: 2px solid #6f003c; padding-bottom: 8px;">
          New Feedback Received
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          ${data.name ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #555; width: 80px;">Name</td><td style="padding: 6px 12px;">${escapeHtml(data.name)}</td></tr>` : ''}
          ${data.email ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #555;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>` : ''}
          ${data.pageUrl ? `<tr><td style="padding: 6px 12px; font-weight: 600; color: #555;">Page</td><td style="padding: 6px 12px;"><a href="${escapeHtml(data.pageUrl)}">${escapeHtml(data.pageUrl)}</a></td></tr>` : ''}
        </table>
        <div style="background: #f8f9fa; border-left: 4px solid #6f003c; padding: 12px 16px; border-radius: 4px; white-space: pre-wrap;">
          ${escapeHtml(data.message)}
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 16px;">
          Sent from Knockouts.in feedback form at ${new Date().toISOString()}
        </p>
      </div>
    `,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
