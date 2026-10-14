/**
 * Operator provisioning actions (Phase 4.2). Server-only.
 *
 * These are the platform's first operator ACTIONS, and `operator-access.ts`
 * is explicit about how one must fail: the navigating gate would `redirect()`
 * or `notFound()`, and an action cannot do either — it has to fail closed
 * with a result the form can render. So each action calls the STRUCTURED
 * `requireOperator` and returns an error state, never a navigation.
 *
 * The privileged work itself is not here. These actions resolve the identity
 * and map results; the rules live in `lib/tenant-provisioning.ts`, which
 * re-checks the role itself, so the check below is the first of two rather
 * than the only one.
 */
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireOperator } from "@/lib/permissions";
import { inviteTenantOwner, provisionTenant } from "@/lib/tenant-provisioning";

export interface ProvisionState {
  status: "idle" | "saved" | "error";
  message?: string;
  /** Field-keyed messages from the service layer, eg `{ slug: [...] }`. */
  fields?: Record<string, string[]>;
  /** The slug a successful create produced, so the form can link on. */
  slug?: string;
}

/**
 * Nothing about a refusal is specific to the caller: a signed-out visitor and
 * a signed-in owner get the same answer, so the action never confirms that an
 * operator surface exists.
 */
function denied(): ProvisionState {
  return { status: "error", message: "Operator access required." };
}

function formText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function createTenantAction(
  _previous: ProvisionState,
  formData: FormData
): Promise<ProvisionState> {
  const check = requireOperator(await auth());
  if (!check.ok) {
    return denied();
  }
  // Omit `theme` rather than send an empty string, so the schema's default
  // applies instead of failing an enum on "".
  const theme = formText(formData, "theme");
  const result = await provisionTenant(check.data, {
    slug: formText(formData, "slug"),
    name: formText(formData, "name"),
    ...(theme === undefined ? {} : { theme }),
    published: formData.get("published") === "on",
  });
  if (!result.ok) {
    return { status: "error", message: result.error.message, fields: result.error.fields };
  }
  revalidatePath("/operator");
  revalidatePath(`/operator/tenants/${result.data.slug}`);
  return {
    status: "saved",
    slug: result.data.slug,
    message: `Created ${result.data.slug} as a ${result.data.published ? "published" : "draft"} site with the ${result.data.theme} theme.`,
  };
}

export async function inviteOwnerAction(
  _previous: ProvisionState,
  formData: FormData
): Promise<ProvisionState> {
  const check = requireOperator(await auth());
  if (!check.ok) {
    return denied();
  }
  const slug = formText(formData, "slug");
  const result = await inviteTenantOwner(check.data, {
    slug,
    email: formText(formData, "email"),
  });
  if (!result.ok) {
    return { status: "error", message: result.error.message, fields: result.error.fields };
  }
  if (slug) {
    revalidatePath(`/operator/tenants/${slug}`);
  }
  revalidatePath("/operator");
  return {
    status: "saved",
    message: result.data.created
      ? `Invited ${result.data.email} — they can sign in with a magic link to reach their dashboard.`
      : `Granted ${result.data.email} owner access.`,
  };
}
