import { supabaseUrl } from "@/lib/supabase-config";

export const ANNOUNCEMENT_LIMITS = {
  title: 160,
  body: 10_000,
  mediaDescription: 500,
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
} as const;

export const ANNOUNCEMENT_MEDIA_BUCKET = "announcement-media" as const;
export const ANNOUNCEMENT_SEEN_STORAGE_KEY =
  "ironclad:announcements:last-seen" as const;
export const ANNOUNCEMENT_SEEN_RECONCILE_EVENT =
  "ironclad:announcement-seen-reconcile" as const;

export const ANNOUNCEMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const ANNOUNCEMENT_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
] as const;
export const ANNOUNCEMENT_MEDIA_MIME_TYPES = [
  ...ANNOUNCEMENT_IMAGE_MIME_TYPES,
  ...ANNOUNCEMENT_VIDEO_MIME_TYPES,
] as const;

export type AnnouncementMediaKind = "image" | "video";
export type AnnouncementMediaMimeType =
  (typeof ANNOUNCEMENT_MEDIA_MIME_TYPES)[number];
export type AnnouncementMediaExtension =
  | "jpg"
  | "png"
  | "webp"
  | "mp4"
  | "webm";

export type AnnouncementMarker = {
  id: string;
  publishedAt: string;
};

export type PublicAnnouncement = AnnouncementMarker & {
  title: string;
  body: string;
  mediaKind: AnnouncementMediaKind | null;
  mediaMimeType: AnnouncementMediaMimeType | null;
  mediaDescription: string | null;
  mediaUrl: string | null;
};

export type AnnouncementFeedProjection = {
  announcements: PublicAnnouncement[];
};

export type AnnouncementNavigationProjection = {
  latest: AnnouncementMarker | null;
  unread?: boolean;
};

export type AnonymousAnnouncementMarkerRead = {
  available: boolean;
  marker: AnnouncementMarker | null;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

const extensionByMimeType: Record<
  AnnouncementMediaMimeType,
  AnnouncementMediaExtension
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const mimeTypeByExtension: Record<
  AnnouncementMediaExtension,
  AnnouncementMediaMimeType
> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

const mediaPathPattern =
  /^media\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp|mp4|webm)$/i;
const publicUrlPrefix =
  `${supabaseUrl}/storage/v1/object/public/${ANNOUNCEMENT_MEDIA_BUCKET}/`;

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

export function parseAnnouncementMarker(
  value: unknown
): AnnouncementMarker | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "published_at"])) {
    return null;
  }

  if (!isUuid(value.id) || !isTimestampInput(value.published_at)) {
    return null;
  }

  return {
    id: value.id.toLowerCase(),
    publishedAt: new Date(value.published_at).toISOString(),
  };
}

export function parseAnnouncementFeedProjection(
  value: unknown
): AnnouncementFeedProjection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["announcements"]) ||
    !Array.isArray(value.announcements)
  ) {
    return null;
  }

  const announcements = value.announcements.map(parsePublicAnnouncement);
  if (announcements.some((announcement) => announcement === null)) {
    return null;
  }

  const parsed = announcements as PublicAnnouncement[];
  for (let index = 1; index < parsed.length; index += 1) {
    if (compareAnnouncementMarkers(parsed[index - 1], parsed[index]) < 0) {
      return null;
    }
  }

  return { announcements: parsed };
}

export function parseAnnouncementNavigationProjection(
  value: unknown,
  includeUnread: boolean
): AnnouncementNavigationProjection | null {
  const expectedKeys = includeUnread ? ["latest", "unread"] : ["latest"];
  if (!isRecord(value) || !hasOnlyKeys(value, expectedKeys)) return null;

  const latest = value.latest === null
    ? null
    : parseAnnouncementMarker(value.latest);
  if (value.latest !== null && !latest) return null;

  if (includeUnread && typeof value.unread !== "boolean") return null;

  return includeUnread
    ? { latest, unread: value.unread as boolean }
    : { latest };
}

export function getAnnouncementMediaExtension(input: {
  fileName: string;
  contentType: string;
  size: number;
}): AnnouncementMediaExtension | null {
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    !ANNOUNCEMENT_MEDIA_MIME_TYPES.includes(
      input.contentType as AnnouncementMediaMimeType
    )
  ) {
    return null;
  }

  const mimeType = input.contentType as AnnouncementMediaMimeType;
  const kind = getAnnouncementMediaKind(mimeType);
  const limit = kind === "image"
    ? ANNOUNCEMENT_LIMITS.imageBytes
    : ANNOUNCEMENT_LIMITS.videoBytes;
  if (input.size > limit) return null;

  const suppliedExtension = input.fileName.match(/\.([a-z0-9]+)$/i)?.[1];
  const expectedExtension = extensionByMimeType[mimeType];
  const acceptedExtensions = mimeType === "image/jpeg"
    ? ["jpg", "jpeg"]
    : [expectedExtension];

  return suppliedExtension &&
    acceptedExtensions.includes(suppliedExtension.toLowerCase())
    ? expectedExtension
    : null;
}

export function getAnnouncementMediaKind(
  mimeType: AnnouncementMediaMimeType
): AnnouncementMediaKind {
  return mimeType.startsWith("image/") ? "image" : "video";
}

export function createAnnouncementMediaPath(
  extension: AnnouncementMediaExtension,
  id: string
) {
  if (!isUuid(id) || !Object.values(extensionByMimeType).includes(extension)) {
    return null;
  }
  return `media/${id.toLowerCase()}.${extension}`;
}

export function parseAnnouncementMediaPath(path: string) {
  const match = mediaPathPattern.exec(path);
  if (!match) return null;

  const extension = match[2].toLowerCase() as AnnouncementMediaExtension;
  const mimeType = mimeTypeByExtension[extension];
  return {
    extension,
    kind: getAnnouncementMediaKind(mimeType),
    mimeType,
    path: `media/${match[1].toLowerCase()}.${extension}`,
  };
}

export function buildAnnouncementMediaPublicUrl(path: string) {
  const parsed = parseAnnouncementMediaPath(path);
  return parsed ? `${publicUrlPrefix}${parsed.path}` : null;
}

export function parseAnnouncementMediaPublicUrl(publicUrl: string) {
  if (!publicUrl.startsWith(publicUrlPrefix)) return null;
  const path = publicUrl.slice(publicUrlPrefix.length);
  const parsed = parseAnnouncementMediaPath(path);
  if (!parsed) return null;
  const canonicalUrl = buildAnnouncementMediaPublicUrl(parsed.path);
  return canonicalUrl === publicUrl
    ? { ...parsed, publicUrl: canonicalUrl }
    : null;
}

export function hasAnnouncementMediaSignature(
  bytes: Uint8Array,
  mimeType: AnnouncementMediaMimeType
) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
  }
  if (mimeType === "image/webp") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  if (mimeType === "video/mp4") {
    return bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp";
  }
  return bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
}

export function readAnonymousAnnouncementMarker(
  storage?: StorageReader | null
): AnonymousAnnouncementMarkerRead {
  const source = storage ?? getBrowserStorage();
  if (!source) return { available: false, marker: null };

  try {
    const value = source.getItem(ANNOUNCEMENT_SEEN_STORAGE_KEY);
    if (value === null) return { available: true, marker: null };
    return {
      available: true,
      marker: parseStoredAnnouncementMarker(JSON.parse(value)),
    };
  } catch {
    return { available: false, marker: null };
  }
}

export function writeAnonymousAnnouncementMarker(
  marker: AnnouncementMarker,
  storage?: StorageWriter | null,
  eventTarget?: Window | null
) {
  const parsed = parseStoredAnnouncementMarker(marker);
  const source = storage ?? getBrowserStorage();
  const target = eventTarget ?? getBrowserWindow();
  if (!parsed || !source) return false;

  const current = readAnonymousAnnouncementMarker(source);
  if (!current.available) return false;
  const markerToKeep = current.marker &&
      compareAnnouncementMarkers(current.marker, parsed) >= 0
    ? current.marker
    : parsed;

  try {
    if (markerToKeep === parsed) {
      source.setItem(
        ANNOUNCEMENT_SEEN_STORAGE_KEY,
        JSON.stringify(parsed)
      );
    }
  } catch {
    return false;
  }

  dispatchAnnouncementSeenReconcile(markerToKeep, target);
  return true;
}

export function hasUnseenAnnouncement(
  latest: AnnouncementMarker | null,
  seen: AnnouncementMarker | null
) {
  return latest !== null && (seen === null || compareAnnouncementMarkers(latest, seen) > 0);
}

export function compareAnnouncementMarkers(
  left: AnnouncementMarker,
  right: AnnouncementMarker
) {
  const timeDifference = Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
  if (timeDifference !== 0) return Math.sign(timeDifference);
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function subscribeToAnonymousAnnouncementMarker(
  onChange: () => void,
  eventTarget?: Window | null
) {
  const target = eventTarget ?? getBrowserWindow();
  if (!target) return () => undefined;

  const handleReconcile = () => onChange();
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === ANNOUNCEMENT_SEEN_STORAGE_KEY ||
      event.key === null
    ) {
      onChange();
    }
  };

  target.addEventListener(
    ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
    handleReconcile
  );
  target.addEventListener("storage", handleStorage);
  return () => {
    target.removeEventListener(
      ANNOUNCEMENT_SEEN_RECONCILE_EVENT,
      handleReconcile
    );
    target.removeEventListener("storage", handleStorage);
  };
}

export function dispatchAnnouncementSeenReconcile(
  marker: AnnouncementMarker,
  target: Window | null = getBrowserWindow()
) {
  if (!target) return;
  target.dispatchEvent(
    new CustomEvent(ANNOUNCEMENT_SEEN_RECONCILE_EVENT, {
      detail: marker,
    })
  );
}

function parsePublicAnnouncement(value: unknown): PublicAnnouncement | null {
  const keys = [
    "id",
    "title",
    "body",
    "media_kind",
    "media_path",
    "media_mime_type",
    "media_description",
    "published_at",
  ];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;

  const marker = parseAnnouncementMarker({
    id: value.id,
    published_at: value.published_at,
  });
  if (
    !marker ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > ANNOUNCEMENT_LIMITS.title ||
    typeof value.body !== "string" ||
    !value.body.trim() ||
    value.body.length > ANNOUNCEMENT_LIMITS.body
  ) {
    return null;
  }

  if (
    value.media_kind === null &&
    value.media_path === null &&
    value.media_mime_type === null &&
    value.media_description === null
  ) {
    return {
      ...marker,
      title: value.title,
      body: value.body,
      mediaKind: null,
      mediaMimeType: null,
      mediaDescription: null,
      mediaUrl: null,
    };
  }

  if (
    (value.media_kind !== "image" && value.media_kind !== "video") ||
    typeof value.media_path !== "string" ||
    !ANNOUNCEMENT_MEDIA_MIME_TYPES.includes(
      value.media_mime_type as AnnouncementMediaMimeType
    ) ||
    typeof value.media_description !== "string" ||
    !value.media_description.trim() ||
    value.media_description.length > ANNOUNCEMENT_LIMITS.mediaDescription
  ) {
    return null;
  }

  const parsedPath = parseAnnouncementMediaPath(value.media_path);
  const mimeType = value.media_mime_type as AnnouncementMediaMimeType;
  const mediaUrl = buildAnnouncementMediaPublicUrl(value.media_path);
  if (
    !parsedPath ||
    !mediaUrl ||
    parsedPath.kind !== value.media_kind ||
    parsedPath.mimeType !== mimeType
  ) {
    return null;
  }

  return {
    ...marker,
    title: value.title,
    body: value.body,
    mediaKind: value.media_kind,
    mediaMimeType: mimeType,
    mediaDescription: value.media_description,
    mediaUrl,
  };
}

function parseStoredAnnouncementMarker(value: unknown): AnnouncementMarker | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "publishedAt"])) {
    return null;
  }
  if (!isUuid(value.id) || !isTimestampInput(value.publishedAt)) return null;
  return {
    id: value.id.toLowerCase(),
    publishedAt: new Date(value.publishedAt).toISOString(),
  };
}

function isTimestampInput(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index]);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getBrowserWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}
