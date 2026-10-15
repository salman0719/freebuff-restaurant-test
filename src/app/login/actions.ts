/**
 * Magic-link request action (Phase 3.1, rate limited in Phase 6.1). Server-only:
 * calls `signIn`. Parsing lives in `./login-form` (pure, unit-tested); this
 * module exports only the async action, as `"use server"` requires.
 *
 * This is the platform's ONLY unauthenticated action with an outbound side
 * effect, so it is the only place that needs an abuse control — and the check
 * runs BEFORE `signIn`, because the whole point is that the mail is never
 * sent. Rate limiting after the fact would still spend the SMTP quota and the
 * reputation that F3 is about.
 */
"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { clientIpFrom, enforceSignInRateLimit } from "@/lib/signin-rate-limit";
import { parseLoginForm, type LoginState } from "./login-form";

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = parseLoginForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error, email: parsed.email };
  }

  // Two dimensions, from request data only where it can be trusted: the
  // address comes from the validated form, the source from the proxy's
  // forwarded-for header (the limiter skips it entirely when it is absent or
  // implausible rather than lumping every caller into one bucket).
  const requestHeaders = await headers();
  const decision = await enforceSignInRateLimit({
    email: parsed.email,
    ip: clientIpFrom(requestHeaders.get("x-forwarded-for"), requestHeaders.get("x-real-ip")),
  });
  if (!decision.allowed) {
    // Same state shape as a validation failure, so the form shows it the same
    // way — and it never says whether the address has an account.
    return { error: decision.message, email: parsed.email };
  }

  // Auth.js throws a redirect on success; validation failures return above.
  await signIn("nodemailer", { email: parsed.email, redirectTo: parsed.next });
  return {};
}
