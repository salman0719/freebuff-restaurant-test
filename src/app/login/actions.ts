/**
 * Magic-link request action (Phase 3.1). Server-only: calls `signIn`.
 * Parsing lives in `./login-form` (pure, unit-tested); this module
 * exports only the async action, as `"use server"` requires.
 */
"use server";

import { signIn } from "@/auth";
import { parseLoginForm, type LoginState } from "./login-form";

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = parseLoginForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error, email: parsed.email };
  }
  // Auth.js throws a redirect on success; validation failures return above.
  await signIn("nodemailer", { email: parsed.email, redirectTo: parsed.next });
  return {};
}
