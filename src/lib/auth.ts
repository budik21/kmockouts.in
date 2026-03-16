import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { queryOne } from './db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session }) {
      if (session.user?.email) {
        const row = await queryOne<{ email: string }>(
          'SELECT email FROM admin_user WHERE email = $1',
          [session.user.email],
        );
        session.isAdmin = !!row;
      }
      return session;
    },
  },
});
