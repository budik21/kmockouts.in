import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin-auth';
import { SUPERADMIN_EMAIL } from '@/lib/superadmin';

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { email } = (await request.json()) as { email?: unknown };
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Invalid e-mail address' }, { status: 400 });
    }

    await query(
      `INSERT INTO admin_user (email) VALUES ($1) ON CONFLICT DO NOTHING`,
      [normalized],
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/users error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const { email } = (await request.json()) as { email?: unknown };
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }
    const normalized = email.trim().toLowerCase();
    if (normalized === SUPERADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'The superadmin cannot be removed.' },
        { status: 400 },
      );
    }
    await query(`DELETE FROM admin_user WHERE email = $1`, [normalized]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
