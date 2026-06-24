import { SITE_URL } from '@/lib/seo';

export interface PlayoffAdminRecap {
  matchNumber: number;
  roundLabel: string;
  homeTeam: string;
  awayTeam: string;
  status: string;                 // SCHEDULED | FINISHED
  cleared: boolean;               // result was wiped (back to SCHEDULED)
  ninety: string | null;          // "2–1"
  extra: string | null;           // "AET 3–2 · pens 5–4"
  advancing: string | null;
  recalc: { tips: number; picks: number };
  leagueStandingsRefreshed: boolean;
  /** Post-final TOP-4 recap e-mails sent (only on the 3rd-place match / final). */
  top4Emails?: number;
  emails: {
    total: number; sent: number; skipped: number; disabled: number; failed: number;
    recipients: { email: string; outcome: string; reason?: string }[];
  };
  cache: { tags: string[]; cloudflarePurged: boolean; cloudflareError?: string };
  errors: string[];
  durationMs: number;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Diagnostic recap e-mail sent to the superadmin after each play-off result. */
export function buildPlayoffAdminRecapEmail(r: PlayoffAdminRecap): { subject: string; html: string } {
  const resultStr = r.cleared
    ? 'result cleared'
    : [r.ninety, r.extra].filter(Boolean).join(' · ') || '(no score)';
  const subject = r.cleared
    ? `[Play-off] #${r.matchNumber} ${r.homeTeam}–${r.awayTeam} — result cleared`
    : `[Play-off] #${r.matchNumber} ${r.homeTeam} ${r.ninety ?? '?'} ${r.awayTeam}`
      + `${r.advancing ? ` → ${r.advancing}` : ''} · ${r.emails.sent} e-mail(s)`;

  const row = (k: string, v: string) =>
    `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:3px 0;color:#111827;">${v}</td></tr>`;

  const recipientRows = r.emails.recipients.length
    ? r.emails.recipients.map((x) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#374151;">${esc(x.email)}</td>`
        + `<td style="padding:2px 0;color:${x.outcome === 'sent' ? '#1f7a43' : x.outcome === 'failed' ? '#c0392b' : '#6b7280'};">`
        + `${esc(x.outcome)}${x.reason ? ` — ${esc(x.reason)}` : ''}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:2px 0;color:#6b7280;">none</td></tr>`;

  const errorsBlock = r.errors.length
    ? `<div style="margin-top:14px;padding:10px 12px;background:#fdecea;border:1px solid #f5c6cb;border-radius:8px;color:#922;">
         <strong>Errors:</strong><ul style="margin:6px 0 0;padding-left:18px;">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
       </div>`
    : '';

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;font-size:14px;">
    <h2 style="margin:0 0 2px;">Play-off result entered</h2>
    <div style="color:#6b7280;margin-bottom:14px;">${esc(r.roundLabel)} · match #${r.matchNumber} · ${r.durationMs} ms</div>

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row('Match', `${esc(r.homeTeam)} vs ${esc(r.awayTeam)}`)}
      ${row('Status', esc(r.status))}
      ${row('Result', esc(resultStr))}
      ${row('Advancing', r.advancing ? `<strong>${esc(r.advancing)}</strong>` : '—')}
    </table>

    <h3 style="margin:18px 0 6px;">Follow-up actions</h3>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row('Bracket', 'recomputed — participants &amp; advancing propagated')}
      ${row('Tips rescored', `${r.recalc.tips} knockout tip(s) changed`)}
      ${row('Top-4 picks rescored', `${r.recalc.picks} pick(s) changed`)}
      ${row('League standings', r.leagueStandingsRefreshed ? 'refreshed' : 'skipped')}
      ${row('AI generation', 'not used (play-off has no AI step)')}
      ${row('E-mails', `${r.emails.sent} sent · ${r.emails.skipped} skipped (opted out) · ${r.emails.failed} failed · ${r.emails.disabled} disabled`)}
      ${r.top4Emails != null ? row('Top-4 recap e-mails', `${r.top4Emails} sent`) : ''}
      ${row('Cache', `tags: ${esc(r.cache.tags.join(', '))} · Cloudflare: ${r.cache.cloudflarePurged ? 'purged' : `failed (${esc(r.cache.cloudflareError ?? 'error')})`}`)}
    </table>

    <h3 style="margin:18px 0 6px;">E-mail recipients (${r.emails.total})</h3>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${recipientRows}</table>

    ${errorsBlock}

    <p style="margin-top:18px;color:#6b7280;font-size:12px;">
      <a href="${SITE_URL}/pickem/leaderboard" style="color:#6f003c;">Leaderboard</a> ·
      <a href="${SITE_URL}/admin?tab=knockout" style="color:#6f003c;">Admin · Play-off</a>
    </p>
  </div>`;

  return { subject, html };
}
