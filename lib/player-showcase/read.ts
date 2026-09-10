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
    const { data: player, error: playerError } = await client.from("players")
      .select("id, public_profile_enabled")
      .eq("clerk_user_id", userId).is("account_closed_at", null).maybeSingle();
    if (playerError) return { status: "error", code: "unavailable" };
    if (!player || !isShowcaseUuid(player.id)) return { status: "error", code: "profileRequired" };
    const [showcase, awardResult] = await Promise.all([
      client.rpc("get_my_player_showcase"),
      client.from("player_badge_awards").select(OWNED_SHOWCASE_AWARD_COLUMNS)
        .eq("player_id", player.id).order("unlocked_at", { ascending: false }),
    ]);
    if (showcase.error || awardResult.error || !showcase.data ||
        showcase.data.player_id !== player.id || !isShowcaseRevision(showcase.data.revision)) {
      return { status: "error", code: "unavailable" };
    }
    const awards: OwnedShowcaseBadge[] = [];
    for (const award of awardResult.data ?? []) {
      const slug = canonicalShowcaseSlug(award.badge_slug);
      if (slug && isShowcaseUuid(award.id)) {
        awards.push({ awardId: award.id, slug, unlockedAt: safeDate(award.original_unlocked_at ?? award.unlocked_at) });
      }
    }
    const thought = validateCurrentThought(showcase.data.current_thought);
    const selectedId = showcase.data.featured_badge_award_id;
    return {
      status: "success",
      state: {
        playerId: player.id,
        currentThought: thought.ok ? thought.value : null,
        featuredBadgeAwardId: isShowcaseUuid(selectedId) ? selectedId : null,
        thoughtHidden: showcase.data.thought_hidden_at !== null,
        revision: showcase.data.revision,
        awards,
        publicProfileEnabled: player.public_profile_enabled === true,
      },
    };
  } catch {
    return { status: "error", code: "unavailable" };
  }
}
