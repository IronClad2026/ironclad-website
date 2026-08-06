"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export type PlayerRegistrationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function withdrawTournamentRegistrationAction(
  _previousState: PlayerRegistrationActionState,
  formData: FormData
): Promise<PlayerRegistrationActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before withdrawing from a tournament.");
  }

  const registrationId = getUuid(formData, "registrationId");
  if (!registrationId) {
    return errorState("The tournament registration could not be found.");
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const owned = await loadOwnedRegistration(supabase, registrationId, userId);

  if (owned === "error") {
    return errorState("The tournament registration could not be verified.");
  }

  if (!owned) {
    return errorState("The tournament registration is not available.");
  }

  const { data, error } = await supabase.rpc(
    "withdraw_tournament_registration",
    { p_registration_id: registrationId }
  );

  if (error) {
    logPlayerRegistrationFailure("withdraw", error);
    return errorState(
      getMutationErrorMessage(
        error,
        "Your tournament registration could not be withdrawn."
      )
    );
  }

  const result = firstRow(data);
  if (
    !isRecord(result) ||
    result.registration_id !== registrationId ||
    result.registration_status !== "withdrawn" ||
    typeof result.withdrawn_at !== "string"
  ) {
    logPlayerRegistrationFailure("withdraw-invalid-result");
    return errorState("Your tournament registration could not be withdrawn.");
  }

  revalidatePlayerRegistrationPaths();
  return {
    status: "success",
    message:
      "Registration withdrawn. This decision is final for this tournament.",
  };
}

export async function respondToWaitlistOfferAction(
  _previousState: PlayerRegistrationActionState,
  formData: FormData
): Promise<PlayerRegistrationActionState> {
  const { userId } = await auth();

  if (!userId) {
    return errorState("Sign in before responding to a waitlist offer.");
  }

  const registrationId = getUuid(formData, "registrationId");
  const response = formData.get("response");

  if (!registrationId) {
    return errorState("The waitlist offer could not be found.");
  }

  if (response !== "accept" && response !== "decline") {
    return errorState("Choose Accept or Decline for this waitlist offer.");
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const owned = await loadOwnedRegistration(supabase, registrationId, userId);

  if (owned === "error") {
    return errorState("The waitlist offer could not be verified.");
  }

  if (!owned) {
    return errorState("The waitlist offer is not available.");
  }

  const { data, error } = await supabase.rpc("respond_to_waitlist_offer", {
    p_registration_id: registrationId,
    p_response: response,
  });

  if (error) {
    logPlayerRegistrationFailure(`offer-${response}`, error);
    return errorState(
      getMutationErrorMessage(error, "The waitlist offer could not be updated.")
    );
  }

  const result = firstRow(data);
  const expectedOfferStatus = response === "accept" ? "accepted" : "declined";
  const expectedRegistrationStatus =
    response === "accept" ? "pending" : "waitlisted";

  if (
    !isRecord(result) ||
    result.registration_id !== registrationId ||
    result.waitlist_offer_status !== expectedOfferStatus ||
    result.registration_status !== expectedRegistrationStatus ||
    typeof result.waitlist_offer_resolved_at !== "string"
  ) {
    logPlayerRegistrationFailure(`offer-${response}-invalid-result`);
    return errorState("The waitlist offer could not be updated.");
  }

  revalidatePlayerRegistrationPaths();
  return {
    status: "success",
    message:
      response === "accept"
        ? "Spot accepted. Your registration is now awaiting administrator review."
        : "Spot declined. Your waitlist registration is now closed.",
  };
}

type AuthenticatedSupabaseClient = Awaited<
  ReturnType<typeof createAuthenticatedSupabaseClient>
>;

async function loadOwnedRegistration(
  supabase: AuthenticatedSupabaseClient,
  registrationId: string,
  userId: string
): Promise<boolean | "error"> {
  const { data, error } = await supabase
    .from("registrations")
    .select("id")
    .eq("id", registrationId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    logPlayerRegistrationFailure("load-owned-registration", error);
    return "error";
  }

  return isRecord(data) && data.id === registrationId;
}

function getMutationErrorMessage(error: unknown, fallback: string) {
  const message = getErrorField(error, "message").toLowerCase();

  if (message.includes("launched") || message.includes("already started")) {
    return "This division has already started, so its roster is locked.";
  }

  if (message.includes("expired") || message.includes("deadline")) {
    return "This waitlist offer has expired and can no longer be accepted.";
  }

  if (
    message.includes("not offered") ||
    message.includes("already resolved") ||
    message.includes("cannot respond")
  ) {
    return "This waitlist offer is no longer available.";
  }

  if (message.includes("cannot withdraw") || message.includes("withdrawn")) {
    return "This registration can no longer be withdrawn.";
  }

  return fallback;
}

function revalidatePlayerRegistrationPaths() {
  for (const path of ["/admin", "/admin/tournaments", "/dashboard", "/tournaments"]) {
    revalidatePath(path);
  }
}

function errorState(message: string): PlayerRegistrationActionState {
  return { status: "error", message };
}

function getUuid(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : null;
}

function firstRow(value: unknown) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : null;
  }

  return value;
}

function getErrorField(error: unknown, field: string) {
  return isRecord(error) && typeof error[field] === "string"
    ? error[field]
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function logPlayerRegistrationFailure(operation: string, error?: unknown) {
  const candidateCode = getErrorField(error, "code").toUpperCase();
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "REGISTRATION_FAILED";

  console.error("Player registration operation failed.", { operation, code });
}
