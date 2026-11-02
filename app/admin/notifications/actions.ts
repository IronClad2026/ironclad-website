"use server";

import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  isAdminInboxNotificationId, isAdminNotificationInboxEnabled, loadAdminNotificationInbox, normalizeAdminInboxOptions,
  normalizeAdminInboxScope, requireAdminNotificationInbox,
  type AdminInboxData, type AdminInboxScope,
} from "@/lib/admin-notification-inbox";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type AdminInboxMutationResult =
  | { ok: true; data: AdminInboxData }
  | { ok: false; message: string };

export async function markSelectedAdminNotificationsRead(formData: FormData): Promise<AdminInboxMutationResult> {
  return mutateInbox(formData, "read");
}

export async function markAllAdminNotificationsRead(formData: FormData): Promise<AdminInboxMutationResult> {
  return mutateInbox(formData, "read_all");
}

export async function dismissSelectedAdminNotifications(formData: FormData): Promise<AdminInboxMutationResult> {
  return mutateInbox(formData, "dismiss");
}

async function mutateInbox(
  formData: FormData,
  action: "read" | "read_all" | "dismiss"
): Promise<AdminInboxMutationResult> {
  try {
    await requireAdminNotificationInbox();
  } catch {
    return { ok: false, message: "Administrator access is required." };
  }
  if (!isAdminNotificationInboxEnabled()) {
    return { ok: false, message: "The scoped Admin inbox is currently disabled. Please try again later." };
  }

  let scope: AdminInboxScope;
  let query: ReturnType<typeof normalizeAdminInboxOptions>;
  let ids: string[];
  try {
    if (!(formData instanceof FormData)) throw new Error("The inbox action is invalid.");
    const kind = singleValue(formData, "kind");
    const tournamentId = singleValue(formData, "tournamentId");
    if (kind !== "tournament" && tournamentId !== undefined) throw new Error("The inbox scope is invalid.");
    scope = normalizeAdminInboxScope(kind === "tournament"
      ? { kind, tournamentId: tournamentId ?? "" }
      : { kind } as AdminInboxScope);
    query = normalizeAdminInboxOptions({
      page: singleValue(formData, "page"), filter: singleValue(formData, "filter"),
      selected: singleValue(formData, "selected") || undefined,
    });
    const values = formData.getAll("notificationId");
    // Validate every supplied target before deduplication; never discard bad IDs.
    if (values.some((value) => !isAdminInboxNotificationId(value))) {
      throw new Error("Every selected notification must have a valid identifier.");
    }
    ids = [...new Set((values as string[]).map((id) => id.toLowerCase()))];
    if (action === "read_all") {
      if (scope.kind !== "tournament" || ids.length !== 0) {
        throw new Error("Mark all as read is available only for the selected tournament.");
      }
    } else if (ids.length < 1 || ids.length > 100) {
      throw new Error("Select between 1 and 100 notifications.");
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The inbox action is invalid." };
  }

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return { ok: false, message: "Review and accept the current account terms before changing the inbox." };
  }

  try {
    const { data, error } = await createSupabaseAdminClient().rpc("mutate_admin_notification_inbox", {
      p_scope: scope.kind,
      p_tournament_id: scope.kind === "tournament" ? scope.tournamentId : null,
      p_action: action, p_ids: ids,
    });
    if (error || !Number.isSafeInteger(data) || data < 0) {
      return { ok: false, message: "The inbox change could not be completed. Refresh this inbox and try again." };
    }
  } catch {
    return { ok: false, message: "The inbox change could not be completed. Refresh this inbox and try again." };
  }

  // Return this inbox's authoritative state without refreshing result/replay drafts.
  try {
    const data = await loadAdminNotificationInbox(scope, query);
    return { ok: true, data };
  } catch {
    return { ok: false, message: "The inbox change was saved, but its latest state could not be loaded. Refresh this inbox." };
  }
}

function singleValue(formData: FormData, key: string): string | undefined {
  const values = formData.getAll(key);
  if (values.length > 1 || (values.length === 1 && typeof values[0] !== "string")) {
    throw new Error("The inbox action contains an invalid or repeated field.");
  }
  return values[0] as string | undefined;
}
