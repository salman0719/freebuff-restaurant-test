/**
 * NextAuth v5 authentication foundation (Phase 1.3).
 *
 * Decision record: `docs/decisions/0002-open-decisions.md` §2 — pinned
 * `next-auth@5.0.0-beta.32` (declares Next 16 peer support) with
 * `@auth/drizzle-adapter`, email magic links only (no passwords, per
 * product scope). Server-only: never import from client components.
 *
 * Two roles, two layers (see 0003):
 * - `users.role` is the GLOBAL platform role (`owner` default). It gates
 *   operator-only surfaces and nothing else.
 * - `memberships` rows prove access to a SPECIFIC tenant. A global
 *   `owner` role never implies tenant access — `src/lib/permissions.ts`
 *   enforces that near the data, and `proxy.ts` re-checks at the edge.
 *
 * Env: `AUTH_SECRET` (required), `EMAIL_SERVER` + `EMAIL_FROM` (required
 * in any environment that sends sign-in links), `DATABASE_URL` (required
 * on first query, not on import — see `db/index.ts`).
 */
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { db } from "../db";
import { accounts, sessions, users, verificationTokens } from "../db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: string } & DefaultSession["user"];
  }
  interface User {
    role: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      return session;
    },
  },
});
