/**
 * Sends the diagnostic summary e-mail after a match-update cascade completes.
 *
 * Designed to be called as the LAST step of the admin route, after AI
 * generation + tip recalc + cache invalidation have all completed. The
 * trace argument holds every prompt, structured input, and Claude response
 * captured along the way.
 *
 * Always swallows its own errors — a failure to send the diagnostic e-mail
 * must not roll back any user-visible state.
 */

import { Resend } from 'resend';
import { SUPERADMIN_EMAIL } from './superadmin';
import { buildAdminMatchSummaryEmail } from './email-templates/admin-match-summary';
import type { MatchUpdateTrace } from './match-update-trace';

/**
 * Cap on how long we wait for Resend to acknowledge the send. The admin
 * request is already at the tail end of its budget by the time we get here;
 * a stuck Resend connection must not be the thing that lets the platform
 * SIGTERM us before we reply.
 */
const SEND_TIMEOUT_MS = 15_000;

export async function sendAdminMatchSummary(trace: MatchUpdateTrace): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[admin-summary] RESEND_API_KEY missing — skipping superadmin summary e-mail');
    return;
  }

  try {
    const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';
    const { subject, html } = buildAdminMatchSummaryEmail(trace);
    const resend = new Resend(apiKey);
    await Promise.race([
      resend.emails.send({ from, to: SUPERADMIN_EMAIL, subject, html }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Resend send timed out after ${SEND_TIMEOUT_MS}ms`)),
          SEND_TIMEOUT_MS,
        ),
      ),
    ]);
    console.log(`[admin-summary] Sent diagnostic e-mail to ${SUPERADMIN_EMAIL}`);
  } catch (err) {
    console.error('[admin-summary] Failed to send diagnostic e-mail:', err);
  }
}
