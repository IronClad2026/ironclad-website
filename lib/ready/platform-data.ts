import "server-only";

import { resolveLegalDocumentDownloadUrl } from "@/lib/legal-document-delivery";
import { isUuid } from "@/lib/match-room-assistance";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { getPublicTournamentRowsForRequest, type TournamentStatus } from "@/lib/tournaments";

const EVENT_COLUMNS = "id,slug,title,status,registration_enabled,registration_open_at,registration_close_at,start_date,format,prize_pool";
const MATCH_COLUMNS = "id,match_number,status,series_best_of,activation_version,deadline_at,hold_started_at,hold_released_at,outcome_type,player_one_registration_id,player_two_registration_id,bracket_rounds(round_number),generated_brackets!inner(format,tournament_brackets!inner(id,name,launched_at,tournaments!inner(id,slug,title,status,registration_enabled,registration_open_at,registration_close_at,start_date,format,prize_pool)))";
const OWNED_MATCH_LIMIT = 200;
const EVENT_LIMIT = 80;

export type ReadyEvent = {
  id: string;
  slug: string;
  title: string;
  status: TournamentStatus;
  registration_enabled: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  format: string | null;
  prize_pool: string | null;
};

type Profile = { id: string; profile_completed: boolean; account_closed_at: string | null };
type Registration = {
  id: string;
  tournament_id: string;
  tournament_bracket_id: string;
  registration_status: string;
};
type Related<T> = T | T[];
type Division = { id: string; name: string; launched_at: string | null; tournaments: Related<ReadyEvent> };
type MatchRow = {
  id: string;
  match_number: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  series_best_of: number;
  activation_version: number;
  deadline_at: string | null;
  hold_started_at: string | null;
  hold_released_at: string | null;
  outcome_type: string | null;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  bracket_rounds: Related<{ round_number: number }> | null;
  generated_brackets: Related<{ format: string; tournament_brackets: Related<Division> }>;
};
export type ReadyOwnedMatch = Omit<MatchRow, "generated_brackets" | "bracket_rounds"> & {
  event: ReadyEvent;
  division: string;
  divisionId: string;
  round: number | null;
  registrationId: string;
  opponentRegistrationId: string | null;
  active: boolean;
};
export type ReadyPrivateContext = {
  profile: Profile | null;
  registrations: Registration[];
};
export type ReadyAssistanceRecord = { id: string; room_id: string };
type ReadyAcceptedVersions = { rulebook: string; ppa: string; terms: string; privacy: string };

function one<T>(row: Related<T> | null | undefined): T | null {
  return Array.isArray(row) ? row[0] ?? null : row ?? null;
}

function readEvent(value: ReadyEvent | null): value is ReadyEvent {
  return !!value && isUuid(value.id) && typeof value.slug === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value.slug) &&
    typeof value.title === "string" && value.title.trim().length > 0 &&
    ["upcoming", "registration_open", "in_progress", "completed", "cancelled", "voided"].includes(value.status);
}

export async function loadReadyEvents(reference?: string): Promise<ReadyEvent[]> {
  const client = createSupabaseAdminClient();
  const query = client.from("tournaments").select(EVENT_COLUMNS);
  const result = reference
    ? await (isUuid(reference) ? query.eq("id", reference) : query.eq("slug", reference)).limit(1)
    : await query.in("status", ["upcoming", "registration_open", "in_progress", "completed"])
      .order("start_date", { ascending: false }).limit(EVENT_LIMIT);
  if (result.error || !Array.isArray(result.data)) throw new Error("Ready events unavailable");
  return getPublicTournamentRowsForRequest((result.data as ReadyEvent[]).filter(readEvent), reference ?? null);
}

/** The route supplies Clerk identity. Account closure is a service-only column. */
export async function loadReadyActiveProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await createSupabaseAdminClient().from("players")
    .select("id,profile_completed,account_closed_at")
    .eq("clerk_user_id", userId).maybeSingle();
  if (error) throw new Error("Ready account unavailable");
  const profile = data as Profile | null;
  return profile && isUuid(profile.id) && profile.account_closed_at === null ? profile : null;
}

export async function loadReadyPrivateContext(userId: string): Promise<ReadyPrivateContext> {
  const profile = await loadReadyActiveProfile(userId);
  if (!profile) return { profile: null, registrations: [] };
  const client = await createAuthenticatedSupabaseClient();
  const registrations = await client.from("registrations")
    .select("id,tournament_id,tournament_bracket_id,registration_status")
    .eq("clerk_user_id", userId).eq("profile_id", profile.id)
    .not("tournament_id", "is", null).not("tournament_bracket_id", "is", null)
    .order("created_at", { ascending: false }).limit(OWNED_MATCH_LIMIT);
  if (registrations.error || !Array.isArray(registrations.data) || registrations.data.length === OWNED_MATCH_LIMIT) {
    throw new Error("Ready registrations unavailable");
  }
  return {
    profile,
    registrations: (registrations.data as Registration[]).filter((row) =>
      isUuid(row.id) && isUuid(row.tournament_id) && isUuid(row.tournament_bracket_id)),
  };
}

export async function loadReadyOwnedMatches(owned: ReadyPrivateContext, requestedId?: string): Promise<ReadyOwnedMatch[]> {
  const registrations = new Map(owned.registrations.map((row) => [row.id, row]));
  if (!registrations.size || (requestedId && !isUuid(requestedId))) return [];
  const client = createSupabaseAdminClient();
  const ids = [...registrations.keys()];
  // The match table cannot be read by a player JWT. Both queries start from the caller's own registrations.
  const responses = await Promise.all(["player_one_registration_id", "player_two_registration_id"].map((seat) => {
    const query = client.from("tournament_matches").select(MATCH_COLUMNS).in(seat, ids);
    return requestedId ? query.eq("id", requestedId) : query.order("updated_at", { ascending: false }).limit(OWNED_MATCH_LIMIT);
  }));
  const matches = new Map<string, ReadyOwnedMatch>();
  for (const response of responses) {
    if (response.error || !Array.isArray(response.data) || response.data.length === OWNED_MATCH_LIMIT) {
      throw new Error("Ready matches unavailable");
    }
    for (const row of response.data as MatchRow[]) {
      const { generated_brackets: generatedRows, bracket_rounds: rounds, ...fields } = row;
      const generated = one(generatedRows);
      const division = one(generated?.tournament_brackets);
      const event = one(division?.tournaments);
      if (!division?.launched_at || !readEvent(event) || !isUuid(row.id)) continue;
      const seat = [row.player_one_registration_id, row.player_two_registration_id].find((id) => id && registrations.has(id));
      const registration = seat ? registrations.get(seat) : undefined;
      if (!registration || registration.tournament_id !== event.id || registration.tournament_bracket_id !== division.id) continue;
      const other = row.player_one_registration_id === seat ? row.player_two_registration_id : row.player_one_registration_id;
      const opponent = other !== seat && isUuid(other) ? other : null;
      const active = registration.registration_status === "approved" && event.status === "in_progress" &&
        row.status !== "completed" && row.outcome_type === null && (row.activation_version > 0 || generated?.format === "round_robin");
      matches.set(row.id, {
        ...fields, event, division: division.name, divisionId: division.id,
        round: one(rounds)?.round_number ?? null, registrationId: registration.id, opponentRegistrationId: opponent, active,
      });
    }
  }
  return [...matches.values()];
}

export async function loadReadyOpponent(match: ReadyOwnedMatch): Promise<string | null> {
  if (!match.opponentRegistrationId) return null;
  const { data, error } = await createSupabaseAdminClient().from("registrations").select("player_name")
    .eq("id", match.opponentRegistrationId).eq("tournament_id", match.event.id)
    .eq("tournament_bracket_id", match.divisionId).maybeSingle();
  if (error || typeof data?.player_name !== "string") throw new Error("Ready opponent unavailable");
  return data.player_name.trim().slice(0, 96) || null;
}

export async function loadReadyAssistanceRecord(match: ReadyOwnedMatch, profileId: string): Promise<ReadyAssistanceRecord | null> {
  const { data, error } = await createSupabaseAdminClient().from("assistance_requests")
    .select("id,room_id").eq("requester_player_id", profileId).eq("requester_registration_id", match.registrationId)
    .eq("tournament_id", match.event.id).eq("match_id", match.id)
    .eq("source_kind", "private_match_room").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Ready assistance unavailable");
  return isUuid(data?.id) && isUuid(data?.room_id) ? { id: data.id, room_id: data.room_id } : null;
}

export async function loadReadyLatestAssistance(profileId: string) {
  const { data, error } = await createSupabaseAdminClient().from("assistance_requests")
    .select("id,tournament_id").eq("requester_player_id", profileId).eq("source_kind", "private_match_room")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Ready assistance unavailable");
  return isUuid(data?.id) && isUuid(data?.tournament_id) ? { id: data.id as string, tournamentId: data.tournament_id as string } : null;
}

export async function loadReadyMatchSettings() {
  const client = createSupabaseAdminClient();
  const [chat, assistance] = await Promise.all([
    client.rpc("get_match_room_enabled"),
    client.from("platform_settings").select("value").eq("key", "private_assistance_new_requests_enabled").maybeSingle(),
  ]);
  if (chat.error || typeof chat.data !== "boolean" || assistance.error) throw new Error("Ready match settings unavailable");
  return { chat: chat.data, assistance: assistance.data?.value?.enabled === true };
}

export async function loadReadyAcceptedVersions(registration: Registration, userId: string): Promise<ReadyAcceptedVersions | null> {
  const { data, error } = await createSupabaseAdminClient().from("registration_acceptances")
    .select("rulebook_version,rulebook_sha256,ppa_version,ppa_sha256,terms_version,terms_sha256,privacy_version,privacy_sha256")
    .eq("registration_id", registration.id).eq("tournament_id", registration.tournament_id)
    .eq("clerk_user_id", userId).maybeSingle();
  if (error) throw new Error("Ready rule version unavailable");
  if (!data) return null;
  const kinds = ["rulebook", "ppa", "terms", "privacy"] as const;
  for (const kind of kinds) {
    if (!resolveLegalDocumentDownloadUrl({ kind, version: data[`${kind}_version`], sha256: data[`${kind}_sha256`] })) return null;
  }
  return { rulebook: data.rulebook_version, ppa: data.ppa_version, terms: data.terms_version, privacy: data.privacy_version };
}
