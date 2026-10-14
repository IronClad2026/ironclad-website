"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Play, Plus, Video } from "lucide-react";
import Link from "next/link";
import ReferenceDialog from "@/components/ui/ReferenceDialog";
import type { HighlightEditorActions, HighlightResult, HighlightSlot, HighlightsState } from "@/lib/combat-highlights/types";
import UploadHighlightDialog from "./UploadHighlightDialog";
import { HighlightMediaError, MAX_HIGHLIGHT_BYTES, putHighlightObject, type PreparedHighlight } from "./media";
import { HIGHLIGHT_BUTTON, highlightDuration, highlightMessage } from "./presentation";

export default function CombatHighlightsEditor({ initialState, actions }: {
  initialState: HighlightsState; actions: HighlightEditorActions;
}) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);
  const [uploadSlot, setUploadSlot] = useState<number | null>(null);
  const [removing, setRemoving] = useState<HighlightSlot | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  const previewUrl = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const previewController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [message, setMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const slots = [...state.slots].sort((a, b) => a.displayOrder - b.displayOrder);
  const activeSlot = slots.find((slot) => slot.slotNumber === uploadSlot);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      previewController.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function applyResult<T extends HighlightResult>(result: T) {
    if (result.state) {
      stateRef.current = result.state;
      if (mounted.current) setState(result.state);
    }
    return result;
  }

  function begin() {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    return true;
  }

  function finish() {
    busyRef.current = false;
    if (mounted.current) setBusy(false);
  }

  function mutate(action: () => Promise<HighlightResult>, after?: () => void) {
    if (!begin()) return;
    setStage("Updating Combat Highlights…");
    startTransition(async () => {
      try {
        const result = applyResult(await action());
        if (mounted.current) {
          setMessage(highlightMessage(result.code));
          if (result.code === "conflict") setRemoving(null);
          if (result.ok) after?.();
        }
      } catch {
        if (mounted.current) setMessage(highlightMessage("unavailable"));
      } finally { finish(); }
    });
  }

  function upload(prepared: PreparedHighlight, title: string, declarationAccepted: boolean) {
    if (!activeSlot || !begin()) return;
    const slot = activeSlot;
    const abort = new AbortController();
    controller.current = abort;
    setProgress(0);
    setStage("Preparing upload…");
    setUploadMessage("");
    startTransition(async () => {
      let pendingId: string | null = null;
      let completed = false;
      try {
        const reservation = applyResult(await actions.reserve({
          slotNumber: slot.slotNumber,
          expectedRevision: slot.revision,
          fileName: prepared.file.name,
          contentType: prepared.contentType,
          byteLength: prepared.file.size,
          posterByteLength: prepared.poster?.size ?? 0,
          title,
          declarationAccepted,
          declarationVersion: 1,
        }));
        if (!reservation.ok || !("upload" in reservation) || !reservation.upload) {
          if (mounted.current) setUploadMessage(highlightMessage(reservation.code));
          return;
        }
        // Keep the grant in this operation only; it is never rendered or persisted.
        const grant = reservation.upload;
        pendingId = grant.uploadId;
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (mounted.current) setStage("Uploading video…");
        await putHighlightObject({
          url: grant.videoUrl, body: prepared.file, authorization: grant.videoAuthorization,
          clerkToken: grant.clerkToken, contentType: prepared.contentType, signal: abort.signal,
          onProgress: (percent) => { if (mounted.current) setProgress(Math.round(percent * 0.9)); },
        });
        if (prepared.poster) {
          if (!grant.posterUrl || !grant.posterAuthorization) throw new HighlightMediaError("unavailable");
          if (mounted.current) setStage("Uploading preview image…");
          await putHighlightObject({
            url: grant.posterUrl, body: prepared.poster, authorization: grant.posterAuthorization,
            clerkToken: grant.clerkToken, contentType: "image/jpeg", signal: abort.signal,
            onProgress: (percent) => { if (mounted.current) setProgress(90 + Math.round(percent * 0.09)); },
          });
        }
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (mounted.current) setStage("Checking clip format and limits…");
        const result = applyResult(await actions.complete(grant.uploadId));
        if (!result.ok) throw new HighlightMediaError(result.code);
        completed = true;
        if (mounted.current) {
          setProgress(100);
          setUploadSlot(null);
          setMessage("Combat Highlight saved.");
        }
      } catch (error) {
        let code = abort.signal.aborted ? "cancelled" : error instanceof HighlightMediaError ? error.code : "unavailable";
        if (pendingId && !completed && stateRef.current.slots.some((item) => item.pendingUploadId === pendingId)) {
          const current = stateRef.current.slots.find((item) => item.slotNumber === slot.slotNumber);
          try {
            const cancelled = applyResult(await actions.cancel(pendingId, current?.revision ?? slot.revision));
            if (!cancelled.ok) code = "cancel-failed";
          } catch { code = "cancel-failed"; }
        }
        if (mounted.current) {
          if (code === "cancelled") { setUploadSlot(null); setMessage(highlightMessage(code)); }
          else setUploadMessage(highlightMessage(code));
        }
      } finally {
        controller.current = null;
        finish();
      }
    });
  }

  function closeUpload() {
    if (busy && controller.current) {
      setStage("Cancelling upload…");
      controller.current.abort();
    } else if (!busy) setUploadSlot(null);
  }

  function openPreview(slot: HighlightSlot) {
    if (!slot.clip || !begin()) return;
    const clip = slot.clip;
    const abort = new AbortController();
    previewController.current = abort;
    setStage("Loading private preview…");
    startTransition(async () => {
      try {
        const access = await actions.preview(clip.uploadId);
        if (!access.ok || !access.videoUrl || !access.clerkToken) throw new HighlightMediaError(access.code);
        const response = await fetch(access.videoUrl, {
          headers: { Authorization: `Bearer ${access.clerkToken}` },
          signal: abort.signal, credentials: "omit", cache: "no-store",
        });
        if (!response.ok) throw new HighlightMediaError("unavailable");
        const blob = await response.blob();
        if (blob.size === 0 || blob.size > MAX_HIGHLIGHT_BYTES) throw new HighlightMediaError("unavailable");
        if (abort.signal.aborted || !mounted.current) return;
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        const url = URL.createObjectURL(blob);
        previewUrl.current = url;
        setPreview({ title: clip.title, url });
      } catch (error) {
        if (mounted.current && !abort.signal.aborted) setMessage(highlightMessage(error instanceof HighlightMediaError ? error.code : "unavailable"));
      } finally {
        previewController.current = null;
        finish();
      }
    });
  }

  function closePreview() {
    setPreview(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }

  function move(slot: HighlightSlot, delta: number) {
    const index = slots.findIndex((item) => item.slotNumber === slot.slotNumber);
    const ordered = [...slots];
    [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]];
    mutate(() => actions.reorder(ordered.map((item) => item.slotNumber), ordered.map((item) => item.revision)));
  }

  return (
    <section aria-labelledby="combat-highlights-editor-title" aria-busy={busy} data-combat-highlights-editor className="mx-auto mt-10 w-full max-w-[960px] border-t border-white/15 pt-8">
      <header>
        <h2 id="combat-highlights-editor-title" className="text-2xl font-bold text-zinc-100">Combat Highlights</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Share up to three short moments from your Company of Heroes 3 gameplay. Clips appear in the order shown here.</p>
        <p className="mt-2 text-xs leading-5 text-zinc-400">15 seconds · 15 MB · up to 1080p / 60 fps · MP4 or WebM</p>
        {!state.enabled ? <p role="status" className="mt-4 text-sm text-orange-200">{highlightMessage("feature-disabled")}</p> : null}
        {!state.publicProfileEnabled ? <p className="mt-4 text-sm leading-6 text-zinc-300">Your clips stay hidden while your profile is private. <Link href="/profile" className="inline-flex min-h-11 items-center text-orange-200 underline underline-offset-4">Manage visibility</Link></p> : null}
      </header>
      <div className="mt-5 space-y-4">
        {slots.map((slot, index) => (
          <article key={slot.slotNumber} className="min-w-0 border border-white/12 bg-[linear-gradient(120deg,#1a1d21,#0b0d0f)] p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-4">
              <div aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-sm border border-white/10 bg-black/20 text-zinc-500"><Video size={22} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Highlight {index + 1}</p>
                <h3 className="mt-1 break-words text-base font-semibold leading-6 text-zinc-100 [overflow-wrap:anywhere]">{slot.clip?.title ?? "Add a gameplay clip"}</h3>
                {slot.clip ? <p className="mt-1 text-xs text-zinc-400">{highlightDuration(slot.clip.durationMs)} · {slot.clip.width} × {slot.clip.height}</p> : null}
                {slot.hidden ? <p className="mt-2 text-sm text-orange-200">This clip is hidden from your public profile.</p> : null}
                {slot.pendingUploadId ? <p className="mt-2 text-sm text-zinc-300">An upload is pending for this slot.</p> : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {slot.clip ? (
                <>
                  <button type="button" disabled={busy} onClick={() => openPreview(slot)} className={HIGHLIGHT_BUTTON} aria-label={`Preview ${slot.clip.title}`}><Play size={15} aria-hidden="true" />Preview</button>
                  <button type="button" disabled={busy || !state.enabled || !!slot.pendingUploadId} onClick={() => { setUploadMessage(""); setUploadSlot(slot.slotNumber); }} className={HIGHLIGHT_BUTTON} aria-label={`Replace ${slot.clip.title}`}>Replace</button>
                  <button type="button" disabled={busy || !!slot.pendingUploadId} onClick={() => setRemoving(slot)} className={HIGHLIGHT_BUTTON} aria-label={`Remove ${slot.clip.title}`}>Remove</button>
                  <button type="button" disabled={busy || !state.enabled || index === 0 || slots.some((item) => item.pendingUploadId)} onClick={() => move(slot, -1)} className={HIGHLIGHT_BUTTON} aria-label={`Move ${slot.clip.title} earlier`}><ArrowUp size={15} aria-hidden="true" /></button>
                  <button type="button" disabled={busy || !state.enabled || index === slots.length - 1 || slots.some((item) => item.pendingUploadId)} onClick={() => move(slot, 1)} className={HIGHLIGHT_BUTTON} aria-label={`Move ${slot.clip.title} later`}><ArrowDown size={15} aria-hidden="true" /></button>
                </>
              ) : <button type="button" disabled={busy || !state.enabled || !!slot.pendingUploadId} onClick={() => { setUploadMessage(""); setUploadSlot(slot.slotNumber); }} className={HIGHLIGHT_BUTTON} aria-label={`Add clip ${index + 1}`}><Plus size={16} aria-hidden="true" />Add clip</button>}
              {slot.pendingUploadId ? <button type="button" disabled={busy} onClick={() => mutate(() => actions.cancel(slot.pendingUploadId!, slot.revision))} className={HIGHLIGHT_BUTTON}>Cancel pending upload</button> : null}
            </div>
          </article>
        ))}
      </div>
      {busy && uploadSlot === null ? <p role="status" className="mt-4 text-sm text-zinc-300">{stage || "Updating Combat Highlights…"}</p> : null}
      {message ? <p role="status" className="mt-4 text-sm leading-6 text-zinc-200">{message}</p> : null}
      {activeSlot ? <UploadHighlightDialog slot={activeSlot} busy={busy} progress={progress} stage={stage} message={uploadMessage} onClose={closeUpload} onSubmit={upload} /> : null}
      {removing ? (
        <ReferenceDialog title="Remove Combat Highlight?" context={removing.clip?.title} closeLabel="Close removal confirmation" onClose={() => { if (!busy) setRemoving(null); }} size="compact">
          <p className="text-sm leading-6 text-zinc-300">The clip will be removed from your Showcase. You can upload another clip to this slot later.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => mutate(() => actions.clear(removing.slotNumber, removing.revision), () => setRemoving(null))} className={HIGHLIGHT_BUTTON}>Remove clip</button>
            <button type="button" disabled={busy} onClick={() => setRemoving(null)} className={HIGHLIGHT_BUTTON}>Keep clip</button>
          </div>
          {message ? <p role="status" className="mt-4 text-sm text-orange-200">{message}</p> : null}
        </ReferenceDialog>
      ) : null}
      {preview ? <ReferenceDialog title={preview.title} context="Private clip preview" closeLabel="Close clip preview" onClose={closePreview}><video src={preview.url} controls playsInline preload="metadata" aria-label={preview.title} className="aspect-video w-full bg-black object-contain" /></ReferenceDialog> : null}
    </section>
  );
}
