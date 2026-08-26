import "server-only";

import {
  isUuid,
  parseAnnouncementFeedProjection,
  parseAnnouncementNavigationProjection,
  type AnnouncementMarker,
  type PublicAnnouncement,
} from "@/lib/announcement-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PublicAnnouncementLoadResult =
  | { ok: true; announcements: PublicAnnouncement[] }
  | { ok: false; announcements: [] };

export type AuthenticatedAnnouncementNavigationState = {
  latest: AnnouncementMarker | null;
  unread: boolean;
};

export type AdminAnnouncement = AnnouncementMarker & {
  title: string;
  body: string;
  withdrawnAt: string | null;
};

export type AdminAnnouncementLoadResult =
  | { ok: true; announcements: AdminAnnouncement[] }
  | { ok: false; announcements: [] };

export async function loadPublicAnnouncements(): Promise<PublicAnnouncementLoadResult> {
  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("list_active_announcements");
    const parsed = error ? null : parseAnnouncementFeedProjection(data);

    if (!parsed) {
      logAnnouncementFailure("public-feed");
      return { ok: false, announcements: [] };
    }

    return { ok: true, announcements: parsed.announcements };
  } catch {
    logAnnouncementFailure("public-feed");
    return { ok: false, announcements: [] };
  }
}

export async function loadLatestPublicAnnouncement(): Promise<
  AnnouncementMarker | null | undefined
> {
  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc(
      "get_latest_active_announcement"
    );
    const parsed = error
      ? null
      : parseAnnouncementNavigationProjection(data, false);
    if (!parsed) {
      logAnnouncementFailure("public-latest");
      return undefined;
    }
    return parsed.latest;
  } catch {
    logAnnouncementFailure("public-latest");
    return undefined;
  }
}

export async function loadAuthenticatedAnnouncementNavigationState(
  clerkUserId: string
): Promise<AuthenticatedAnnouncementNavigationState | null> {
  if (!clerkUserId.trim()) return null;

  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc(
      "get_announcement_navigation_state",
      { p_clerk_user_id: clerkUserId }
    );
    const parsed = error
      ? null
      : parseAnnouncementNavigationProjection(data, true);
    if (!parsed || typeof parsed.unread !== "boolean") {
      logAnnouncementFailure("authenticated-navigation");
      return null;
    }
    return { latest: parsed.latest, unread: parsed.unread };
  } catch {
    logAnnouncementFailure("authenticated-navigation");
    return null;
  }
}

export async function markAuthenticatedAnnouncementSeen(
  clerkUserId: string,
  announcementId: string
) {
  if (!clerkUserId.trim() || !isUuid(announcementId)) return false;

  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("mark_announcement_seen", {
      p_clerk_user_id: clerkUserId,
      p_announcement_id: announcementId,
    });
    return !error && isMarkedProjection(data, announcementId);
  } catch {
    logAnnouncementFailure("mark-seen");
    return false;
  }
}

export async function loadAdminAnnouncements(): Promise<AdminAnnouncementLoadResult> {
  try {
    const client = createSupabaseAdminClient();
    const { data, error } = await client
      .from("announcements")
      .select(
        "id, title, body, published_at, withdrawn_at"
      )
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });

    if (error || !Array.isArray(data)) {
      logAnnouncementFailure("admin-feed");
      return { ok: false, announcements: [] };
    }

    const announcements = data.map(parseAdminAnnouncement);
    if (announcements.some((announcement) => announcement === null)) {
      logAnnouncementFailure("admin-feed");
      return { ok: false, announcements: [] };
    }

    return {
      ok: true,
      announcements: announcements as AdminAnnouncement[],
    };
  } catch {
    logAnnouncementFailure("admin-feed");
    return { ok: false, announcements: [] };
  }
}

function parseAdminAnnouncement(value: unknown): AdminAnnouncement | null {
  if (!isRecord(value)) return null;

  const projection = parseAnnouncementFeedProjection({
    announcements: [
      {
        id: value.id,
        title: value.title,
        body: value.body,
        media_kind: null,
        media_path: null,
        media_mime_type: null,
        media_description: null,
        published_at: value.published_at,
      },
    ],
  });
  const announcement = projection?.announcements[0];
  if (!announcement) return null;

  const withdrawnAt = nullableTimestamp(value.withdrawn_at);

  if (
    (value.withdrawn_at !== null && withdrawnAt === null)
  ) {
    return null;
  }

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    publishedAt: announcement.publishedAt,
    withdrawnAt,
  };
}

function isMarkedProjection(value: unknown, expectedId: string) {
  if (
    !isRecord(value) ||
    typeof value.marked !== "boolean" ||
    value.marked !== true ||
    !isRecord(value.latest)
  ) {
    return false;
  }
  const parsed = parseAnnouncementNavigationProjection(
    { latest: value.latest },
    false
  );
  return parsed?.latest?.id === expectedId.toLowerCase();
}

function nullableTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logAnnouncementFailure(operation: string) {
  console.error("Official Announcements operation failed.", { operation });
}
