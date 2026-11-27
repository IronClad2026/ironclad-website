import type { AnnouncementDocument } from "@/lib/announcement-document";
import type { CasterApplicationDraft } from "./application";

export const CASTER_PROFILE_PATH = "/api/caster/profile";
export const CASTER_DIRECTORY_PATH = "/casters";
export const CASTER_PUBLIC_MEDIA_PATH = "/api/caster/public-media";

export type CasterMembershipStatus = "active" | "suspended" | "inactive";

export type CasterWorkingProfile = {
  draft: Partial<CasterApplicationDraft>;
  version: number;
  show_country: boolean;
  slug: string | null;
  publication_id: string | null;
  published_version: number | null;
  hidden: boolean;
  membership_status: CasterMembershipStatus;
};

export type CasterWorkingResult = { status: string; profile?: CasterWorkingProfile | null };

export type PublicCasterCard = {
  slug: string;
  publication_id: string;
  display_name: string;
  avatar: string;
  languages: string[];
  games: string[];
  platforms: string[];
};

export type PublicCasterProfile = PublicCasterCard & {
  banner: string | null;
  bio: AnnouncementDocument;
  experience: string;
  links: { label: string; url: string }[];
  videos: string[];
  gallery: string[];
  country: string | null;
};

export function isCasterPublicSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 &&
    value !== "invitation" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function casterPublicProfilePath(slug: string) {
  return `${CASTER_DIRECTORY_PATH}/${encodeURIComponent(slug)}`;
}

export function casterPublicMediaPath(slug: string, publicationId: string, assetId: string) {
  return `${CASTER_PUBLIC_MEDIA_PATH}/${[slug, publicationId, assetId].map(encodeURIComponent).join("/")}`;
}
