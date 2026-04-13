import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { query, queryOne } from './db';
import { slugify } from './slugify';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Upsert tipster_user on every sign-in
      if (user.email) {
        const token = generateShareToken(user.name || user.email.split('@')[0]);
        await query(
          `INSERT INTO tipster_user (email, name, image, share_token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             image = EXCLUDED.image,
             share_token = EXCLUDED.share_token`,
          [user.email, user.name || '', user.image || '', token],
        );
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const row = await queryOne<{ email: string }>(
          'SELECT email FROM admin_user WHERE email = $1',
          [session.user.email],
        );
        session.isAdmin = !!row;

        // Attach tipster user id
        const tipster = await queryOne<{ id: number; share_token: string; tips_public: boolean }>(
          'SELECT id, share_token, tips_public FROM tipster_user WHERE email = $1',
          [session.user.email],
        );
        if (tipster) {
          session.tipsterId = tipster.id;
          session.shareToken = tipster.share_token;
          session.tipsPublic = tipster.tips_public;
        }
      }
      return session;
    },
  },
});

/**
 * Generate a share token like "radek-budar-a3f7x2"
 * Slugified user name + 6-char random suffix for uniqueness.
 */
function generateShareToken(name: string): string {
  const slug = slugify(name) || 'user';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let hash = '';
  for (let i = 0; i < 6; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${slug}-${hash}`;
}
