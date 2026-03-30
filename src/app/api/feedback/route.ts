import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Resend } from 'resend';
import { UAParser } from 'ua-parser-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FEEDBACK_NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL;

/**
 * POST /api/feedback
 * Saves user feedback to the database with rich metadata and sends an email notification.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, message, pageUrl, clientMeta } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    if (message.trim().length > 5000) {
      return NextResponse.json({ error: 'Message is too long (max 5000 characters).' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? '';
    const acceptLanguage = request.headers.get('accept-language') ?? '';

    // Extract IP address
    const ip = extractIp(request);

    // Parse User-Agent
    const parsedResult = UAParser(userAgent);
    const parsedUA = {
      browser: parsedResult.browser,
      os: parsedResult.os,
      device: parsedResult.device,
      engine: parsedResult.engine,
    };

    // Geolocation from IP (fire-and-forget friendly, but we await for metadata)
    const geo = await fetchGeoLocation(ip);

    // Build full metadata object
    const metadata = {
      ip,
      geo,
      parsedUA,
      acceptLanguage,
      ...(clientMeta && typeof clientMeta === 'object' ? { client: clientMeta } : {}),
    };

    // Save to database
    await query(
      `INSERT INTO feedback (user_name, user_email, message, page_url, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        (name ?? '').slice(0, 255),
        (email ?? '').slice(0, 255),
        message.trim(),
        (pageUrl ?? '').slice(0, 500),
        userAgent.slice(0, 500),
        JSON.stringify(metadata),
      ]
    );

    // Send email notification (fire-and-forget)
    if (RESEND_API_KEY && FEEDBACK_NOTIFY_EMAIL) {
      sendEmailNotification({
        name: name ?? '',
        email: email ?? '',
        message: message.trim(),
        pageUrl: pageUrl ?? '',
        metadata,
      }).catch((err) => console.error('Email notification failed:', err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feedback save error:', error);
    return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }
}

/* ---------- Helpers ---------- */

/** Extract the client IP from headers (works behind Railway / reverse proxies). */
function extractIp(request: NextRequest): string {
  // Railway / Cloudflare / standard proxy headers
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return 'unknown';
}

interface GeoData {
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
}

/** Fetch geolocation data from ip-api.com (free, no key needed, 45 req/min). */
async function fetchGeoLocation(ip: string): Promise<GeoData | null> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'fail') return null;
    return data as GeoData;
  } catch {
    return null;
  }
}

// ---------- Email notification ----------

interface FeedbackEmailData {
  name: string;
  email: string;
  message: string;
  pageUrl: string;
  metadata: Record<string, unknown>;
}

async function sendEmailNotification(data: FeedbackEmailData) {
  if (!RESEND_API_KEY || !FEEDBACK_NOTIFY_EMAIL) return;

  const resend = new Resend(RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';

  const meta = data.metadata;
  const geo = meta.geo as GeoData | null;
  const parsedUA = meta.parsedUA as { browser: { name?: string; version?: string }; os: { name?: string; version?: string }; device: { type?: string; vendor?: string; model?: string } } | null;
  const client = meta.client as Record<string, unknown> | undefined;

  // Build metadata rows for email
  const rows: [string, string][] = [];

  if (data.name) rows.push(['Name', esc(data.name)]);
  if (data.email) rows.push(['Email', `<a href="mailto:${esc(data.email)}">${esc(data.email)}</a>`]);
  if (data.pageUrl) rows.push(['Page', `<a href="${esc(data.pageUrl)}">${esc(data.pageUrl)}</a>`]);

  // IP & Geo
  if (meta.ip && meta.ip !== 'unknown') rows.push(['IP Address', esc(meta.ip as string)]);
  if (geo) {
    const loc = [geo.city, geo.regionName, geo.country].filter(Boolean).join(', ');
    if (loc) rows.push(['Location', esc(loc)]);
    if (geo.isp) rows.push(['ISP', esc(geo.isp)]);
    if (geo.org && geo.org !== geo.isp) rows.push(['Organization', esc(geo.org)]);
    if (geo.as) rows.push(['AS', esc(geo.as)]);
    if (geo.lat && geo.lon) rows.push(['Coordinates', `${geo.lat}, ${geo.lon}`]);
    if (geo.timezone) rows.push(['Timezone (IP)', esc(geo.timezone)]);
  }

  // Parsed UA
  if (parsedUA) {
    const browser = [parsedUA.browser.name, parsedUA.browser.version].filter(Boolean).join(' ');
    const os = [parsedUA.os.name, parsedUA.os.version].filter(Boolean).join(' ');
    const device = [parsedUA.device.vendor, parsedUA.device.model].filter(Boolean).join(' ');
    const deviceType = parsedUA.device.type;
    if (browser) rows.push(['Browser', esc(browser)]);
    if (os) rows.push(['OS', esc(os)]);
    if (device) rows.push(['Device', esc(device)]);
    if (deviceType) rows.push(['Device Type', esc(deviceType)]);
  }

  // Client-side metadata
  if (client) {
    if (client.timezone) rows.push(['Timezone (browser)', esc(client.timezone as string)]);
    if (client.languages) rows.push(['Languages', esc((client.languages as string[]).join(', '))]);
    if (client.screenWidth && client.screenHeight) rows.push(['Screen', `${client.screenWidth}×${client.screenHeight}`]);
    if (client.viewportWidth && client.viewportHeight) rows.push(['Viewport', `${client.viewportWidth}×${client.viewportHeight}`]);
    if (client.devicePixelRatio) rows.push(['Pixel Ratio', `${client.devicePixelRatio}`]);
    if (client.platform) rows.push(['Platform', esc(client.platform as string)]);
    if (typeof client.maxTouchPoints === 'number') rows.push(['Touch Points', `${client.maxTouchPoints}`]);
    if (client.colorDepth) rows.push(['Color Depth', `${client.colorDepth}-bit`]);
    if (client.hardwareConcurrency) rows.push(['CPU Cores', `${client.hardwareConcurrency}`]);
    if (client.deviceMemory) rows.push(['Device Memory', `${client.deviceMemory} GB`]);
    if (client.connectionType) rows.push(['Connection', esc(client.connectionType as string)]);
    if (client.referrer) rows.push(['Referrer', esc(client.referrer as string)]);
    rows.push(['Cookies', client.cookieEnabled ? 'Enabled' : 'Disabled']);
    rows.push(['Online', client.online ? 'Yes' : 'No']);
  }

  if (meta.acceptLanguage) rows.push(['Accept-Language', esc((meta.acceptLanguage as string).slice(0, 200))]);

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 12px;">${value}</td></tr>`
    )
    .join('');

  await resend.emails.send({
    from: fromAddress,
    to: FEEDBACK_NOTIFY_EMAIL,
    subject: `New Feedback on Knockouts.in${data.name ? ` from ${data.name}` : ''}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:700px;">
        <h2 style="color:#6f003c;border-bottom:2px solid #6f003c;padding-bottom:8px;">
          New Feedback Received
        </h2>
        <div style="background:#f8f9fa;border-left:4px solid #6f003c;padding:12px 16px;border-radius:4px;white-space:pre-wrap;margin-bottom:20px;">
          ${esc(data.message)}
        </div>
        <h3 style="color:#6f003c;font-size:14px;margin-bottom:8px;">Sender Details</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
          ${tableRows}
        </table>
        <p style="color:#999;font-size:11px;margin-top:16px;">
          Sent from Knockouts.in feedback form at ${new Date().toISOString()}
        </p>
      </div>
    `,
  });
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
