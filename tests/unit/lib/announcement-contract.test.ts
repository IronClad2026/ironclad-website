import { describe, expect, it, vi } from "vitest";
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
  ANNOUNCEMENT_SEEN_STORAGE_KEY,
  buildAnnouncementMediaPublicUrl,
  compareAnnouncementMarkers,
  createAnnouncementMediaPath,
  getAnnouncementMediaExtension,
  hasAnnouncementMediaSignature,
  hasUnseenAnnouncement,
  parseAnnouncementFeedProjection,
  parseAnnouncementMediaPath,
  readAnonymousAnnouncementMarker,
  writeAnonymousAnnouncementMarker,
} from "@/lib/announcement-contract";

const id = "123e4567-e89b-42d3-a456-426614174000";
const older = { id, publishedAt: "2026-08-25T01:00:00.000Z" };
const newer = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  publishedAt: "2026-08-26T01:00:00.000Z",
};

describe("official announcement contract", () => {
  it.each([
    ["notice.jpg", "image/jpeg", ANNOUNCEMENT_LIMITS.imageBytes, "jpg"],
    ["notice.jpeg", "image/jpeg", ANNOUNCEMENT_LIMITS.imageBytes, "jpg"],
    ["notice.png", "image/png", ANNOUNCEMENT_LIMITS.imageBytes, "png"],
    ["notice.webp", "image/webp", ANNOUNCEMENT_LIMITS.imageBytes, "webp"],
    ["notice.mp4", "video/mp4", ANNOUNCEMENT_LIMITS.videoBytes, "mp4"],
    ["notice.webm", "video/webm", ANNOUNCEMENT_LIMITS.videoBytes, "webm"],
  ])("accepts %s at its exact hard limit", (fileName, contentType, size, extension) => {
    expect(getAnnouncementMediaExtension({ fileName, contentType, size })).toBe(
      extension
    );
  });

  it.each([
    ["empty.png", "image/png", 0],
    ["large.png", "image/png", ANNOUNCEMENT_LIMITS.imageBytes + 1],
    ["large.mp4", "video/mp4", ANNOUNCEMENT_LIMITS.videoBytes + 1],
    ["mismatch.png", "image/jpeg", 10],
    ["bad.gif", "image/gif", 10],
    ["bad.mov", "video/quicktime", 10],
  ])("rejects invalid media %s", (fileName, contentType, size) => {
    expect(getAnnouncementMediaExtension({ fileName, contentType, size })).toBeNull();
  });

  it("creates only canonical identity-free media paths and public URLs", () => {
    const path = createAnnouncementMediaPath("jpg", id);
    expect(path).toBe(`media/${id}.jpg`);
    expect(path).not.toContain("admin");
    expect(parseAnnouncementMediaPath(path ?? "")).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
    });
    expect(buildAnnouncementMediaPublicUrl(path ?? "")).toContain(
      `/storage/v1/object/public/announcement-media/${path}`
    );
    expect(parseAnnouncementMediaPath(`media/${id}.jpeg`)).toBeNull();
    expect(parseAnnouncementMediaPath("media/../../secret.png")).toBeNull();
  });

  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0x00]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]],
    ["video/mp4", [0, 0, 0, 24, ...ascii("ftyp"), ...ascii("isom")]],
    ["video/webm", [0x1a, 0x45, 0xdf, 0xa3]],
  ] as const)("recognizes %s magic bytes", (mimeType, bytes) => {
    expect(
      hasAnnouncementMediaSignature(
        Uint8Array.from(bytes),
        mimeType
      )
    ).toBe(true);
    expect(
      hasAnnouncementMediaSignature(
        Uint8Array.from([0, 1, 2, 3]),
        mimeType
      )
    ).toBe(false);
  });

  it("parses only newest-first public-safe feed projections", () => {
    const projection = parseAnnouncementFeedProjection({
      announcements: [
        announcementRow(newer),
        announcementRow(older),
      ],
    });
    expect(projection?.announcements.map((item) => item.id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(
      parseAnnouncementFeedProjection({
        announcements: [announcementRow(older), announcementRow(newer)],
      })
    ).toBeNull();
    expect(
      parseAnnouncementFeedProjection({
        announcements: [
          { ...announcementRow(newer), publisher_clerk_user_id: "user_private" },
        ],
      })
    ).toBeNull();

    expect(
      parseAnnouncementFeedProjection({
        announcements: [announcementRow(newer, "academy-owner-check")],
      })?.announcements[0].tournamentHref
    ).toBe("/tournaments?tournament=academy-owner-check");
    expect(
      parseAnnouncementFeedProjection({
        announcements: [announcementRow(newer, "../private")],
      })
    ).toBeNull();
  });

  it("uses a monotonic timestamp and id cursor for withdrawal fallback", () => {
    expect(compareAnnouncementMarkers(newer, older)).toBeGreaterThan(0);
    expect(hasUnseenAnnouncement(newer, older)).toBe(true);
    expect(hasUnseenAnnouncement(older, newer)).toBe(false);
    expect(hasUnseenAnnouncement(older, older)).toBe(false);
    expect(hasUnseenAnnouncement(null, null)).toBe(false);

    const sameMillisecondLowerId = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      publishedAt: "2026-08-26T01:00:00.123Z",
    };
    const sameMillisecondHigherId = {
      id: "223e4567-e89b-42d3-a456-426614174000",
      publishedAt: "2026-08-26T01:00:00.123Z",
    };
    expect(
      compareAnnouncementMarkers(
        sameMillisecondHigherId,
        sameMillisecondLowerId
      )
    ).toBeGreaterThan(0);
  });

  it("persists and announces a namespaced anonymous marker", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    const target = new EventTarget() as Window;
    const listener = vi.fn();
    target.addEventListener(ANNOUNCEMENT_SEEN_RECONCILE_EVENT, listener);

    expect(writeAnonymousAnnouncementMarker(newer, storage, target)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      ANNOUNCEMENT_SEEN_STORAGE_KEY,
      JSON.stringify(newer)
    );
    expect(readAnonymousAnnouncementMarker(storage)).toEqual({
      available: true,
      marker: newer,
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("never replaces a newer anonymous marker with a stale marker", () => {
    const values = new Map<string, string>([
      [ANNOUNCEMENT_SEEN_STORAGE_KEY, JSON.stringify(newer)],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    const target = new EventTarget() as Window;
    const listener = vi.fn();
    target.addEventListener(ANNOUNCEMENT_SEEN_RECONCILE_EVENT, listener);

    expect(writeAnonymousAnnouncementMarker(older, storage, target)).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(readAnonymousAnnouncementMarker(storage).marker).toEqual(newer);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("fails safely when anonymous storage is blocked", () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    expect(readAnonymousAnnouncementMarker(blocked)).toEqual({
      available: false,
      marker: null,
    });
    expect(writeAnonymousAnnouncementMarker(newer, blocked)).toBe(false);
  });
});

function announcementRow(
  marker: { id: string; publishedAt: string },
  linkedTournamentSlug: string | null = null
) {
  return {
    id: marker.id,
    title: `Title ${marker.id}`,
    body: "Plain text body",
    media_kind: null,
    media_path: null,
    media_mime_type: null,
    media_description: null,
    linked_tournament_slug: linkedTournamentSlug,
    published_at: marker.publishedAt,
  };
}

function ascii(value: string) {
  return Array.from(value).map((character) => character.charCodeAt(0));
}
