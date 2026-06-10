import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApi } from '@/lib/admin-auth';
import { query } from '@/lib/db';
import {
  ADMIN_EMAIL_CAMPAIGNS,
  getAdminEmailCampaign,
  type CampaignRecipient,
} from '@/lib/email-templates/admin-campaigns';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/emails?template=<id>
 * Returns the campaign template list, the selected template's default
 * recipients, and all tipster users (so the admin can add anyone to the list).
 */
export async function GET(req: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const templateId = url.searchParams.get('template') ?? ADMIN_EMAIL_CAMPAIGNS[0].id;
  const campaign = getAdminEmailCampaign(templateId);
  if (!campaign) {
    return NextResponse.json({ error: `Unknown template: ${templateId}` }, { status: 400 });
  }

  try {
    const [defaultRecipients, allUsers] = await Promise.all([
      campaign.defaultRecipients(),
      query<CampaignRecipient>(
        'SELECT id, email, name FROM tipster_user ORDER BY name, email',
      ),
    ]);

    return NextResponse.json({
      templates: ADMIN_EMAIL_CAMPAIGNS.map(({ id, label, description, subject }) => ({
        id,
        label,
        description,
        subject,
      })),
      templateId: campaign.id,
      defaultRecipients,
      allUsers,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

interface SendRequestBody {
  templateId?: string;
  userIds?: unknown;
}

export interface SendFailure {
  email: string;
  error: string;
}

/**
 * POST /api/admin/emails
 * Body: { templateId: string, userIds: number[] }
 * Sends the campaign e-mail to each selected user individually (one Resend
 * call per recipient — no shared recipient list). Individual failures don't
 * abort the batch; they're reported back per address.
 */
export async function POST(req: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json().catch(() => null)) as SendRequestBody | null;
    const campaign = getAdminEmailCampaign(body?.templateId ?? '');
    if (!campaign) {
      return NextResponse.json({ error: 'Unknown or missing templateId' }, { status: 400 });
    }

    const userIds = Array.isArray(body?.userIds)
      ? body!.userIds.filter((n): n is number => Number.isInteger(n))
      : [];
    if (userIds.length === 0) {
      return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 503 });
    }

    const users = await query<CampaignRecipient>(
      'SELECT id, email, name FROM tipster_user WHERE id = ANY($1::int[]) ORDER BY name, email',
      [userIds],
    );
    if (users.length === 0) {
      return NextResponse.json({ error: 'None of the selected users exist' }, { status: 400 });
    }

    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? 'Knockouts.in <onboarding@resend.dev>';

    let sent = 0;
    const failures: SendFailure[] = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const { subject, html } = campaign.build(user);
      try {
        // Resend does NOT throw on API-level rejections — it returns
        // { data, error }, so check both (same contract as tip-notifications).
        const { data, error } = await resend.emails.send({
          from,
          to: user.email,
          subject,
          html,
        });
        if (error) throw new Error(error.message ?? JSON.stringify(error));
        if (!data?.id) throw new Error('Resend returned no message id');
        sent++;
      } catch (err) {
        failures.push({ email: user.email, error: String(err) });
      }
      // Resend's default rate limit is 2 requests/second — pace the batch so
      // it doesn't get throttled mid-run.
      if (i < users.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    for (const f of failures) {
      console.error(`[admin-emails] ${campaign.id}: send to ${f.email} failed — ${f.error}`);
    }
    console.log(
      `[admin-emails] ${campaign.id}: sent=${sent} failed=${failures.length} of ${users.length}`,
    );

    return NextResponse.json({ sent, failed: failures.length, total: users.length, failures });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
