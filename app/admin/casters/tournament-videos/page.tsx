import Link from "next/link";
import { notFound } from "next/navigation";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { casterRpc } from "@/lib/caster/server";
import { parseCasterTournamentChoices, parseCasterTournamentVideos } from "@/lib/caster/tournament-video";
import { casterAdminApplicationPage, casterAdminDate } from "../admin-application-contracts";
import { casterAdminFrame, casterAdminPanel, casterAdminSecondary } from "../admin-application-styles";
import CasterAdminNavigation from "../CasterAdminNavigation";
import { currentCastingAdmin } from "../coverage/data";
import VideoModerationForm from "./VideoModerationForm";

export const dynamic = "force-dynamic";
const path = "/admin/casters/tournament-videos";

export default async function CasterTournamentVideosAdminPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  if (!isCasterProgramEnabled()) notFound();
  const actor = await currentCastingAdmin();
  if (!actor) return <AdminAccessRequired />;
  const page = casterAdminApplicationPage((await searchParams).page);
  const result = await casterRpc<{ status: string; media?: unknown; tournaments?: unknown; has_more?: boolean }>("caster_media_admin_list", {
    p_actor: actor, p_offset: (page - 1) * 25,
  });
  if (!(await currentCastingAdmin())) return <AdminAccessRequired />;
  const videos = parseCasterTournamentVideos(result?.media);
  const tournaments = parseCasterTournamentChoices(result?.tournaments);
  return <main className={casterAdminFrame}>
    <header><h1 className="text-3xl font-black sm:text-4xl">Tournament video moderation</h1><p className="mt-2 text-zinc-400">Review caster-published videos and their competition associations. Decisions apply to the caster profile and Tournament Media.</p></header>
    <CasterAdminNavigation current="videos" />
    {result?.status !== "ok" ? <p className={casterAdminPanel} role="alert">Caster tournament videos are temporarily unavailable.</p> : !videos.length ? <p className={casterAdminPanel}>No caster tournament videos on this page.</p> : <ul className="grid gap-4 lg:grid-cols-2">
      {videos.map((video) => <li className={`${casterAdminPanel} space-y-3`} key={video.id}>
        <h2 className="break-words text-xl font-bold">{video.title}</h2>
        <p className="text-sm text-zinc-400">{[video.casterName ?? "Official caster", video.tournamentTitle, video.scopeLabel].filter(Boolean).join(" · ")}</p>
        <p className="text-sm text-zinc-400">{casterAdminDate(video.publishedAt)} · {video.moderationStatus === "visible" ? video.publiclyVisible ? "Public" : "Unpublished" : video.moderationStatus}</p>
        {video.description && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{video.description}</p>}
        <div className="flex flex-wrap gap-x-4"><a className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-200 underline" href={video.url} target="_blank" rel="noopener noreferrer">Inspect video</a>
          {video.publiclyVisible && <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-200 underline" href={video.tournamentHref}>View Tournament Media</Link>}</div>
        {video.moderationStatus !== "removed" && <VideoModerationForm key={video.version} video={video} tournaments={tournaments} />}
      </li>)}
    </ul>}
    {(page > 1 || result?.has_more) && <nav aria-label="Tournament video pages" className="flex gap-3">
      {page > 1 && <Link href={`${path}?page=${page - 1}`} className={casterAdminSecondary}>Previous page</Link>}
      {result?.has_more && <Link href={`${path}?page=${page + 1}`} className={casterAdminSecondary}>Next page</Link>}
    </nav>}
  </main>;
}
