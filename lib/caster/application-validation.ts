import {
  getAnnouncementPlainText, hasAnnouncementDocumentText, parseAnnouncementDocument,
  type AnnouncementBlockNode, type AnnouncementDocument,
} from "@/lib/announcement-document";
import { countries, getCountryPresentationCode } from "@/lib/countries";
import { CASTER_APPLICATION_LIMITS as limits, emptyCasterDraft, isCasterMediaId, type CasterApplicationDraft } from "./application";
import { parseCasterFeaturedVideo, parseCasterHttpsUrl } from "./featured-video";

const countryCodes = new Set(countries.map(getCountryPresentationCode));
const draftFields = Object.keys(emptyCasterDraft());

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number, multiline = false): string | null {
  if (typeof value !== "string" || value.length > max * 2) return null;
  if (/[\p{Cc}\p{Cs}]/u.test(multiline ? value.replace(/\r\n?|\n/g, "") : value)) return null;
  const trimmed = value.trim();
  return Array.from(trimmed).length <= max ? trimmed : null;
}

function labels(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) return null;
  const result = value.map((item) => text(item, 50));
  if (result.some((item) => !item)) return null;
  return Array.from(new Set(result as string[]));
}

function biographyContainsLinks(block: AnnouncementBlockNode): boolean {
  if (block.type === "heading" || block.type === "paragraph") {
    return block.content?.some((node) => node.marks?.some((mark) => mark.type === "link")) ?? false;
  }
  return block.content.some((item) => item.content.some(biographyContainsLinks));
}

function parseBiography(value: unknown): AnnouncementDocument | null {
  const bio = parseAnnouncementDocument(value);
  if (!bio || Array.from(getAnnouncementPlainText(bio)).length > limits.biography ||
    bio.doc.content.some(biographyContainsLinks)) return null;
  return bio;
}

export function parseCasterDraft(value: unknown): CasterApplicationDraft | null {
  if (!record(value) || Object.keys(value).length !== draftFields.length || draftFields.some((field) => !Object.hasOwn(value, field))) return null;
  const displayName = text(value.displayName, limits.displayName);
  const discord = text(value.discord, limits.discord);
  const experience = text(value.experience, limits.experience, true);
  const country = text(value.country, 2);
  const languages = labels(value.languages, limits.languages);
  const games = labels(value.games, limits.games);
  if (displayName === null || discord === null || experience === null || country === null ||
    (country !== "" && !countryCodes.has(country)) || !languages || !games) return null;

  const { avatar, banner, gallery } = value;
  if ((avatar !== null && !isCasterMediaId(avatar)) || (banner !== null && !isCasterMediaId(banner)) ||
    !Array.isArray(gallery) || gallery.length > limits.gallery || gallery.some((id) => !isCasterMediaId(id))) return null;
  const bio = value.bio === null ? null : parseBiography(value.bio);
  if (value.bio !== null && bio === null) return null;

  if (!Array.isArray(value.links) || value.links.length > limits.links ||
    !Array.isArray(value.videos) || value.videos.length > limits.videos) return null;
  const links: CasterApplicationDraft["links"] = [];
  for (const link of value.links) {
    if (!record(link) || Object.keys(link).length !== 2) return null;
    const label = text(link.label, 60);
    const url = parseCasterHttpsUrl(link.url);
    if (!label || !url) return null;
    links.push({ label, url: url.href });
  }
  const videos = value.videos.map((url) => parseCasterFeaturedVideo(url)?.watchUrl ?? null);
  if (videos.some((url) => url === null)) return null;

  return {
    displayName, country, languages, avatar, banner, gallery: [...new Set<string>(gallery)], bio, discord,
    links, videos: [...new Set(videos as string[])], games, experience,
  };
}

export function isCompleteCasterDraft(draft: CasterApplicationDraft): boolean {
  return !!(draft.displayName && draft.country && draft.languages.length && draft.avatar &&
    draft.bio && hasAnnouncementDocumentText(draft.bio));
}
