import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { sedeDelUsuario, esAdmin } from "@/lib/sedes";

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
