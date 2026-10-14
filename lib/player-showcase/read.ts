import "server-only";

import { auth } from "@clerk/nextjs/server";
import { getBadgeDefinitionBySlug } from "@/lib/badges/catalog";
import type { BadgeSlug } from "@/lib/badges/types";
import { createNoStoreSupabaseClient } from "@/lib/supabase";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import type { OwnedShowcaseBadge, PublicPlayerShowcase, ShowcaseEditorState } from "./types";
import { isShowcaseRevision, isShowcaseUuid, validateCurrentThought } from "./validation";

export const PUBLIC_SHOWCASE_COLUMNS =
  "player_id, current_thought, featured_badge_slug, featured_badge_unlocked_at";
export const OWNED_SHOWCASE_AWARD_COLUMNS =
  "id, badge_slug, unlocked_at, original_unlocked_at";

export function canonicalShowcaseSlug(value: unknown): BadgeSlug | null {
  return typeof value === "string" && getBadgeDefinitionBySlug(value as BadgeSlug)
    ? value as BadgeSlug : null;
}

function safeDate(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseShowcaseOwnerState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const thought = validateCurrentThought(row.current_thought);
  if (!isShowcaseUuid(row.player_id) || !isShowcaseRevision(row.revision) || !thought.ok ||
      (row.featured_badge_award_id !== null && !isShowcaseUuid(row.featured_badge_award_id)) ||
      (row.thought_hidden_at !== null && safeDate(row.thought_hidden_at) === null)) return null;
  return {
    playerId: row.player_id,
    currentThought: thought.value,
    featuredBadgeAwardId: row.featured_badge_award_id,
    thoughtHidden: row.thought_hidden_at !== null,
    revision: row.revision,
  };
}

export async function getPlayerShowcaseEnabled(): Promise<boolean> {
  try {
    const { data, error } = await createNoStoreSupabaseClient().rpc("player_showcase_enabled");
    return !error && data === true;
  } catch {
    return false;
  }
}

// Missing migrations, private/closed parents and optional Showcase failures never
// become a dependency of the existing profile or competition read paths.
export async function getPublicPlayerShowcase(playerId: string): Promise<PublicPlayerShowcase | null> {
  if (!isShowcaseUuid(playerId) || !await getPlayerShowcaseEnabled()) return null;
  try {
    const { data, error } = await createNoStoreSupabaseClient()
      .from("public_player_showcases")
      .select(PUBLIC_SHOWCASE_COLUMNS)
      .eq("player_id", playerId)
      .maybeSingle();
    if (error) return null;
    if (!data) return { currentThought: null, featuredBadge: null };
    const thought = validateCurrentThought(data.current_thought);
    const slug = canonicalShowcaseSlug(data.featured_badge_slug);
    return {
      currentThought: thought.ok ? thought.value : null,
      featuredBadge: slug ? { slug, unlockedAt: safeDate(data.featured_badge_unlocked_at) } : null,
    };
  } catch {
    return null;
  }
}

export type ShowcaseEditorLoad =
  | { status: "success"; state: ShowcaseEditorState }
  | { status: "error"; code: "signInRequired" | "profileRequired" | "unavailable" };

export async function getMyPlayerShowcase(): Promise<ShowcaseEditorLoad> {
  try {
    const { userId } = await auth();
    if (!userId) return { status: "error", code: "signInRequired" };
    if (!await getPlayerShowcaseEnabled()) return { status: "error", code: "unavailable" };
    const client = await createAuthenticatedSupabaseClient();
    // The authenticated RPC owns active-account resolution; its private closure
    // predicate must not be repeated through ungranted players columns.
    const { data, error } = await client.rpc("get_my_player_showcase");
    if (error) return { status: "error", code: "unavailable" };
    if (data === null) return { status: "error", code: "profileRequired" };
    const owner = parseShowcaseOwnerState(data);
    if (!owner) return { status: "error", code: "unavailable" };
    const { data: player, error: playerError } = await client.from("players")
      .select("id, public_profile_enabled")
      .eq("clerk_user_id", userId).eq("id", owner.playerId).maybeSingle();
    if (playerError) return { status: "error", code: "unavailable" };
    if (!player) return { status: "error", code: "profileRequired" };
    if (player.id !== owner.playerId) return { status: "error", code: "unavailable" };
    const awardResult = await client.from("player_badge_awards")
      .select(OWNED_SHOWCASE_AWARD_COLUMNS)
      .eq("player_id", owner.playerId).order("unlocked_at", { ascending: false });
    if (awardResult.error) return { status: "error", code: "unavailable" };
    const awards: OwnedShowcaseBadge[] = [];
    for (const award of awardResult.data ?? []) {
      const slug = canonicalShowcaseSlug(award.badge_slug);
      if (slug && isShowcaseUuid(award.id)) {
        awards.push({ awardId: award.id, slug, unlockedAt: safeDate(award.original_unlocked_at ?? award.unlocked_at) });
      }
    }
    return {
      status: "success",
      state: { ...owner, awards, publicProfileEnabled: player.public_profile_enabled === true },
    };
  } catch {
    return { status: "error", code: "unavailable" };
  }
}
