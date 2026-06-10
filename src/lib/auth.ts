import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { query, queryOne } from './db';
import { slugify } from './slugify';

const isDev = process.env.NODE_ENV === 'development';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Dev-only e-mail login so the tipping flow can be tested locally without
    // Google OAuth (whose redirect URIs are tied to the deployed domains).
    // Never registered outside development.
    ...(isDev
      ? [
          Credentials({
            id: 'dev-login',
            name: 'Dev login (local only)',
            credentials: {
              email: { label: 'Email', type: 'email' },
              name: { label: 'Name', type: 'text' },
            },
            async authorize(creds) {
              const email = typeof creds?.email === 'string' ? creds.email.trim() : '';
              if (!email) return null;
              const name =
                typeof creds?.name === 'string' && creds.name.trim()
                  ? creds.name.trim()
                  : email.split('@')[0];
              return { id: email, email, name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    // With the Credentials provider NextAuth uses a JWT session; carry the
    // identity onto the token so the session callback below can resolve the
    // tipster by e-mail just like the Google flow.
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async signIn({ user }) {
      // Upsert tipster_user on every sign-in
      if (user.email) {
        const token = generateShareToken(user.name || user.email.split('@')[0]);
        await query(
          `INSERT INTO tipster_user (email, name, image, share_token, tips_public)
           VALUES ($1, $2, $3, $4, TRUE)
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
