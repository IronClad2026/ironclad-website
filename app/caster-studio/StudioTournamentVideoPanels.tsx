import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { getTournamentVideoCopy } from "@/lib/caster/tournament-video-copy";
import { loadCasterVideoWorkspace } from "@/lib/caster/tournament-video-server";
import StudioTournamentVideos from "./StudioTournamentVideos";

const panel = "space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-6";

export async function loadStudioTournamentVideos(actor: string, locale: Locale) {
  const copy = getTournamentVideoCopy(locale);
  const workspace = await loadCasterVideoWorkspace(actor);
  const published = (workspace?.media ?? []).filter((video) => video.publiclyVisible)
    .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt));
  const history = [...(workspace?.media ?? [])].sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return {
    available: workspace?.publishedCount != null && workspace.coveredTournamentIds != null,
    portfolio: published,
    publishedCount: workspace?.publishedCount ?? 0,
    tournamentIds: workspace?.coveredTournamentIds ?? [],
    recent: published.slice(0, 4).map(({ id, title, tournamentTitle, tournamentHref, publishedAt }) => ({ id, title, tournamentTitle, tournamentHref, publishedAt })),
    videos: workspace ? <StudioTournamentVideos locale={locale} initialVideos={workspace.media} tournaments={workspace.tournaments} canPublish={workspace.canPublish} />
      : <section className={panel} role="status"><h2 className="text-xl font-bold">{copy.videos}</h2><p className="text-zinc-300">{copy.invalid}</p></section>,
    history: <section className={panel} aria-labelledby="published-coverage-heading">
      <h2 id="published-coverage-heading" className="text-xl font-bold text-white">{copy.history}</h2>
      <p className="text-sm text-zinc-400">{copy.historyIntro}</p>
      {!history.length && <p className="rounded-lg border border-white/10 p-4 text-sm text-zinc-400">{workspace ? copy.historyEmpty : copy.invalid}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {history.map((video) => <li key={video.id} className="space-y-1 rounded-xl border border-white/10 bg-black/35 p-4">
          <p className="break-words font-semibold">{video.title}</p>
          <p className="text-sm text-zinc-400">{[video.tournamentTitle, video.scopeLabel].filter(Boolean).join(" · ")}</p>
          <time className="text-sm text-zinc-400" dateTime={video.publishedAt}>{date.format(new Date(video.publishedAt))}</time>
          <div className="flex flex-wrap gap-x-4 text-sm font-semibold text-orange-200">
            {video.publiclyVisible ? <>
              <Link href={video.tournamentHref} className="inline-flex min-h-11 items-center underline">{copy.viewEntry}</Link>
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">{copy.watch}<ArrowUpRight aria-hidden size={15} /></a>
            </> : <span className="text-zinc-400">{video.moderationStatus === "visible" ? copy.unpublished : copy.moderated}</span>}
          </div>
        </li>)}
      </ul>
    </section>,
  };
}
