"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import {
  ADMIN_APPLICATION_PAGE_SIZE,
  CASTER_APPLICATIONS_ADMIN_PATH,
  CASTER_GRANTS_ADMIN_PATH,
  CASTER_REVIEW_FEEDBACK_LIMIT,
  casterReviewDecisions,
  casterAdminApplicationPage,
  isCasterAccountId,
  isCasterAdminApplicationFilter,
  isCasterApplicationId,
  type CasterAdminAccountSearch,
  type CasterAdminApplicationDetail,
  type CasterAdminApplicationList,
  type CasterAdminApplicationSearch,
  type CasterAdminResult,
  type CasterReviewDecision,
} from "./admin-application-contracts";
import { loadCasterAdminAccount, searchCasterAdminAccounts } from "./admin-clerk-account";

const denied = "Your current session cannot manage caster applications.";
const unavailable = "Caster management is temporarily unavailable. Try again.";
const stale = "The application changed while you were reviewing it. Reload and review the current submission.";

function failure(message: string): CasterAdminResult {
  return { kind: "error", message };
}

function oneText(form: FormData, name: string): string {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
}

function readFeedback(form: FormData): string | null {
  const feedback = oneText(form, "feedback").trim();
  return feedback.length > 0 && feedback.length <= CASTER_REVIEW_FEEDBACK_LIMIT &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(feedback) ? feedback : null;
}

function isReviewDecision(value: string): value is CasterReviewDecision {
  return Object.hasOwn(casterReviewDecisions, value);
}

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

export async function searchCasterApplications(
  _previous: CasterAdminApplicationSearch,
  form: FormData,
): Promise<CasterAdminApplicationSearch> {
  const actor = await currentActor();
  if (!actor) return failure(denied);

  const filter = oneText(form, "status");
  const query = oneText(form, "query").trim();
  const page = casterAdminApplicationPage(oneText(form, "page"));
  if (!isCasterAdminApplicationFilter(filter) || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return failure("Choose a valid status and enter no more than 100 search characters.");
  }
  const snapshot = await casterRpc<CasterAdminApplicationList>("caster_phase2_admin_list", {
    p_actor: actor,
    p_status: filter === "all" ? null : filter,
    p_query: query || null,
    p_offset: (page - 1) * ADMIN_APPLICATION_PAGE_SIZE,
  });
  return snapshot?.status === "ok" ? { kind: "ok", snapshot, query, filter, page } : failure(unavailable);
}

export async function searchCasterAccounts(
  _previous: CasterAdminAccountSearch,
  form: FormData,
): Promise<CasterAdminAccountSearch> {
  const actor = await currentActor();
  if (!actor) return failure(denied);

  const query = oneText(form, "query").trim();
  if (query.length < 3 || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return failure("Enter 3–100 characters from an account name, email address or account ID.");
  }

  const accounts = await searchCasterAdminAccounts(query, actor);
  return accounts ? { kind: "ok", accounts } : failure(unavailable);
}

export async function reviewCasterApplication(
  _previous: CasterAdminResult,
  form: FormData,
): Promise<CasterAdminResult> {
  const actor = await currentActor();
  if (!actor) return failure(denied);

  const applicationId = oneText(form, "application");
  const expectedRevision = oneText(form, "revision");
  const decision = oneText(form, "decision");
  const feedback = readFeedback(form);
  if (!isCasterApplicationId(applicationId) || !isCasterApplicationId(expectedRevision) ||
    !isReviewDecision(decision) || !feedback || oneText(form, "confirm") !== "yes") {
    return failure("Select a decision, enter a reason, and confirm your review.");
  }

  const detail = await casterRpc<CasterAdminApplicationDetail>("caster_phase2_admin_detail", {
    p_actor: actor, p_application_id: applicationId,
  });
  const application = detail?.application;
  if (!detail || detail.status !== "ok") {
    return failure(detail?.status === "not_found" ? "This application is unavailable for review." : unavailable);
  }
  if (!application || application.id !== applicationId || application.owner_clerk_user_id === actor) {
    return failure("This application is unavailable for review.");
  }
  if (application.revision?.id !== expectedRevision ||
    application.status !== (decision === "reopen" ? "rejected" : "submitted")) return failure(stale);

  if (decision === "approve") {
    const account = await loadCasterAdminAccount(application.owner_clerk_user_id);
    if (!account?.available || !account.verified) {
      return failure("Approval requires an active IronClad account with a verified primary email.");
    }
  }

  const result = await casterRpc<{ status: string }>("caster_phase2_review", {
    p_actor: actor,
    p_application_id: applicationId,
    p_expected_revision: expectedRevision,
    p_decision: decision,
    p_feedback: feedback,
  });

  switch (result?.status) {
    case "ok":
      revalidatePath(CASTER_APPLICATIONS_ADMIN_PATH);
      revalidatePath(`${CASTER_APPLICATIONS_ADMIN_PATH}/${applicationId}`);
      return { kind: "ok", message: "Application decision recorded." };
    case "conflict":
      return failure(stale);
    case "legal_required":
      return failure("Current Terms of Service and Privacy Policy acceptance is required before approval.");
    case "not_found":
    case "closed":
      return failure("This account is unavailable for review.");
    default:
      return failure(unavailable);
  }
}

export async function grantCasterAccess(
  _previous: CasterAdminResult,
  form: FormData,
): Promise<CasterAdminResult> {
  const actor = await currentActor();
  if (!actor) return failure(denied);

  const target = oneText(form, "target");
  const feedback = readFeedback(form);
  if (!isCasterAccountId(target) || target === actor || !feedback || oneText(form, "confirm") !== "yes") {
    return failure("Select another registered account, enter a reason, and confirm the grant.");
  }
  const account = await loadCasterAdminAccount(target);
  if (!account?.available || !account.verified) {
    return failure("Caster access requires an active IronClad account with a verified primary email.");
  }

  const result = await casterRpc<{ status: string }>("caster_phase2_grant", {
    p_actor: actor,
    p_target: target,
    p_feedback: feedback,
  });
  switch (result?.status) {
    case "ok":
      revalidatePath(CASTER_GRANTS_ADMIN_PATH);
      revalidatePath(CASTER_APPLICATIONS_ADMIN_PATH);
      return { kind: "ok", message: "Caster access granted. The caster can complete their private profile in Caster Studio." };
    case "conflict":
      return failure("This account already has a caster application or membership. Review it in Applications.");
    case "legal_required":
      return failure("The selected account must accept the current Terms of Service and Privacy Policy before a grant.");
    case "closed":
      return failure("This account is unavailable for caster access.");
    default:
      return failure(unavailable);
  }
}
