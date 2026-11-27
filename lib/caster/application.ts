import type { AnnouncementDocument } from "@/lib/announcement-document";

export const CASTER_APPLICATION_PATH = "/api/caster/application";
export const CASTER_MEDIA_PATH = "/api/caster/media";
export const CASTER_MEDIA_BUCKET = "caster-application-media";
export const CASTER_NOTIFICATION_TYPE = "caster.application_updated";

export const CASTER_APPLICATION_LIMITS = {
  avatar: 2 * 1024 * 1024,
  banner: 3 * 1024 * 1024,
  galleryImage: 3 * 1024 * 1024,
  gallery: 6,
  videos: 3,
  biography: 2_000,
  links: 6,
  languages: 8,
  games: 10,
  displayName: 80,
  discord: 100,
  experience: 1_000,
  retainedMedia: 32 * 1024 * 1024,
} as const;

export type CasterMediaKind = "avatar" | "banner" | "gallery";
export type CasterApplicationStatus = "draft" | "submitted" | "changes_requested" | "approved" | "rejected";

export type CasterApplicationDraft = {
  displayName: string;
  country: string;
  languages: string[];
  avatar: string | null;
  banner: string | null;
  gallery: string[];
  bio: AnnouncementDocument | null;
  discord: string;
  links: { label: string; url: string }[];
  videos: string[];
  games: string[];
  experience: string;
};

export type CasterApplicationRevision = {
  id: string;
  version: number;
  draft: CasterApplicationDraft;
  submitted_at: string;
};

export type CasterPhase2Application = {
  id: string;
  status: CasterApplicationStatus;
  draft: Partial<CasterApplicationDraft>;
  draft_version: number;
  submitted_revision_id: string | null;
  revision: CasterApplicationRevision | null;
  feedback: string | null;
  membership_active: boolean;
};

export type CasterApplicationResult = {
  status: string;
  application?: CasterPhase2Application | null;
};

export function emptyCasterDraft(): CasterApplicationDraft {
  return {
    displayName: "", country: "", languages: [], avatar: null, banner: null, gallery: [],
    bio: null, discord: "", links: [], videos: [], games: [], experience: "",
  };
}

export function casterMediaPath(id: string): string {
  return `${CASTER_MEDIA_PATH}/${encodeURIComponent(id)}`;
}

export function isCasterMediaId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
