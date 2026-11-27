"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CASTER_DIRECTORY_PATH, casterPublicProfilePath } from "@/lib/caster/publication";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import { ADMIN_APPLICATION_PAGE_SIZE, CASTER_REVIEW_FEEDBACK_LIMIT, casterAdminApplicationPage, isCasterApplicationId, type CasterAdminResult } from "./admin-application-contracts";
import { CASTER_MODERATION_PATH, isCasterModerationFilter, moderationLabels, type CasterModerationEntry, type CasterModerationList, type CasterModerationSearch } from "./moderation-contracts";

const denied: CasterAdminResult = { kind: "error", message: "Your current session cannot manage casters." };
const unavailable: CasterAdminResult = { kind: "error", message: "Caster moderation is temporarily unavailable. Try again." };

async function currentActor(): Promise<string | null> {
  if (!isCasterProgramEnabled()) return null;
  try {
    const actor = await requireCurrentPatch2Admin();
    await requireCurrentAccountLegalAcceptance();
    return actor;
  } catch {
    return null;
  }
}

function formValue(form: FormData, name: string) {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
}

export async function searchCasterModeration(_previous: CasterModerationSearch, form: FormData): Promise<CasterModerationSearch> {
  const actor = await currentActor();
  if (!actor) return denied;

  const filter = formValue(form, "status");
  const query = formValue(form, "query").trim();
  const page = casterAdminApplicationPage(formValue(form, "page"));
  if (!isCasterModerationFilter(filter) || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return { kind: "error", message: "Choose a membership status and enter up to 100 search characters." };
  }
  const snapshot = await casterRpc<CasterModerationList>("caster_phase3_admin_list", {
    p_actor: actor,
    p_status: filter === "all" ? null : filter,
    p_query: query || null,
    p_offset: (page - 1) * ADMIN_APPLICATION_PAGE_SIZE,
  });
  return snapshot?.status === "ok" ? { kind: "ok", snapshot, filter, query, page } : unavailable;
}

export async function moderateCaster(_previous: CasterAdminResult, form: FormData): Promise<CasterAdminResult> {
  const actor = await currentActor();
  if (!actor) return denied;

  const applicationId = formValue(form, "application");
  const versionText = formValue(form, "version");
  const version = /^\d{1,10}$/.test(versionText) ? Number(versionText) : -1;
  const action = formValue(form, "action");
  const reason = formValue(form, "reason").trim();
  if (!isCasterApplicationId(applicationId) || version < 0 || version > 2_147_483_647 || !Object.hasOwn(moderationLabels, action) ||
    !reason || reason.length > CASTER_REVIEW_FEEDBACK_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason) || formValue(form, "confirm") !== "yes") {
    return { kind: "error", message: "Choose an action, enter a reason, and confirm the decision." };
  }

  const result = await casterRpc<{ status: string; caster?: CasterModerationEntry }>("caster_phase3_moderate", {
    p_actor: actor,
    p_application_id: applicationId,
    p_expected_version: version,
    p_action: action,
    p_reason: reason,
  });
  switch (result?.status) {
    case "ok":
      revalidatePath(CASTER_MODERATION_PATH);
      revalidatePath(`${CASTER_MODERATION_PATH}/${applicationId}`);
      revalidatePath(CASTER_DIRECTORY_PATH);
      revalidatePath("/");
      if (result.caster?.slug) revalidatePath(casterPublicProfilePath(result.caster.slug));
      return { kind: "ok", message: "Moderation decision recorded." };
    case "conflict":
    case "locked":
      return { kind: "error", message: "The caster’s status changed. Reload this page and review the current status." };
    case "closed":
    case "not_found":
      return { kind: "error", message: "This account is unavailable for moderation." };
    default:
      return unavailable;
  }
}
