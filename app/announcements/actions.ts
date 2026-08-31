"use server";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isUuid, type AnnouncementMarker } from "@/lib/announcement-contract";
import {
  loadAuthenticatedAnnouncementNavigationState,
  loadLatestPublicAnnouncement,
  markAuthenticatedAnnouncementSeen,
} from "@/lib/announcements";

export type AnnouncementNavigationStateResult =
  | {
      ok: true;
      viewer: "anonymous";
      latest: AnnouncementMarker | null;
    }
  | {
      ok: true;
      viewer: "authenticated";
      latest: AnnouncementMarker | null;
      unread: boolean;
    }
  | { ok: false };

export type AnnouncementSeenResult =
  | { ok: true }
  | { ok: false };

export async function loadAnnouncementNavigationState(): Promise<AnnouncementNavigationStateResult> {
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    return { ok: false };
  }

  if (userId) {
    const state = await loadAuthenticatedAnnouncementNavigationState(userId);
    return state
      ? {
          ok: true,
          viewer: "authenticated",
          latest: state.latest,
          unread: state.unread,
        }
      : { ok: false };
  }

  const latest = await loadLatestPublicAnnouncement();
  return latest === undefined
    ? { ok: false }
    : { ok: true, viewer: "anonymous", latest };
}

export async function markAnnouncementSeen(
  announcementId: string
): Promise<AnnouncementSeenResult> {
  if (!isUuid(announcementId)) return { ok: false };

  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    return { ok: false };
  }
  if (!userId) return { ok: false };

  await requireCurrentAccountLegalAcceptance();

  const marked = await markAuthenticatedAnnouncementSeen(
    userId,
    announcementId
  );
  return marked ? { ok: true } : { ok: false };
}
