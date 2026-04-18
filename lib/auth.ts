import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { sedeDelUsuario, esAdmin, Sede } from "@/lib/sedes";

// --- Auto-configurar NEXTAUTH_URL en Vercel ---
// Sin esto NextAuth usaría VERCEL_URL (que incluye el hash del deployment
// y cambia en cada push), rompiendo el redirect de Google OAuth.
if (!process.env.NEXTAUTH_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const sede = sedeDelUsuario(user.email);
      const admin = esAdmin(user.email);
      return sede !== null || admin;
    },
    async session({ session }) {
      if (session.user?.email) {
        const sede = sedeDelUsuario(session.user.email);
        (session as any).sede = sede;
        (session as any).esAdmin = esAdmin(session.user.email);
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};

/**
 * Helper para extender el tipo Session con la sede del usuario.
 * Uso en API routes:
 *   const session = await getServerSession(authOptions);
 *   const sede = (session as SessionConSede)?.sede;
 */
export type SessionConSede = {
  user?: { email?: string | null; name?: string | null };
  sede?: Sede | null;
  esAdmin?: boolean;
};
