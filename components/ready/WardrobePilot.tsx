"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { READY_DOCK_POSTER_DATA } from "@/lib/ready/poster-data";
import {
  emptyWardrobe,
  itemConstraint,
  toggleDynamiteSet,
  toggleWardrobeItem,
  visibleWardrobeItems,
  wardrobeAssetUrl,
  wardrobeItems,
  type WardrobeSelection,
  type WardrobeState,
} from "@/lib/wardrobe/catalogue";
import { invalidateWardrobe, observeWardrobe, readWardrobe, saveWardrobe } from "@/lib/wardrobe/client";
import {
  loadMascotRenderer,
  type MascotRenderer,
  type MascotStatus,
  type MascotView,
  type TalkStyle,
} from "./renderer";

const control = "min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50";
const selected = "aria-pressed:border-orange-400 aria-pressed:text-orange-300";
const talkStyles: [string, TalkStyle][] = [
  ["Normal", "Talk_Normal"],
  ["Enthusiastic", "Talk_Enthusiastic"],
  ["Gentle", "Talk_Gentle"],
];

export default function WardrobePilot({ initial = emptyWardrobe, embedded = false }: {
  initial?: WardrobeState;
  embedded?: boolean;
}) {
  const { isLoaded, sessionId, isSignedIn } = useAuth();
  const activeSession = isLoaded && isSignedIn ? sessionId ?? null : null;
  const initialState = isLoaded && initial.sessionId === activeSession ? initial : emptyWardrobe;
  return <WardrobePreview key={isLoaded ? activeSession ?? "visitor" : "loading"}
    initial={initialState} sessionId={activeSession} embedded={embedded} />;
}

function WardrobePreview({ initial, sessionId, embedded }: {
  initial: WardrobeState;
  sessionId: string | null;
  embedded: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<MascotRenderer>(null);
  const lifetime = useRef<AbortController>(null);
  const refreshJob = useRef<AbortController>(null);
  const preparing = useRef<AbortController>(null);
  const saving = useRef(false);
  const accepted = useRef(initial);
  const requested = useRef<WardrobeSelection>(null);
  const talkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rendered = useRef("");
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<MascotStatus>("loading");
  const [visibleItems, setVisibleItems] = useState("");
  const [pending, setPending] = useState<WardrobeSelection | null>(null);
  const [message, setMessage] = useState("");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState<"standalone" | "fitted">("standalone");
  const [angle, setAngle] = useState<MascotView>("front");
  const [size, setSize] = useState<"Desktop" | 51 | 56>("Desktop");
  const entitled = state.access !== "locked";
  const selection = pending ?? state;

  useEffect(() => {
    const active = new AbortController();
    lifetime.current = active;
    let controller: MascotRenderer | undefined;
    function lock() {
      refreshJob.current?.abort();
      preparing.current?.abort();
      requested.current = null;
      controller?.clearWardrobe();
      rendered.current = "";
      setVisibleItems("");
      accepted.current = emptyWardrobe;
      setState(emptyWardrobe);
    }
    const refresh = async (received?: WardrobeState) => {
      if (!sessionId || saving.current || active.signal.aborted) return;
      if (received) refreshJob.current?.abort();
      else if (refreshJob.current) return;
      const attempt = new AbortController();
      refreshJob.current = attempt;
      try {
        const next = received ?? await readWardrobe(sessionId, attempt.signal);
        attempt.signal.throwIfAborted();
        if (!next) {
          invalidateWardrobe(sessionId);
          return;
        }
        accepted.current = next;
        setState(next);
        const visible = visibleWardrobeItems(next);
        const look = visible.join(",");
        if (controller && look !== rendered.current) {
          const prepared = await controller.prepareWardrobe(visible, attempt.signal);
          try {
            attempt.signal.throwIfAborted();
            prepared.commit();
            rendered.current = look;
            setVisibleItems(look);
          } finally {
            prepared.discard();
          }
        }
      } catch {
        if (!attempt.signal.aborted) setMessage("Ready’s wardrobe could not be loaded. Try again shortly.");
      } finally {
        if (refreshJob.current === attempt) refreshJob.current = null;
      }
    };
    const unobserve = sessionId && observeWardrobe(sessionId, state => {
      if (state) void refresh(state);
      else lock();
    });
    void loadMascotRenderer().then(create => {
      if (active.signal.aborted || !canvas.current) return;
      controller = create({
        canvas: canvas.current, onStatus: setStatus, onWardrobeCaption: setCaption,
        wardrobeScope: sessionId ?? undefined,
        onWardrobeReset() {
          rendered.current = "";
          setVisibleItems("");
        },
      });
      renderer.current = controller;
      controller.setMode("floating");
      void refresh();
    }).catch(() => {
      if (active.signal.aborted) return;
      setStatus("error");
      void refresh();
    });
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    const recheck = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      active.abort();
      if (unobserve) unobserve();
      refreshJob.current?.abort();
      refreshJob.current = null;
      preparing.current?.abort();
      preparing.current = null;
      requested.current = null;
      saving.current = false;
      clearInterval(timer);
      clearTimeout(talkTimer.current);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      controller?.dispose();
      renderer.current = null;
      rendered.current = "";
    };
  }, [sessionId]);

  async function updateSelection(change: (outfit: WardrobeSelection) => WardrobeSelection) {
    const controller = renderer.current;
    const active = lifetime.current;
    if (!controller || !active || active.signal.aborted || accepted.current.access === "locked" ||
      !sessionId || status !== "ready") return;
    requested.current = change(requested.current ?? accepted.current);
    setPending(requested.current);
    refreshJob.current?.abort();
    preparing.current?.abort();
    if (saving.current) return;
    saving.current = true;
    setMessage("");
    try {
      while (requested.current && !active.signal.aborted) {
        const next: WardrobeSelection = requested.current;
        const attempt = new AbortController();
        preparing.current = attempt;
        let prepared: Awaited<ReturnType<MascotRenderer["prepareWardrobe"]>> | undefined;
        try {
          const visible = visibleWardrobeItems(next);
          prepared = await controller.prepareWardrobe(visible, attempt.signal);
          attempt.signal.throwIfAborted();
          if (requested.current !== next) continue;
          preparing.current = null;
          const saved = await saveWardrobe(sessionId, next, active.signal);
          if (active.signal.aborted) return;
          if (!saved) {
            setMessage("Wardrobe access has changed.");
            return;
          }
          prepared.commit();
          rendered.current = visible.join(",");
          setVisibleItems(rendered.current);
          accepted.current = saved;
          setState(saved);
          setMessage("Ready’s look was saved.");
        } catch {
          if (!active.signal.aborted && requested.current === next && !attempt.signal.aborted) {
            setMessage("Could not update Ready’s look. Try again.");
          }
        } finally {
          prepared?.discard();
          if (preparing.current === attempt) preparing.current = null;
          if (requested.current === next) requested.current = null;
        }
      }
    } finally {
      if (!active.signal.aborted) {
        saving.current = false;
        setPending(null);
      }
    }
  }

  function talk(style: TalkStyle) {
    clearTimeout(talkTimer.current);
    renderer.current?.startTalk(style);
    talkTimer.current = setTimeout(() => renderer.current?.stopTalk(), 3_000);
  }

  function setView(view: MascotView) {
    setAngle(view);
    renderer.current?.setView(view);
  }

  function resizePreview(value: typeof size) {
    setSize(value);
    renderer.current?.setMode(value === "Desktop" ? "floating" : "dock");
  }

  const PreviewHeading = embedded ? "h4" : "h2";
  const ItemHeading = embedded ? "h4" : "h3";
  const workspace = (
    <div className={embedded
      ? "mt-3 grid gap-4 @min-[46rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      : "mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"}>
      <section className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6" aria-labelledby="wardrobe-preview-heading">
        <PreviewHeading id="wardrobe-preview-heading" className="text-xl font-semibold text-zinc-100">Ready Preview</PreviewHeading>
        <div className="my-4 grid min-h-[150px] place-items-center rounded-lg bg-zinc-900">
          <div className="relative aspect-square" style={{ width: size === "Desktop" ? "min(100%, 410px)" : size }}>
            <canvas ref={canvas} aria-label="Ready 3D preview" role="img"
              className="absolute inset-0 size-full" style={{ visibility: status === "ready" ? "visible" : "hidden" }}
              data-wardrobe-renderer={status} data-wardrobe-items={visibleItems} />
            {status !== "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={READY_DOCK_POSTER_DATA} alt="Stock Ready" className="absolute inset-0 size-full object-contain" />
            )}
          </div>
        </div>
        {status === "error" && <p className="my-2 text-sm text-zinc-300">Live 3D preview is unavailable. You can still view the item artwork.</p>}
        <div className="flex flex-wrap gap-2" aria-label="Preview angle" role="group">
          <button className={control + " " + selected} aria-pressed={angle === "front"} onClick={() => setView("front")}>Front</button>
          <button className={control + " " + selected} aria-pressed={angle === "three-quarter"} onClick={() => setView("three-quarter")}>Three-quarter</button>
          <button className={control} disabled={status !== "ready"} onClick={() => renderer.current?.react("Reaction_Shake")}>Head turn</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Preview size" role="group">
          {(["Desktop", 51, 56] as const).map(value => (
            <button key={value} className={control + " " + selected} aria-pressed={size === value} onClick={() => resizePreview(value)}>
              {value === "Desktop" ? value : value + " px"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Silent speech" role="group">
          {talkStyles.map(([label, style]) => (
            <button key={style} className={control} disabled={status !== "ready"} onClick={() => talk(style)}>{label} speech</button>
          ))}
        </div>
        {visibleItems.includes("eyewear_protruding_eyes") && (
          <div className="mt-3">
            <button className={control} onClick={() => renderer.current?.commandWardrobe("play-gaze-cues")}>Play gaze cues</button>
            <p className="mt-2 min-h-6 text-sm text-zinc-300" role="status">{caption}</p>
          </div>
        )}
        {visibleItems.includes("headwear_flip_up_welding_mask") && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Welding visor">
            <button className={control} onClick={() => renderer.current?.commandWardrobe("lower-visor")}>Lower visor</button>
            <button className={control} onClick={() => renderer.current?.commandWardrobe("raise-visor")}>Raise visor</button>
          </div>
        )}
      </section>
      <section className={embedded ? "@container min-w-0" : "min-w-0"} aria-label="Ready items">
        <p className="mb-3 text-sm text-zinc-300">
          {state.access === "admin" ? "Private admin preview"
            : state.access === "subscriber" ? "Staging Supporter access"
              : "IronClad Supporters can equip and save these items. Subscriptions are unavailable in this pilot."}
        </p>
        {!sessionId && <Link prefetch={false} className="mb-3 inline-block text-orange-300 underline" href="/sign-in?redirect_url=%2Fprofile%2Fready">Sign in</Link>}
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Item artwork" role="group">
          <button className={control + " " + selected} aria-pressed={preview === "standalone"} onClick={() => setPreview("standalone")}>Standalone</button>
          <button className={control + " " + selected} aria-pressed={preview === "fitted"} onClick={() => setPreview("fitted")}>Fitted on Ready</button>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
          <div>
            <p className="font-semibold text-zinc-100">Dynamite Set</p>
            <p className="text-sm text-zinc-400">Dynamite Helmet Band and Sparking Dynamite Stick</p>
          </div>
          {entitled
            ? <button className={control} disabled={status !== "ready"}
                onClick={() => void updateSelection(toggleDynamiteSet)}>
                {selection.dynamiteRestore ? "Remove Dynamite Set" : "Equip Dynamite Set"}
              </button>
            : <span className="text-sm text-zinc-400">Locked</span>}
        </div>
        <p className="mb-3 min-h-6 text-sm text-zinc-300" role="status">{pending ? "Updating Ready’s look…" : message}</p>
        <ul className={embedded
          ? "grid gap-3 @min-[22rem]:grid-cols-2 @min-[35rem]:grid-cols-3"
          : "grid gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"}>
          {wardrobeItems.map(item => {
            const equipped = selection.itemIds.includes(item.id);
            const constraint = itemConstraint(item.id, selection.itemIds);
            const file = preview + (entitled ? ".webp" : "-blur.webp");
            return (
              <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                {/* The server mediates all sharp bytes. The public variants are separately rendered WebPs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="aspect-square w-full bg-zinc-900 object-contain" src={wardrobeAssetUrl(item.id, file)}
                  width={512} height={512} loading="lazy" decoding="async"
                  alt={`${item.name} ${preview} ${entitled ? "preview" : "blurred preview"}`} />
                <div className="flex grow flex-col items-start gap-3 p-3">
                  <ItemHeading className="text-base font-semibold text-zinc-100">{item.name}</ItemHeading>
                  {entitled && constraint && <span className="text-xs text-zinc-400">{constraint}</span>}
                  {entitled ? (
                    <button className={control + " mt-auto"} disabled={status !== "ready"}
                      aria-label={`${equipped ? "Remove" : "Equip"} ${item.name}`}
                      onClick={() => void updateSelection(outfit => toggleWardrobeItem(outfit, item.id))}>
                      {equipped ? "Remove" : "Equip"}
                    </button>
                  ) : <span className="mt-auto text-sm text-zinc-400">Locked</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );

  if (embedded) return <div className="@container">{workspace}</div>;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pt-28 pb-12 text-zinc-100 sm:px-8 sm:pt-32">
      <div className="mx-auto max-w-6xl">
        {sessionId && <Link prefetch={false} className="text-sm text-orange-300 underline" href="/profile">Your profile</Link>}
        <h1 className="mt-3 text-3xl font-bold text-zinc-100 sm:text-4xl">Ready Wardrobe</h1>
        {workspace}
      </div>
    </main>
  );
}
