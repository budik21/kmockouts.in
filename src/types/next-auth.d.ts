import 'next-auth';

declare module 'next-auth' {
  interface Session {
    isAdmin?: boolean;
    tipsterId?: number;
    shareToken?: string;
    tipsPublic?: boolean;
  }
}
