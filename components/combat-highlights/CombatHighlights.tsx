"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Flag, Play } from "lucide-react";
import Link from "next/link";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import type { PublicHighlightClip } from "@/lib/combat-highlights/types";
import { HIGHLIGHT_BUTTON, highlightDuration, highlightMessage } from "./presentation";

type ReportAction = (uploadId: string, reason: string) => Promise<{ ok: boolean; code: string }>;

function HighlightPlayer({ clip, onPlay }: { clip: PublicHighlightClip; onPlay: (video: HTMLVideoElement) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (requested) void video.current?.play().catch(() => { /* Native controls remain available. */ });
  }, [requested]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-sm border border-white/10 bg-[linear-gradient(135deg,#25292e,#101214)]" data-highlight-player>
      <video ref={video} src={requested ? clip.videoUrl : undefined} poster={clip.posterUrl ?? undefined} preload="none" controls={requested} playsInline aria-label={clip.title} onPlay={(event) => onPlay(event.currentTarget)} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      {!requested ? (
        <button type="button" onClick={() => setRequested(true)} aria-label={`Play ${clip.title}`} className="absolute inset-0 flex min-h-11 min-w-11 items-center justify-center bg-black/15 text-white transition hover:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-orange-300">

          <span className="grid size-12 place-items-center rounded-full border border-white/35 bg-black/60"><Play size={21} fill="currentColor" aria-hidden="true" /></span>
          <span className="absolute bottom-3 right-3 rounded-sm bg-black/75 px-2 py-1 text-xs">{highlightDuration(clip.durationMs)}</span>
        </button>
      ) : null}
      {failed ? <p role="status" className="absolute inset-x-0 top-0 bg-black/90 p-3 text-sm text-zinc-200">This clip could not be played. Try again later.</p> : null}
    </div>
  );
}

function ReportHighlightDialog({ clip, report, onClose }: { clip: PublicHighlightClip; report: ReportAction; onClose: () => void }) {
  const [reason, setReason] = useState("inappropriate");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code: string } | null>(null);
  const inFlight = useRef(false);
  return (
    <ReferenceDialog title="Report Combat Highlight" context={clip.title} closeLabel="Close clip report" onClose={onClose} size="compact">
      {result?.ok ? <p role="status" className="text-sm text-zinc-200">Your report has been received.</p> : (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (inFlight.current) return;
          inFlight.current = true;
          setPending(true);
          setResult(null);
          startTransition(async () => {
            try { setResult(await report(clip.uploadId, reason)); }
            catch { setResult({ ok: false, code: "unavailable" }); }
            finally { inFlight.current = false; setPending(false); }
          });
        }} className="space-y-4">
          <label className="block text-sm font-semibold">Reason
            <select value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-11 w-full border border-white/15 bg-zinc-900 px-3 text-sm focus-visible:outline-2 focus-visible:outline-orange-300">
              <option value="inappropriate">Inappropriate or unrelated gameplay</option>
              <option value="harassment">Harassment</option>
              <option value="privacy">Privacy concern</option>
              <option value="copyright">Copyright concern</option>
              <option value="other">Other concern</option>
            </select>
          </label>
          {result ? <p role="alert" className="text-sm text-orange-200">{highlightMessage(result.code)}</p> : null}
          {result?.code === "sign-in-required" ? <Link href="/sign-in" className={HIGHLIGHT_BUTTON}>Sign in</Link> : <button type="submit" disabled={pending} className={HIGHLIGHT_BUTTON}>{pending ? "Sending report…" : "Send report"}</button>}
        </form>
      )}
    </ReferenceDialog>
  );
}

export default function CombatHighlights({ clips, report }: { clips: PublicHighlightClip[]; report?: ReportAction }) {
  const gallery = useRef<HTMLElement>(null);
  const [reportedClip, setReportedClip] = useState<PublicHighlightClip | null>(null);
  if (clips.length === 0) return null;
  const visible = clips.slice(0, 3);
  function keepOnePlaying(active: HTMLVideoElement) {
    for (const video of gallery.current?.querySelectorAll("video") ?? []) {
      if (video !== active) video.pause();
    }
  }
  return (
    <section ref={gallery} aria-labelledby="combat-highlights-title" data-combat-highlights className="px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-5">
          <h2 id="combat-highlights-title" className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">Combat Highlights</h2>
          <p className="mt-2 text-sm text-zinc-400">CoH3 gameplay · player submitted</p>
        </header>
        <div className={`grid min-w-0 gap-5 ${visible.length === 1 ? "max-w-3xl" : visible.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`} data-highlight-count={visible.length}>
          {visible.map((clip) => (
            <article key={clip.uploadId} className="min-w-0">
              <HighlightPlayer clip={clip} onPlay={keepOnePlaying} />
              <div className="mt-2 flex items-start justify-between gap-3">
                <h3 className="min-w-0 break-words py-2 text-base font-semibold leading-6 text-zinc-200 [overflow-wrap:anywhere]">{clip.title}</h3>
                {report ? <button type="button" onClick={() => setReportedClip(clip)} aria-label={`Report ${clip.title}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 px-2 text-xs text-zinc-400 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-orange-300"><Flag size={13} aria-hidden="true" />Report</button> : null}
              </div>
            </article>
          ))}
        </div>
        {reportedClip && report ? <ReportHighlightDialog clip={reportedClip} report={report} onClose={() => setReportedClip(null)} /> : null}
      </div>
    </section>
  );
}
