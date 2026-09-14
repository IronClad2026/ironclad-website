"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import type { HighlightSlot } from "@/lib/combat-highlights/types";
import { HighlightMediaError, prepareHighlight, type PreparedHighlight } from "./media";
import { HIGHLIGHT_BUTTON, highlightMessage } from "./presentation";

export default function UploadHighlightDialog({
  slot, busy, progress, stage, message, onClose, onSubmit,
}: {
  slot: HighlightSlot; busy: boolean; progress: number; stage: string; message: string;
  onClose: () => void;
  onSubmit: (prepared: PreparedHighlight, title: string, declarationAccepted: boolean) => void;
}) {
  const titleId = useId();
  const fileId = useId();
  const declarationId = useId();
  const [title, setTitle] = useState(slot.clip?.title ?? "");
  const [prepared, setPrepared] = useState<PreparedHighlight | null>(null);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [includePoster, setIncludePoster] = useState(true);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);

  async function chooseFile(file: File | undefined) {
    preparation.current?.abort();
    setPrepared(null);
    setLocalError("");
    if (!file) { setChecking(false); return; }
    const controller = new AbortController();
    preparation.current = controller;
    setChecking(true);
    try {
      const result = await prepareHighlight(file, controller.signal);
      if (controller.signal.aborted) return;
      setPrepared(result);
      setTitle((current) => current || file.name.replace(/\.[^.]+$/, "").slice(0, 64));
    } catch (error) {
      if (!controller.signal.aborted) setLocalError(highlightMessage(error instanceof HighlightMediaError ? error.code : "invalid-media"));
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }

  return (
    <ReferenceDialog title={slot.clip ? "Replace Combat Highlight" : "Add Combat Highlight"} closeLabel={busy ? "Cancel upload" : "Close clip upload"} onClose={onClose} size="compact">
      <form onSubmit={(event) => {
        event.preventDefault();
        if (prepared && !busy && !checking && title.trim() && declaration) {
          onSubmit({ ...prepared, poster: includePoster ? prepared.poster : null }, title.trim(), declaration);
        }
      }} className="space-y-5">
        <p className="text-sm leading-6 text-zinc-300">Up to 15 seconds · 15 MB · 1920 × 1080 · 60 fps.</p>
        <p id={fileId + "-help"} className="text-sm leading-6 text-zinc-400">MP4: H.264/AVC video with optional AAC audio. WebM: VP8/VP9 video with optional Opus/Vorbis audio. The clip is checked again after upload.</p>
        {slot.clip ? <p className="border-l-2 border-zinc-600 pl-3 text-sm text-zinc-300">Current clip: <span className="font-semibold">{slot.clip.title}</span>. It stays in place until the replacement is accepted.</p> : null}
        <div>
          <label htmlFor={fileId} className="block text-sm font-semibold">Video file</label>
          <input id={fileId} type="file" accept=".mp4,.webm,video/mp4,video/webm" disabled={busy || checking} aria-describedby={fileId + "-help"} onChange={(event) => { void chooseFile(event.target.files?.[0]); }} className="mt-2 block min-h-11 w-full min-w-0 rounded-sm border border-white/15 bg-zinc-900 p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50" />
          {checking ? <p role="status" className="mt-2 text-sm text-zinc-300">Checking the local video…</p> : null}
          {prepared ? <p className="mt-2 break-words text-xs leading-5 text-zinc-400">{prepared.file.name} · {(prepared.file.size / 1_000_000).toFixed(1)} MB{prepared.durationMs ? ` · ${(prepared.durationMs / 1000).toFixed(1)}s` : ""}{prepared.width && prepared.height ? ` · ${prepared.width} × ${prepared.height}` : ""}</p> : null}
        </div>
        <div>
          <label htmlFor={titleId} className="block text-sm font-semibold">Clip title</label>
          <input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={64} required disabled={busy} className="mt-2 min-h-11 w-full rounded-sm border border-white/15 bg-zinc-900 px-3 text-base focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-50" />
          <p className="mt-1 text-right text-xs text-zinc-400">{title.length} / 64</p>
        </div>
        {prepared?.poster ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-300">
            <input type="checkbox" checked={includePoster} onChange={(event) => setIncludePoster(event.target.checked)} disabled={busy} className="size-4 accent-orange-400" />
            Use a frame from this clip as its preview image
          </label>
        ) : null}
        <div className="border border-white/15 bg-white/[0.025] p-3">
          <label htmlFor={declarationId} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-zinc-200">
            <input id={declarationId} type="checkbox" checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} disabled={busy} required className="mt-1 size-4 shrink-0 accent-orange-400" />
            <span>This is genuine Company of Heroes 3 gameplay involving me, and I have the rights to share this clip.</span>
          </label>
        </div>
        {localError || message ? <p role="alert" className="text-sm leading-6 text-orange-200">{localError || message}</p> : null}
        {busy ? (
          <div>
            <p role="status" className="mb-2 text-sm text-zinc-200">{stage}</p>
            <progress aria-label="Clip upload progress" value={progress} max={100} className="h-2 w-full accent-orange-400" />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={!prepared || !title.trim() || !declaration || busy || checking} className={HIGHLIGHT_BUTTON + " border-orange-300/30 bg-orange-300/10 text-orange-200"}>{slot.clip ? "Upload replacement" : "Upload clip"}</button>
          <button type="button" onClick={onClose} className={HIGHLIGHT_BUTTON}>{busy ? "Cancel upload" : "Cancel"}</button>
        </div>
      </form>
    </ReferenceDialog>
  );
}
