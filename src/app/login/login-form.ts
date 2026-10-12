/**
 * Pure login-form parsing (Phase 3.1). Lives outside `actions.ts`
 * because `"use server"` modules may only export async functions —
 * and because the parser is unit-testable without the Auth.js mock.
 */
import { emailSchema } from "@/lib/validation";

export interface LoginState {
  error?: string;
  /** Echoed so a failed attempt keeps the typed address. */
  email?: string;
}

export type ParsedLoginForm =
  { ok: true; email: string; next: string } | { ok: false; error: string; email: string };

/** Keep only same-origin paths (`/dashboard/...`); everything else falls back. */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  return value;
}

/** Pure form parsing: email shape + safe redirect target. */
export function parseLoginForm(formData: FormData): ParsedLoginForm {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email.", email };
  }
  return { ok: true, email: parsed.data, next: safeNext(formData.get("next")) };
}
