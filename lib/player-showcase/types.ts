import type { BadgeSlug } from "@/lib/badges/types";

export type PublicShowcaseBadge = { slug: BadgeSlug; unlockedAt: string | null };
export type PublicPlayerShowcase = {
  currentThought: string | null;
  featuredBadge: PublicShowcaseBadge | null;
};
export type OwnedShowcaseBadge = PublicShowcaseBadge & { awardId: string };
export type ShowcaseEditorState = {
  playerId: string;
  currentThought: string | null;
  featuredBadgeAwardId: string | null;
  thoughtHidden: boolean;
  revision: number;
  awards: OwnedShowcaseBadge[];
  publicProfileEnabled: boolean;
};
export type ShowcaseMessageCode =
  | "thoughtSaved" | "badgeSaved" | "moderationSaved"
  | "signInRequired" | "profileRequired" | "unavailable"
  | "thoughtTooLong" | "thoughtInvalid" | "invalidAward" | "awardNotOwned"
  | "conflict" | "saveFailed" | "forbidden" | "legalRequired" | "invalidPlayer";
export type ActionResult = {
  status: "success" | "error";
  code: ShowcaseMessageCode;
  revision?: number;
  currentThought?: string | null;
  featuredBadgeAwardId?: string | null;
  thoughtHidden?: boolean;
};
