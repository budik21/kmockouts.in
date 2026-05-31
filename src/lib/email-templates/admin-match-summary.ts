/**
 * Diagnostic e-mail sent to SUPERADMIN_EMAIL after every match-result update.
 *
 * Purpose: when an AI prediction looks stale on the live site, this e-mail
 * gives a frozen record of EXACTLY what was sent to Claude and what came
 * back, plus the standings/probabilities used. Without it, the only way
 * to debug a "Brazil should be celebrating, why is the article still
 * generic" complaint is to re-run the cascade and hope it repros.
 */

import type { MatchUpdateTrace } from '../match-update-trace';

interface TemplateOutput {
  subject: string;
  html: string;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '–';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function pre(text: string): string {
  return `<pre style="background:#f5f5f7;border:1px solid #e3e3e8;padding:10px;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;border-radius:4px;margin:6px 0 16px;overflow-x:auto;">${esc(text)}</pre>`;
}

function code(text: string): string {
  return `<code style="background:#f5f5f7;padding:1px 5px;border-radius:3px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;">${esc(text)}</code>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b6b73;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:4px 0;vertical-align:top;">${value}</td></tr>`;
}

function section(title: string, body: string): string {
  return `<section style="margin:24px 0;">
  <h2 style="font:600 16px/1.3 -apple-system,Segoe UI,sans-serif;margin:0 0 12px;color:#1a1a1f;border-bottom:1px solid #e3e3e8;padding-bottom:6px;">${esc(title)}</h2>
  ${body}
</section>`;
}

function renderStandings(trace: MatchUpdateTrace): string {
  if (!trace.standingsAfter || trace.standingsAfter.length === 0) {
    return '<p style="color:#9a9aa3;font-style:italic;">(no standings captured)</p>';
  }
  const rows = trace.standingsAfter.map(s => `
    <tr>
      <td style="padding:4px 10px;text-align:center;">${s.position}</td>
      <td style="padding:4px 10px;">${esc(s.teamName)}</td>
      <td style="padding:4px 10px;text-align:center;">${s.played}</td>
      <td style="padding:4px 10px;text-align:center;">${s.won}</td>
      <td style="padding:4px 10px;text-align:center;">${s.drawn}</td>
      <td style="padding:4px 10px;text-align:center;">${s.lost}</td>
      <td style="padding:4px 10px;text-align:center;">${s.gf}:${s.ga}</td>
      <td style="padding:4px 10px;text-align:center;">${s.gd >= 0 ? '+' : ''}${s.gd}</td>
      <td style="padding:4px 10px;text-align:center;font-weight:600;">${s.points}</td>
    </tr>`).join('');
  return `<table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
    <thead>
      <tr style="background:#f5f5f7;">
        <th style="padding:6px 10px;text-align:center;">#</th>
        <th style="padding:6px 10px;text-align:left;">Team</th>
        <th style="padding:6px 10px;">P</th>
        <th style="padding:6px 10px;">W</th>
        <th style="padding:6px 10px;">D</th>
        <th style="padding:6px 10px;">L</th>
        <th style="padding:6px 10px;">GF:GA</th>
        <th style="padding:6px 10px;">GD</th>
        <th style="padding:6px 10px;">Pts</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderProbabilities(trace: MatchUpdateTrace): string {
  if (!trace.probabilities || trace.probabilities.length === 0) return '';
  const rows = trace.probabilities.map(p => `
    <tr>
      <td style="padding:4px 10px;">${esc(p.teamName)}</td>
      <td style="padding:4px 10px;text-align:right;">${p.pPos1.toFixed(1)}%</td>
      <td style="padding:4px 10px;text-align:right;">${p.pPos2.toFixed(1)}%</td>
      <td style="padding:4px 10px;text-align:right;">${p.pPos3.toFixed(1)}%</td>
      <td style="padding:4px 10px;text-align:right;">${p.pPos4.toFixed(1)}%</td>
      <td style="padding:4px 10px;text-align:right;color:#6b6b73;">${p.pThirdQual.toFixed(1)}%</td>
    </tr>`).join('');
  return `<table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;margin-top:8px;">
    <thead>
      <tr style="background:#f5f5f7;">
        <th style="padding:6px 10px;text-align:left;">Team</th>
        <th style="padding:6px 10px;text-align:right;">P(1st)</th>
        <th style="padding:6px 10px;text-align:right;">P(2nd)</th>
        <th style="padding:6px 10px;text-align:right;">P(3rd)</th>
        <th style="padding:6px 10px;text-align:right;">P(4th)</th>
        <th style="padding:6px 10px;text-align:right;color:#6b6b73;">best-3rd</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderScenarioSummaries(trace: MatchUpdateTrace): string {
  if (trace.scenarioSummaries.length === 0) {
    return '<p style="color:#9a9aa3;font-style:italic;">(no scenario summaries captured — group may be fully decided or below the all-teams-played threshold)</p>';
  }
  const byTeam = new Map<string, typeof trace.scenarioSummaries>();
  for (const s of trace.scenarioSummaries) {
    const arr = byTeam.get(s.teamName) ?? [];
    arr.push(s);
    byTeam.set(s.teamName, arr);
  }
  const blocks: string[] = [];
  for (const [teamName, entries] of byTeam) {
    entries.sort((a, b) => a.position - b.position);
    const rows = entries.map(e => `
      <tr>
        <td style="padding:4px 10px;font-weight:600;white-space:nowrap;">${e.position}${posSuffix(e.position)}</td>
        <td style="padding:4px 10px;color:#6b6b73;">${e.probability.toFixed(1)}%</td>
        <td style="padding:4px 10px;color:#6b6b73;">${e.cacheHit ? '<span style="color:#0a7e3b;">cached/100%</span>' : '<span style="color:#0066cc;">AI</span>'}</td>
        <td style="padding:4px 10px;">${e.output}</td>
      </tr>`).join('');
    blocks.push(`
      <div style="margin:12px 0 18px;">
        <h3 style="font:600 14px/1.3 -apple-system,Segoe UI,sans-serif;margin:0 0 6px;color:#1a1a1f;">${esc(teamName)}</h3>
        <table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
          <thead>
            <tr style="background:#f5f5f7;">
              <th style="padding:6px 10px;text-align:left;">Pos</th>
              <th style="padding:6px 10px;text-align:left;">Prob</th>
              <th style="padding:6px 10px;text-align:left;">Source</th>
              <th style="padding:6px 10px;text-align:left;">Summary</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }
  return blocks.join('');
}

function posSuffix(pos: number): string {
  return pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
}

function renderArticleCall(
  label: string,
  call: { cacheHit: boolean; userPrompt?: string; inputData?: unknown; output?: { headline: string; lede: string; body_html: string } | null; error?: string; inputTokens?: number; outputTokens?: number; durationMs?: number; contentHash?: string },
): string {
  const meta: string[] = [];
  meta.push(call.cacheHit ? '<span style="color:#0a7e3b;font-weight:600;">CACHE HIT</span>' : '<span style="color:#0066cc;font-weight:600;">AI GENERATED</span>');
  if (call.durationMs !== undefined) meta.push(fmtMs(call.durationMs));
  if (call.inputTokens !== undefined) meta.push(`${call.inputTokens} in`);
  if (call.outputTokens !== undefined) meta.push(`${call.outputTokens} out`);
  if (call.contentHash) meta.push(`hash=${call.contentHash}`);

  const out = call.output;
  const outHtml = out
    ? `<table style="font:13px/1.5 -apple-system,Segoe UI,sans-serif;width:100%;margin:6px 0;">
        ${row('Headline', `<strong>${esc(out.headline)}</strong>`)}
        ${row('Lede', esc(out.lede))}
        ${row('Body (HTML)', `<div style="background:#fcfcfd;border:1px solid #e3e3e8;padding:10px;border-radius:4px;">${out.body_html}</div>`)}
      </table>`
    : '<p style="color:#c62828;font-style:italic;">(no output — generation failed; old cached article remained on the site)</p>';

  const errHtml = call.error ? `<p style="color:#c62828;"><strong>Error:</strong> ${esc(call.error)}</p>` : '';

  const promptHtml = call.userPrompt
    ? `<details style="margin-top:8px;"><summary style="cursor:pointer;color:#6b6b73;">User prompt sent to Claude (${call.userPrompt.length} chars)</summary>${pre(call.userPrompt)}</details>`
    : '';

  // The raw structured input (ctx) is intentionally NOT rendered: it is never
  // sent to the API (only `userPrompt` is), and dumping the full context — with
  // the unstripped scenario HTML — just bloated the e-mail and was misleading.

  return `<div style="margin:8px 0 20px;">
    <h3 style="font:600 14px/1.3 -apple-system,Segoe UI,sans-serif;margin:0 0 6px;color:#1a1a1f;">${esc(label)} <span style="font-weight:400;color:#6b6b73;font-size:12px;">${meta.join(' · ')}</span></h3>
    ${errHtml}
    ${outHtml}
    ${promptHtml}
  </div>`;
}

function renderTipTransitions(trace: MatchUpdateTrace): string {
  if (!trace.tipTransitions || trace.tipTransitions.length === 0) {
    return '<p style="color:#9a9aa3;font-style:italic;">(no tips changed — no e-mails queued)</p>';
  }
  const rows = trace.tipTransitions.map(t => {
    const points = t.newPoints === 4 ? '4 (exact)' : t.newPoints === 1 ? '1 (winner)' : t.newPoints === 0 ? '0 (miss)' : `${t.newPoints}`;
    return `<tr>
      <td style="padding:4px 10px;">${esc(t.userName)}</td>
      <td style="padding:4px 10px;color:#6b6b73;">${esc(t.userEmail)}</td>
      <td style="padding:4px 10px;">${esc(t.matchLabel)}</td>
      <td style="padding:4px 10px;text-align:center;">${esc(t.tipScore)}</td>
      <td style="padding:4px 10px;text-align:center;color:#6b6b73;">${t.oldPoints ?? '–'}</td>
      <td style="padding:4px 10px;text-align:center;font-weight:600;">${points}</td>
    </tr>`;
  }).join('');
  return `
    <p style="color:#6b6b73;margin:0 0 8px;">${trace.tipEmailsQueued ?? 0} e-mail(s) eligible for delivery (newly-scored tips). See dispatch outcomes below.</p>
    <table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
      <thead>
        <tr style="background:#f5f5f7;">
          <th style="padding:6px 10px;text-align:left;">User</th>
          <th style="padding:6px 10px;text-align:left;">E-mail</th>
          <th style="padding:6px 10px;text-align:left;">Match</th>
          <th style="padding:6px 10px;">Tip</th>
          <th style="padding:6px 10px;">Old pts</th>
          <th style="padding:6px 10px;">New pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderTipEmailDispatch(trace: MatchUpdateTrace): string {
  const deferredNote = trace.tipEmailsDeferred
    ? `<p style="color:#b35900;margin-top:14px;font-weight:600;">⏳ ${trace.tipEmailsDeferred} tip e-mail(s) deferred — the match's team articles aren't generated yet; they will send on a later pass once the articles exist.</p>`
    : '';
  const dispatch = trace.tipEmailDispatch;
  if (!dispatch || dispatch.length === 0) {
    return deferredNote || '<p style="color:#9a9aa3;font-style:italic;margin-top:14px;">(no tip-result e-mails dispatched)</p>';
  }
  const colorFor = (outcome: string): string => {
    if (outcome === 'sent') return '#1a7f37';
    if (outcome === 'failed') return '#c1121f';
    if (outcome === 'disabled') return '#b35900';
    return '#6b6b73'; // skipped
  };
  const sent = dispatch.filter(d => d.outcome === 'sent').length;
  const rows = dispatch.map(d => {
    const points = d.points === 4 ? '4 (exact)' : d.points === 1 ? '1 (winner)' : d.points === 0 ? '0 (miss)' : `${d.points}`;
    return `<tr>
      <td style="padding:4px 10px;">${esc(d.userName)}</td>
      <td style="padding:4px 10px;color:#6b6b73;">${esc(d.userEmail)}</td>
      <td style="padding:4px 10px;text-align:center;">${points}</td>
      <td style="padding:4px 10px;font-weight:600;color:${colorFor(d.outcome)};">${esc(d.outcome)}</td>
      <td style="padding:4px 10px;color:#6b6b73;">${esc(d.reason ?? '')}</td>
    </tr>`;
  }).join('');
  return `${deferredNote}
    <p style="color:#6b6b73;margin:14px 0 8px;">Dispatch outcome: <strong>${sent}/${dispatch.length}</strong> e-mail(s) sent.</p>
    <table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
      <thead>
        <tr style="background:#f5f5f7;">
          <th style="padding:6px 10px;text-align:left;">User</th>
          <th style="padding:6px 10px;text-align:left;">E-mail</th>
          <th style="padding:6px 10px;">Pts</th>
          <th style="padding:6px 10px;text-align:left;">Outcome</th>
          <th style="padding:6px 10px;text-align:left;">Reason</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderBestThirdSnapshot(trace: MatchUpdateTrace): string {
  if (!trace.bestThirdSnapshot) {
    return '<p style="color:#9a9aa3;font-style:italic;">(snapshot not captured)</p>';
  }
  const snap = trace.bestThirdSnapshot;
  const statusLine = snap.isFinal
    ? '<p style="color:#0a7e3b;font-weight:600;margin:0 0 8px;">FINAL — every group-stage match has been played; the top 8 are the final qualifiers.</p>'
    : `<p style="color:#6b6b73;margin:0 0 8px;">PROVISIONAL — only ${snap.groupsFullyPlayed}/12 groups have all matches played; this ranking may still change.</p>`;
  const rows = snap.rows.map(r => {
    const gdStr = r.gd >= 0 ? `+${r.gd}` : `${r.gd}`;
    const fifa = r.fifaRanking ? String(r.fifaRanking) : '–';
    const qualifies = r.snapshotStatus === 'qualify';
    const rowStyle = qualifies
      ? 'background:#e7f8ed;'
      : 'background:#fdecea;';
    const groupState = r.groupFullyPlayed
      ? '<span style="color:#0a7e3b;font-size:11px;">finished</span>'
      : '<span style="color:#c47f00;font-size:11px;">in progress</span>';
    return `<tr style="${rowStyle}">
      <td style="padding:4px 10px;text-align:center;">${r.rank}</td>
      <td style="padding:4px 10px;">${esc(r.teamName)}</td>
      <td style="padding:4px 10px;text-align:center;">${esc(r.groupId)}</td>
      <td style="padding:4px 10px;text-align:center;">${r.points}</td>
      <td style="padding:4px 10px;text-align:center;">${gdStr}</td>
      <td style="padding:4px 10px;text-align:center;">${r.goalsFor}:${r.goalsAgainst}</td>
      <td style="padding:4px 10px;text-align:center;">${r.fairPlayPoints}</td>
      <td style="padding:4px 10px;text-align:center;">${fifa}</td>
      <td style="padding:4px 10px;text-align:center;">${groupState}</td>
    </tr>`;
  }).join('');
  const tableHtml = `<table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
    <thead>
      <tr style="background:#f5f5f7;">
        <th style="padding:6px 10px;text-align:center;">#</th>
        <th style="padding:6px 10px;text-align:left;">Team</th>
        <th style="padding:6px 10px;">Grp</th>
        <th style="padding:6px 10px;">Pts</th>
        <th style="padding:6px 10px;">GD</th>
        <th style="padding:6px 10px;">GF:GA</th>
        <th style="padding:6px 10px;">FP</th>
        <th style="padding:6px 10px;">FIFA</th>
        <th style="padding:6px 10px;">Group state</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
  const tiebreakerHtml = snap.tiebreakerNotes.length > 0
    ? `<div style="margin-top:8px;padding:8px 10px;background:#eff6ff;border-left:3px solid #1e40af;color:#1e40af;font:12px/1.5 -apple-system,Segoe UI,sans-serif;">
        <strong>Tiebreaker:</strong> ${snap.tiebreakerNotes.map(esc).join(' | ')}
      </div>`
    : '';
  return statusLine + tableHtml + tiebreakerHtml;
}

function renderCrossGroupThirdPlaceRegen(trace: MatchUpdateTrace): string {
  const regen = trace.crossGroupThirdPlaceRegen;
  if (!regen) {
    return '<p style="color:#9a9aa3;font-style:italic;">(cross-group 3rd-place regen step not reached)</p>';
  }
  // Mode-specific intro so the reader instantly knows WHY a given list is
  // empty (or non-empty) — closure path is a superset of decided-only; the
  // decided-only path can simply find no decided other groups yet.
  const introByMode: Record<typeof regen.mode, string> = {
    'closure-covered': `<p style="color:#6b6b73;margin:0 0 8px;">This save closed out the entered group, so the closure regen pass refreshed the group + 3rd-placed-team article for <strong>every</strong> other group (decided + in-progress). The list below is the subset that picks out the 3rd-placed team from each.</p>`,
    'snapshot-shift': `<p style="color:#6b6b73;margin:0 0 8px;">This save did not close the entered group, but it can still shift the best-third ranking — so the group + 3rd-placed-team article was force-regenerated for every OTHER group that is already fully-decided. In-progress other groups are intentionally skipped (their 3rd-placed team is still a moving target).</p>`,
    'no-decided-others': `<p style="color:#9a9aa3;font-style:italic;margin:0 0 8px;">No OTHER group is fully-decided yet, so nothing needed refreshing for the cross-group snapshot shift.</p>`,
  };
  const intro = introByMode[regen.mode];
  if (regen.regeneratedTeams.length === 0) {
    return intro;
  }
  const rows = regen.regeneratedTeams
    .slice()
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map(t => `<tr>
      <td style="padding:4px 10px;text-align:center;">${esc(t.groupId)}</td>
      <td style="padding:4px 10px;">${esc(t.teamName)}</td>
      <td style="padding:4px 10px;color:#6b6b73;">team ${t.teamId}</td>
    </tr>`).join('');
  return `${intro}
    <table style="border-collapse:collapse;font:13px/1.4 -apple-system,Segoe UI,sans-serif;width:100%;">
      <thead>
        <tr style="background:#f5f5f7;">
          <th style="padding:6px 10px;text-align:center;">Group</th>
          <th style="padding:6px 10px;text-align:left;">3rd-placed team</th>
          <th style="padding:6px 10px;text-align:left;color:#6b6b73;">Team ID</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCacheInvalidation(trace: MatchUpdateTrace): string {
  if (!trace.cacheInvalidation) return '<p style="color:#9a9aa3;font-style:italic;">(cache invalidation step not reached)</p>';
  const ci = trace.cacheInvalidation;
  return `<table style="font:13px/1.5 -apple-system,Segoe UI,sans-serif;width:100%;">
    ${row('revalidateTag', ci.revalidatedTags.map(t => code(t)).join(' '))}
    ${row('Cloudflare purge', ci.cloudflarePurged ? '<span style="color:#0a7e3b;">OK</span>' : `<span style="color:#c62828;">FAILED: ${esc(ci.cloudflareError ?? 'unknown')}</span>`)}
  </table>`;
}

function renderErrors(trace: MatchUpdateTrace): string {
  if (trace.errors.length === 0) return '<p style="color:#0a7e3b;">No errors swallowed during the cascade.</p>';
  const rows = trace.errors.map(e => `<li style="margin:4px 0;"><strong>${esc(e.step)}:</strong> ${esc(e.message)}</li>`).join('');
  return `<ul style="margin:0;padding-left:20px;color:#c62828;font:13px/1.5 -apple-system,Segoe UI,sans-serif;">${rows}</ul>`;
}

function renderSlowPassSummary(trace: MatchUpdateTrace): string {
  const sp = trace.slowPass;
  if (!sp) return '';
  const icon = sp.succeeded ? '✅' : '❌';
  const color = sp.succeeded ? '#1a7f37' : '#c1121f';
  const bg = sp.succeeded ? 'rgba(26,127,55,0.08)' : 'rgba(193,18,31,0.08)';
  const border = sp.succeeded ? 'rgba(26,127,55,0.4)' : 'rgba(193,18,31,0.4)';
  const statusLine = sp.succeeded
    ? 'Completed cleanly — every generation passed. Tip e-mails sent and caches revalidated.'
    : sp.gaveUp
      ? `Gave up after ${sp.attempt} attempt(s) — ${sp.failedCount} generation(s) still failing. Finalized with what succeeded.`
      : `Will retry — next attempt (#${sp.attempt + 1}/${sp.maxAttempts}) runs in about <strong>${sp.nextAttemptInSeconds ?? 0} s</strong>. The group's pages stay in their "no predictions yet" state until a clean run lands.`;
  return `
    <div style="margin:0 0 20px;padding:14px 18px;background:${bg};border:1px solid ${border};border-left:4px solid ${color};border-radius:4px;">
      <div style="font:700 18px/1.3 -apple-system,Segoe UI,sans-serif;color:${color};">
        ${icon} ${sp.okCount} passed · ${sp.failedCount} failed — attempt ${sp.attempt}/${sp.maxAttempts}
      </div>
      <div style="margin-top:6px;color:#444;font:400 13px/1.5 -apple-system,Segoe UI,sans-serif;">${statusLine}</div>
    </div>`;
}

export function buildAdminMatchSummaryEmail(trace: MatchUpdateTrace): TemplateOutput {
  const m = trace.match;
  const scoreStr = `${m.homeGoals ?? '?'}:${m.awayGoals ?? '?'}`;
  const timeoutPrefix = trace.timedOut ? '[TIMEOUT] ' : '';
  const lanePrefix = trace.lane === 'fast' ? '[FAST] ' : trace.lane === 'slow' ? '[SLOW] ' : '';

  let subject: string;
  if (trace.slowPass) {
    const sp = trace.slowPass;
    const icon = sp.succeeded ? '✅' : '❌';
    const status = sp.succeeded
      ? 'all done'
      : sp.gaveUp
        ? `gave up · ${sp.failedCount} failed`
        : `${sp.failedCount} failed · retry in ${sp.nextAttemptInSeconds ?? 0}s`;
    subject = `${icon} ${lanePrefix}[admin] ${m.homeTeam} ${scoreStr} ${m.awayTeam} — Group ${m.groupId} · attempt ${sp.attempt}/${sp.maxAttempts} · ${status}`;
  } else {
    subject = `${timeoutPrefix}${lanePrefix}[admin] ${m.homeTeam} ${scoreStr} ${m.awayTeam} — Group ${m.groupId} (${trace.errors.length} errors)`;
  }

  const timeoutBanner = trace.timedOut
    ? `<div style="margin:0 0 20px;padding:14px 18px;background:#fff3cd;border:1px solid #ffc107;border-left:4px solid #c47f00;border-radius:4px;color:#5a4500;font:600 14px/1.5 -apple-system,Segoe UI,sans-serif;">
        ⚠ Cascade timed out during <strong>${esc(trace.timedOut.stage)}</strong> after ${fmtMs(trace.timedOut.afterMs)} (budget ${fmtMs(trace.timedOut.budgetMs)}).
        <div style="margin-top:6px;font-weight:400;color:#6b5500;">In-flight Claude calls were abandoned so this e-mail could still go out before the platform recycled the container. The trace below is partial — any team/group articles that didn't finish before the deadline are missing.</div>
      </div>`
    : '';

  const headerHtml = section('Match result entered', `
    <table style="font:13px/1.5 -apple-system,Segoe UI,sans-serif;width:100%;">
      ${row('Match', `<strong>${esc(m.homeTeam)} ${scoreStr} ${esc(m.awayTeam)}</strong>`)}
      ${row('Group', esc(m.groupId))}
      ${row('Match ID', String(m.matchId))}
      ${row('Status', esc(m.status))}
      ${row('Started at', esc(trace.startedAt))}
      ${row('Total cascade duration', fmtMs(trace.totalDurationMs))}
      ${trace.timedOut ? row('Timeout', `<span style="color:#c47f00;font-weight:600;">${esc(trace.timedOut.stage)} after ${fmtMs(trace.timedOut.afterMs)} (budget ${fmtMs(trace.timedOut.budgetMs)})</span>`) : ''}
      ${trace.groupClosure ? row('Group closure', `<span style="color:#0a7e3b;font-weight:600;">Group ${esc(trace.groupClosure.groupId)} just transitioned to fully decided (${trace.groupClosure.finishedMatches}/${trace.groupClosure.totalMatches} matches) — cross-group regen triggered.</span>`) : ''}
    </table>`);

  const standingsHtml = section('Group standings after recalculation', renderStandings(trace) + renderProbabilities(trace));
  const scenariosHtml = section('Per-team scenario summaries (input to article generation)', renderScenarioSummaries(trace));

  const groupArticleHtml = section('Group article', trace.groupArticle
    ? renderArticleCall(`Group ${m.groupId}`, trace.groupArticle)
    : '<p style="color:#9a9aa3;font-style:italic;">(group article generation not reached)</p>');

  const teamArticlesHtml = section('Team articles', trace.teamArticles.length > 0
    ? trace.teamArticles.map(t => renderArticleCall(`${t.teamName} (team ${t.teamId})`, t)).join('')
    : '<p style="color:#9a9aa3;font-style:italic;">(no team articles generated)</p>');

  const bestThirdHtml = section('Cross-group best-third snapshot (fed into AI prompts)', renderBestThirdSnapshot(trace));
  const crossGroupRegenHtml = section('Cross-group 3rd-place predictions regen (other groups)', renderCrossGroupThirdPlaceRegen(trace));

  const tipsHtml = section('Tip points & user e-mails', renderTipTransitions(trace) + renderTipEmailDispatch(trace));
  const cacheHtml = section('Cache invalidation', renderCacheInvalidation(trace));
  const errorsHtml = section('Swallowed errors', renderErrors(trace));

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1f;font:13px/1.5 -apple-system,Segoe UI,sans-serif;">
  <div style="max-width:900px;margin:0 auto;">
    <h1 style="font:600 20px/1.3 -apple-system,Segoe UI,sans-serif;margin:0 0 8px;">${esc(m.homeTeam)} <span style="font-variant:tabular-nums;">${scoreStr}</span> ${esc(m.awayTeam)} — Group ${esc(m.groupId)}</h1>
    <p style="color:#6b6b73;margin:0 0 24px;">Diagnostic trace of the synchronous match-update cascade. Generated ${esc(trace.startedAt)}.</p>
    ${renderSlowPassSummary(trace)}
    ${timeoutBanner}
    ${headerHtml}
    ${standingsHtml}
    ${scenariosHtml}
    ${groupArticleHtml}
    ${teamArticlesHtml}
    ${bestThirdHtml}
    ${crossGroupRegenHtml}
    ${tipsHtml}
    ${cacheHtml}
    ${errorsHtml}
    <p style="color:#9a9aa3;font-size:11px;margin-top:32px;border-top:1px solid #e3e3e8;padding-top:12px;">knockouts.in admin trace — automatic notification${
      process.env.RAILWAY_GIT_COMMIT_SHA
        ? ` · build ${esc(process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7))}`
        : ''
    }</p>
  </div>
</body></html>`;

  return { subject, html };
}
