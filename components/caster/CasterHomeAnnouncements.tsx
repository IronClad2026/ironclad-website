import { parseAnnouncementFeedProjection } from "@/lib/announcement-contract";
import { casterRpc } from "@/lib/caster/server";
import type { Locale } from "@/lib/i18n/config";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";
import { formatDateTime } from "@/lib/i18n/format";

export default async function CasterHomeAnnouncements({ locale, copy }: {
  locale: Locale;
  copy: PublicDictionary["announcements"];
}) {
  // This established public feed has no tournament join. Render only text
  // and publication dates, without read receipts, account state, or links.
  const result = await casterRpc<{ announcements?: unknown[] }>("list_active_announcements", {});
  const rows = Array.isArray(result?.announcements) ? result.announcements : null;
  const feed = rows ? parseAnnouncementFeedProjection({
    announcements: rows.slice(0, 3).map((row) =>
      row && typeof row === "object" && !Array.isArray(row) ? { ...row, linked_tournament_slug: null } : null),
  }) : null;

  return (
    <section id="public-home-announcements" aria-labelledby="public-home-announcements-title" data-caster-home-announcements
      className="scroll-mt-6 border-t border-white/10 bg-zinc-950/70 px-5 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1120px] space-y-5">
        <h2 id="public-home-announcements-title" className="text-xl font-bold text-white sm:text-2xl">{copy.title}</h2>
        {feed?.announcements.length ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {feed.announcements.map((announcement) => (
              <article key={announcement.id} className="space-y-2 border border-white/10 bg-black/25 p-4">
                <h3 className="break-words text-sm font-bold leading-6 sm:text-base">{announcement.title}</h3>
                <time className="block text-xs text-zinc-400" dateTime={announcement.publishedAt}>
                  {formatDateTime(announcement.publishedAt, locale, { kind: "utc" }, { dateStyle: "medium" })}
                </time>
                <p className="whitespace-pre-line break-words text-sm leading-6 text-zinc-300">{announcement.body}</p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-400">{feed ? copy.emptyDescription : copy.loadErrorDescription}</p>}
      </div>
    </section>
  );
}
