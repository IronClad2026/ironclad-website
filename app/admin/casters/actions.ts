"use server";

import { revalidatePath } from "next/cache";
import { CASTER_ADMIN_PATH, INVITATION_PATH } from "@/lib/caster/contracts";
import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { digestInvitationSecret, generateInvitationSecret } from "@/lib/caster/invitation-secret";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";

export type InvitationActionResult = {
  kind: "idle" | "error" | "ok";
  message?: string;
  issued?: { link: string; recovery: string };
};

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function updateCasterInvitation(_state: InvitationActionResult, form: FormData): Promise<InvitationActionResult> {
  const origin = getCasterInvitationOrigin();
  if (!origin) return failure("Caster Management is unavailable.");
  let actor: string;
  try {
    actor = await requireCurrentPatch2Admin();
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return failure("Your current session cannot manage invitations.");
  }

  const intent = form.get("intent");
  const id = form.get("invitation") ?? "";
  if (typeof id !== "string" || (id !== "" && !uuid.test(id))) return failure("Select a valid invitation.");
  if (intent === "revoke" && id) {
    const result = await casterRpc<{ status: string }>("caster_phase1_revoke", { p_actor: actor, p_invitation: id });
    if (result?.status !== "revoked") return failure("This invitation could not be revoked. Check its current status.");
    revalidatePath(CASTER_ADMIN_PATH);
    return { kind: "ok", message: "Invitation revoked." };
  }

  if ((intent !== "issue" || id) && (intent !== "replace" || !id)) return failure("Select an invitation action.");
  const input = form.get("reference") ?? "";
  if (typeof input !== "string" || input.length > 100 || /[\u0000-\u001f\u007f]/.test(input)) {
    return failure("Use an internal reference of up to 100 characters.");
  }

  const secret = generateInvitationSecret();
  const result = await casterRpc<{ status: string }>("caster_phase1_issue", {
    p_actor: actor, p_token_digest: digestInvitationSecret(secret), p_reference: input.trim() || null, p_replaces: id || null,
  });
  if (result?.status === "rate_limited") return failure("Too many invitations were issued. Try again later.");
  if (result?.status === "claimed" || result?.status === "conflict") return failure("This invitation was already claimed or replaced.");
  if (result?.status !== "issued") return failure("The invitation could not be generated. Try again.");

  const link = new URL(INVITATION_PATH, origin);
  link.hash = `invite=${secret}`;
  revalidatePath(CASTER_ADMIN_PATH);
  return { kind: "ok", message: id ? "Replacement invitation generated." : "Invitation generated.", issued: { link: link.href, recovery: secret } };
}

function failure(message: string): InvitationActionResult {
  return { kind: "error", message };
}
