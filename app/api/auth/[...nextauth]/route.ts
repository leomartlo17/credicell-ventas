import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { sedeDelUsuario, esAdmin } from "@/lib/sedes";

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      // Solo dejar entrar si el email está registrado en alguna sede o es admin
      const sede = sedeDelUsuario(user.email);
      const admin = esAdmin(user.email);
      return sede !== null || admin;
    },
    async session({ session }) {
      if (session.user?.email) {
        const sede = sedeDelUsuario(session.user.email);
        // Inyectamos la sede en la sesión para usarla en toda la app
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
