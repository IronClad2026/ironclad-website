import "server-only";

import { auth } from "@clerk/nextjs/server";

import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isReadyCategoryId, type ReadyCategoryId } from "./catalogue";
import { isReadyEngagementEnabled } from "./review-access";
import { READY_SUGGESTION_MAX_LENGTH } from "./suggestion-contract";

export const readySuggestionStatuses = ["new", "reviewed", "added"] as const;
type SuggestionStatus = (typeof readySuggestionStatuses)[number];
export const readySuggestionStatusLabels: Record<SuggestionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  added: "Added to menu",
};

const PAGE_SIZE = 20;
const MAX_PAGE = 1 + 100_000 / PAGE_SIZE;
const REQUEST_TIMEOUT_MS = 6_000;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const versionPattern = /^[0-9]{1,8}$/;

type SuggestionFilters = { status: SuggestionStatus | null; page: number };
type ReadyTopicSuggestion = {
  id: string;
  submittedAt: string;
  categoryId: ReadyCategoryId | null;
  description: string;
  menuVersion: string;
  catalogueVersion: string;
  status: SuggestionStatus;
};

export type ReadySuggestionsResult =
  | { status: "unauthorized" }
  | { status: "unavailable"; filters: SuggestionFilters }
  | { status: "ready"; filters: SuggestionFilters; items: ReadyTopicSuggestion[]; total: number; pages: number };

type SuggestionMutationResult = "unauthorized" | "invalid" | "unavailable" | "missing" | "updated" | "deleted" | "notice-required";

function isStatus(value: unknown): value is SuggestionStatus {
  return readySuggestionStatuses.some((status) => status === value);
}

export function readySuggestionFilters(status: unknown, page: unknown): SuggestionFilters {
  return {
    status: isStatus(status) ? status : null,
    page: typeof page === "string" && /^\d{1,5}$/.test(page) ? Math.min(MAX_PAGE, Math.max(1, Number(page))) : 1,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("Invalid suggestion record");
}

function isSuggestionId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}

function normalizeSuggestion(value: unknown): ReadyTopicSuggestion {
  const { id, submittedAt, categoryId, description, menuVersion, catalogueVersion, status } = record(value);
  if (!isSuggestionId(id) || typeof submittedAt !== "string" || !Number.isFinite(Date.parse(submittedAt)) ||
    (categoryId !== null && !isReadyCategoryId(categoryId)) || typeof description !== "string" ||
    !description.trim() || description.length > READY_SUGGESTION_MAX_LENGTH || !isVersion(menuVersion) || !isVersion(catalogueVersion) ||
    !isStatus(status)) throw new Error("Invalid suggestion fields");
  return { id, submittedAt, categoryId, description, menuVersion, catalogueVersion, status };
}

async function currentAdmin() {
  if (!isReadyEngagementEnabled()) return null;
  const identity = await auth().catch(() => null);
  if (!identity?.userId || !await hasCurrentPatch2AdminAccess(identity.userId, identity.sessionClaims, identity.sessionId)) return null;
  return identity;
}

export async function loadReadySuggestions(filters: SuggestionFilters): Promise<ReadySuggestionsResult> {
  const identity = await currentAdmin();
  if (!identity) return { status: "unauthorized" };

  let items: ReadyTopicSuggestion[];
  let total: number;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("get_ready_topic_suggestions", {
      p_status: filters.status,
      p_limit: PAGE_SIZE,
      p_offset: (filters.page - 1) * PAGE_SIZE,
    }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    if (error) return { status: "unavailable", filters };

    const result = record(data);
    if (!Array.isArray(result.rows) || result.rows.length > PAGE_SIZE || typeof result.total !== "number" ||
      !Number.isSafeInteger(result.total) || result.total < result.rows.length) throw new Error("Invalid suggestion page");
    items = result.rows.map(normalizeSuggestion);
    total = result.total;
  } catch {
    return { status: "unavailable", filters };
  }

  const { userId, sessionClaims, sessionId } = identity;
  if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) {
    return { status: "unauthorized" };
  }

  return { status: "ready", filters, items, total, pages: Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE))) };
}

export async function mutateReadySuggestion(id: unknown, status: unknown, operation: unknown): Promise<SuggestionMutationResult> {
  const identity = await currentAdmin();
  if (!identity) return "unauthorized";
  if (!isSuggestionId(id) || (operation !== "delete" && (operation !== "review" || !isStatus(status)))) return "invalid";

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return "notice-required";
  }

  const { userId, sessionClaims, sessionId } = identity;
  if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) {
    return "unauthorized";
  }

  try {
    const { data, error } = await createSupabaseAdminClient().rpc("review_ready_topic_suggestion", {
      p_id: id,
      p_status: operation === "delete" ? null : status,
      p_delete: operation === "delete",
    }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    if (error) return "unavailable";
    if (data === "not_found") return "missing";
    if (data === "invalid") return "invalid";
    const expected = operation === "delete" ? "deleted" : "updated";
    return data === expected ? expected : "unavailable";
  } catch {
    return "unavailable";
  }
}
