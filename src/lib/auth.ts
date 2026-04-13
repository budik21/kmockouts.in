import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { query, queryOne } from './db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    ...(process.env.MICROSOFT_CLIENT_ID
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            issuer: 'https://login.microsoftonline.com/common/v2.0',
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user }) {
      // Upsert tipster_user on every sign-in
      if (user.email) {
        const token = generateShareToken();
        await query(
          `INSERT INTO tipster_user (email, name, image, share_token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             image = EXCLUDED.image`,
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

function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 10; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
