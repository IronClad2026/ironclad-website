"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markAnnouncementSeen } from "@/app/announcements/actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  dispatchAnnouncementSeenReconcile,
  writeAnonymousAnnouncementMarker,
  type PublicAnnouncement,
} from "@/lib/announcement-contract";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";

type AnnouncementCopy = PublicDictionary["announcements"];

export default function AnnouncementsFeed({
  announcements,
  copy,
  loadFailed,
}: {
  announcements: PublicAnnouncement[];
  copy: AnnouncementCopy;
  loadFailed: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const latest = loadFailed ? null : announcements[0] ?? null;

  useEffect(() => {
    if (!isLoaded || !latest) return;

    let active = true;
    const marker = {
      id: latest.id,
      publishedAt: latest.publishedAt,
    };
    if (isSignedIn) {
      void markAnnouncementSeen(latest.id)
        .then((result) => {
          if (active && result.ok) {
            dispatchAnnouncementSeenReconcile(marker);
          }
        })
        .catch(() => undefined);
    } else {
      writeAnonymousAnnouncementMarker(marker);
    }

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, latest]);

  if (loadFailed) {
    return (
      <section
        role="alert"
        className="mx-auto mt-10 max-w-3xl border border-red-500/25 bg-red-500/[0.06] p-6 text-center sm:p-8"
      >
        <h2 className="text-2xl font-black text-red-100">
          {copy.loadErrorTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-red-100/75 sm:text-base">
          {copy.loadErrorDescription}
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-6 min-h-11 border border-red-300/30 bg-red-400/10 px-6 font-black text-red-100 transition hover:bg-red-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          {copy.retry}
        </button>
      </section>
    );
  }

  if (announcements.length === 0) {
    return (
      <section className="mx-auto mt-10 max-w-3xl border border-white/10 bg-black/25 p-8 text-center sm:p-12">
        <h2 className="text-2xl font-black text-white">
          {copy.emptyTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
          {copy.emptyDescription}
        </p>
      </section>
    );
  }

  return (
    <ol
      aria-label={copy.feedLabel}
      className="mx-auto mt-10 grid max-w-4xl gap-6 sm:gap-8"
    >
      {announcements.map((announcement) => (
        <li key={announcement.id} className="min-w-0">
          <article className="overflow-hidden border border-white/10 bg-zinc-950/75 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            {announcement.mediaKind === "image" &&
            announcement.mediaUrl ? (
              // Supabase is the intentional public origin for this dedicated
              // bucket; a native image avoids coupling this feed to an image
              // transformation pipeline.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={announcement.mediaUrl}
                alt={
                  announcement.mediaDescription ||
                  interpolateTitle(copy.imageAltFallback, announcement.title)
                }
                className="max-h-[34rem] w-full object-contain bg-black"
                loading="lazy"
              />
            ) : null}

            {announcement.mediaKind === "video" &&
            announcement.mediaUrl ? (
              <video
                controls
                preload="metadata"
                aria-label={
                  announcement.mediaDescription ||
                  interpolateTitle(copy.videoLabelFallback, announcement.title)
                }
                className="max-h-[34rem] w-full bg-black object-contain"
              >
                <source
                  src={announcement.mediaUrl}
                  type={announcement.mediaMimeType ?? undefined}
                />
                {copy.videoUnsupported}
              </video>
            ) : null}

            <div className="min-w-0 p-5 sm:p-7 lg:p-8">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-300/85">
                <span>{copy.published}</span>
                <HydrationSafeLocalDateTime
                  value={announcement.publishedAt}
                  fallback={copy.publicationTimeUnavailable}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                  className="break-words normal-case tracking-normal text-zinc-400"
                />
              </div>
              <h2 className="mt-4 break-words text-2xl font-black leading-tight text-white sm:text-3xl">
                {announcement.title}
              </h2>
              <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                {announcement.body}
              </p>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

function interpolateTitle(template: string, title: string) {
  return template.replace("{title}", title);
}
