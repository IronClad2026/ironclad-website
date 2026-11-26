import "server-only";

import { normalizeAnnouncementHref, parseAnnouncementDocument } from "@/lib/announcement-document";
import { CASTER_APPLICATION_LIMITS, isCasterMediaId } from "./application";
import { isCasterProgramEnabled } from "./environment";
import { isCasterPublicSlug, type PublicCasterCard, type PublicCasterProfile } from "./publication";
import { casterRpc } from "./server";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shortList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || !value.every((entry) => typeof entry === "string")) return null;
  return value;
}

function toCard(value: unknown): PublicCasterCard | null {
  if (!record(value) || !isCasterPublicSlug(value.slug) || !isCasterMediaId(value.publication_id) ||
    !isCasterMediaId(value.avatar) || typeof value.display_name !== "string" || !value.display_name.trim()) return null;
  const languages = shortList(value.languages, CASTER_APPLICATION_LIMITS.languages);
  const games = shortList(value.games, CASTER_APPLICATION_LIMITS.games);
  const platforms = shortList(value.platforms, CASTER_APPLICATION_LIMITS.links + CASTER_APPLICATION_LIMITS.videos);
  if (!languages?.length || !games || !platforms) return null;
  return {
    slug: value.slug, publication_id: value.publication_id, display_name: value.display_name,
    avatar: value.avatar, languages, games, platforms,
  };
}

function publicHttps(value: unknown): string | null {
  const url = normalizeAnnouncementHref(value);
  return url?.startsWith("https://") ? url : null;
}

export async function loadPublicCasterDirectory({ offset = 0, limit = 24 }: { offset?: number; limit?: number } = {}): Promise<PublicCasterCard[]> {
  if (!isCasterProgramEnabled() || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
  const rows = await casterRpc<unknown>("caster_phase3_directory", { p_offset: offset, p_limit: limit });
  return Array.isArray(rows) ? rows.flatMap((row) => {
    const card = toCard(row);
    return card ? [card] : [];
  }) : [];
}

export async function loadPublicCasterShowcase(): Promise<PublicCasterCard[]> {
  const profiles = new Map<string, PublicCasterCard>();
  const pageSize = 100;
  for (let offset = 0; offset <= 100_000; offset += pageSize) {
    const cards = await loadPublicCasterDirectory({ offset, limit: pageSize });
    for (const card of cards) profiles.set(card.slug, card);
    if (cards.length < pageSize) break;
  }
  return [...profiles.values()];
}

export async function loadPublicCasterProfile(slug: string): Promise<PublicCasterProfile | null> {
  if (!isCasterProgramEnabled() || !isCasterPublicSlug(slug)) return null;
  const data = await casterRpc<unknown>("caster_phase3_public_profile", { p_slug: slug });
  const card = toCard(data);
  if (!record(data) || !card || card.slug !== slug || typeof data.experience !== "string" ||
    (data.banner !== null && !isCasterMediaId(data.banner))) return null;
  const bio = parseAnnouncementDocument(data.bio);
  const gallery = shortList(data.gallery, CASTER_APPLICATION_LIMITS.gallery);
  const videos = shortList(data.videos, CASTER_APPLICATION_LIMITS.videos);
  if (!bio || !gallery?.every(isCasterMediaId) || !videos || !Array.isArray(data.links) ||
    data.links.length > CASTER_APPLICATION_LIMITS.links) return null;
  const links = data.links.flatMap((entry) => {
    if (!record(entry) || typeof entry.label !== "string") return [];
    const url = publicHttps(entry.url);
    return url ? [{ label: entry.label, url }] : [];
  });
  return {
    ...card, banner: data.banner, bio, experience: data.experience,
    links, videos: videos.flatMap((entry) => publicHttps(entry) ?? []), gallery,
    country: typeof data.country === "string" && /^[A-Z]{2}$/.test(data.country) ? data.country : null,
  };
}
