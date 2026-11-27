"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Film, Plus } from "lucide-react";
import {
  CASTER_TOURNAMENT_VIDEO_PATH, parseCasterTournamentVideoAction,
  type CasterTournamentChoice, type CasterTournamentContexts, type CasterTournamentVideo,
} from "@/lib/caster/tournament-video";
import { TOURNAMENT_MEDIA_LIMITS } from "@/lib/tournament-media";
import { getTournamentVideoCopy } from "@/lib/caster/tournament-video-copy";
import type { Locale } from "@/lib/i18n/config";

export const studioVideoPanel = "space-y-4 rounded-2xl border border-white/10 bg-zinc-950 p-4 sm:p-6";
const input = "min-h-11 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-400 focus:outline-2 focus:outline-orange-300";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-55";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-orange-400/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-55";
const empty: CasterTournamentContexts = { divisions: [], matches: [] };

type Draft = { tournamentId: string; divisionId: string; matchId: string; title: string; description: string; url: string };
const blank: Draft = { tournamentId: "", divisionId: "", matchId: "", title: "", description: "", url: "" };

async function api(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch(CASTER_TOURNAMENT_VIDEO_PATH, {
    method: "POST", credentials: "same-origin", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json() as { status: string; media?: CasterTournamentVideo } & Partial<CasterTournamentContexts>;
  return result;
}

export default function StudioTournamentVideos({ initialVideos, tournaments, locale, canPublish }: {
  initialVideos: CasterTournamentVideo[]; tournaments: CasterTournamentChoice[]; locale: Locale; canPublish: boolean;
}) {
  const copy = getTournamentVideoCopy(locale);
  const router = useRouter();
  const [items, setItems] = useState(initialVideos);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<CasterTournamentVideo | null>(null);
  const [form, setForm] = useState(false);
  const [preview, setPreview] = useState(false);
  const [contexts, setContexts] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; status: string } | null>(null);

  useEffect(() => {
    if (!form || !draft.tournamentId) return;
    const controller = new AbortController();
    void api({ action: "contexts", tournamentId: draft.tournamentId }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ok" && result.divisions && result.matches) {
        setContexts({ divisions: result.divisions, matches: result.matches });
      } else setNotice({ ok: false, status: result.status });
    }).catch(() => {
      if (!controller.signal.aborted) setNotice({ ok: false, status: "unavailable" });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [form, draft.tournamentId]);

  function start(video: CasterTournamentVideo | null) {
    setNotice(null);
    setEditing(video);
    setContexts(empty);
    setLoading(Boolean(video?.tournamentId));
    setDraft(video ? {
      tournamentId: video.tournamentId, divisionId: video.divisionId ?? "", matchId: video.matchId ?? "",
      title: video.title, description: video.description ?? "", url: video.url,
    } : blank);
    setPreview(false);
    setForm(true);
  }

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setNotice(null);
    setDraft((previous) => ({ ...previous, [key]: value,
      ...(key === "tournamentId" ? { divisionId: "", matchId: "" } : key === "divisionId" ? { matchId: "" } : {}),
    }));
    if (key === "tournamentId") {
      setContexts(empty);
      setLoading(Boolean(value));
    }
  }

  function videoAction() {
    return { ...draft, action: "save", mediaId: editing?.id ?? null, version: editing?.version ?? null,
      divisionId: draft.divisionId || null, matchId: draft.matchId || null };
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parseCasterTournamentVideoAction(videoAction())) {
      setNotice({ ok: false, status: "invalid" });
      return;
    }
    setNotice(null);
    setPreview(true);
  }

  async function submit(video?: CasterTournamentVideo) {
    setPending(true);
    setNotice(null);
    try {
      const result = await api(video ? { action: "unpublish", mediaId: video.id, version: video.version } : videoAction());
      if (result.status !== "ok" || !result.media) {
        setNotice({ ok: false, status: result.status });
        return;
      }
      const next = result.media;
      setItems((previous) => [next, ...previous.filter((row) => row.id !== next.id)]);
      setConfirmUnpublish(null);
      setPreview(false);
      setForm(false);
      setNotice({ ok: true, status: video ? "unpublished" : "published" });
      router.refresh();
    } catch {
      setNotice({ ok: false, status: "unavailable" });
    } finally {
      setPending(false);
    }
  }

  const tournamentTitle = tournaments.find((tournament) => tournament.id === draft.tournamentId)?.title;
  const division = contexts.divisions.find((item) => item.id === draft.divisionId);
  const match = contexts.matches.find((item) => item.id === draft.matchId);
  const watchUrl = parseCasterTournamentVideoAction(videoAction());

  return <div className="space-y-4">
    <section className={studioVideoPanel} aria-labelledby="tournament-videos-title" id={!canPublish || !tournaments.length || form ? "publish-tournament-video" : undefined} tabIndex={-1}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="tournament-videos-title" className="text-2xl font-bold tracking-tight text-white">{copy.videos}</h2>
          <p className="max-w-2xl text-sm text-zinc-400">{copy.intro}</p>
        </div>
        {!form && canPublish && tournaments.length > 0 && <button id="publish-tournament-video" type="button" className={primary} onClick={() => start(null)}><Plus aria-hidden size={16} />{copy.publish}</button>}
      </div>
      {!canPublish && <p className="rounded-lg border border-orange-400/25 bg-orange-500/10 p-3 text-sm text-orange-100">{copy.profileRequired}</p>}
      {!tournaments.length && <p className="text-sm text-zinc-400">{copy.noTournaments}</p>}
      {notice && <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "text-sm font-semibold text-orange-200" : "text-sm text-red-200"}>
        {notice.status === "published" ? copy.published : notice.status === "unpublished" ? copy.unpublished :
          notice.status === "duplicate" ? copy.duplicate : notice.status === "profile_required" ? copy.profileRequired :
          notice.status === "conflict" || notice.status === "moderated" ? copy.changed : copy.invalid}
      </p>}
      {form && !preview && <form aria-busy={pending} className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2" onSubmit={review}>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">{copy.url}<input className={input} type="url" maxLength={TOURNAMENT_MEDIA_LIMITS.url} required value={draft.url} onChange={(event) => change("url", event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">{copy.title}<input className={input} required maxLength={TOURNAMENT_MEDIA_LIMITS.title} value={draft.title} onChange={(event) => change("title", event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">{copy.description}<textarea className={input} rows={3} maxLength={TOURNAMENT_MEDIA_LIMITS.description} value={draft.description} onChange={(event) => change("description", event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">{copy.tournament}<select className={input} required value={draft.tournamentId} onChange={(event) => change("tournamentId", event.target.value)}>
          <option value="">{copy.chooseTournament}</option>{tournaments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm font-medium">{copy.division}<select className={input} disabled={!draft.tournamentId || loading || !contexts.divisions.length} value={draft.divisionId} onChange={(event) => change("divisionId", event.target.value)}>
          <option value="">{copy.wholeTournament}</option>{contexts.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm font-medium">{copy.match}<select className={input} disabled={!draft.divisionId || loading} value={draft.matchId} onChange={(event) => change("matchId", event.target.value)}>
          <option value="">{copy.wholeDivision}</option>{contexts.matches.filter((item) => item.divisionId === draft.divisionId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        {loading && <p role="status" className="text-sm text-zinc-400 sm:col-span-2">{copy.loading}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={primary} disabled={loading || !canPublish} type="submit">{copy.preview}</button><button type="button" className={secondary} onClick={() => setForm(false)}>{copy.cancel}</button></div>
      </form>}
      {form && preview && <div className="space-y-3 rounded-xl border border-orange-400/30 bg-black/40 p-4" aria-busy={pending}>
        <h3 className="text-lg font-bold">{copy.preview}</h3>
        <p className="font-semibold text-white">{draft.title}</p><p className="text-sm text-zinc-400">{[tournamentTitle, division?.name, match?.label].filter(Boolean).join(" · ")}</p>
        {draft.description && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{draft.description}</p>}
        {watchUrl?.action === "save" && <a href={watchUrl.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-orange-200 underline">{copy.watch}<ArrowUpRight aria-hidden size={15} /></a>}
        <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={pending} onClick={() => void submit()}>{editing?.published ? copy.publishChanges : copy.publish}</button><button type="button" className={secondary} disabled={pending} onClick={() => setPreview(false)}>{copy.back}</button></div>
      </div>}
    </section>
    <section className={studioVideoPanel} aria-labelledby="your-tournament-videos">
      <h3 id="your-tournament-videos" className="text-lg font-bold text-white">{copy.yourVideos}</h3>
      {!items.length && <p className="text-sm text-zinc-400">{copy.noVideos}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((video) => <li className="space-y-2 rounded-xl border border-white/10 bg-black/35 p-4" key={video.id}>
          <div className="flex items-start gap-2"><Film className="mt-1 shrink-0 text-orange-300" size={17} aria-hidden /><div className="min-w-0"><p className="break-words font-semibold text-white">{video.title}</p><p className="break-words text-sm text-zinc-400">{[video.tournamentTitle, video.scopeLabel].filter(Boolean).join(" · ")}</p></div></div>
          <p className="text-sm text-zinc-400">{video.moderationStatus !== "visible" ? copy.moderated : video.publiclyVisible ? copy.published : copy.unpublished}</p>
          {video.publiclyVisible && <Link className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-orange-200 underline" href={video.tournamentHref}>{copy.viewEntry}<ArrowUpRight aria-hidden size={15} /></Link>}
          {video.moderationStatus === "visible" && <div className="flex flex-wrap gap-2">
            {canPublish && <button type="button" className={secondary} disabled={pending} onClick={() => start(video)}>{copy.edit}</button>}
            {video.published && <button type="button" className={secondary} disabled={pending} onClick={() => setConfirmUnpublish(video.id)}>{copy.unpublish}</button>}
          </div>}
          {confirmUnpublish === video.id && <div className="space-y-2 rounded-lg border border-white/10 p-3"><p className="text-sm text-zinc-300">{copy.unpublishWarning}</p><div className="flex flex-wrap gap-2"><button className={primary} type="button" disabled={pending} onClick={() => void submit(video)}>{copy.unpublish}</button><button className={secondary} type="button" disabled={pending} onClick={() => setConfirmUnpublish(null)}>{copy.cancel}</button></div></div>}
        </li>)}
      </ul>
    </section>
  </div>;
}
