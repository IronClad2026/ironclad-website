"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { READY_DOCK_POSTER_DATA } from "@/lib/ready/poster-data";
import {
  emptyWardrobe,
  parseWardrobeSelection,
  wardrobeAssetUrl,
  wardrobeItems,
  type WardrobeItemId,
  type WardrobeState,
} from "@/lib/wardrobe/catalogue";
import {
  loadMascotRenderer,
  type MascotRenderer,
  type MascotStatus,
  type MascotView,
  type TalkStyle,
} from "./renderer";

const endpoint = "/api/ready/wardrobe";
const control = "min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50";
const selected = "aria-pressed:border-orange-400 aria-pressed:text-orange-300";
const talkStyles: [string, TalkStyle][] = [
  ["Normal", "Talk_Normal"],
  ["Enthusiastic", "Talk_Enthusiastic"],
  ["Gentle", "Talk_Gentle"],
];

export default function WardrobePilot({ initial }: { initial: WardrobeState }) {
  const { isLoaded, sessionId, isSignedIn } = useAuth();
  const activeSession = isLoaded && isSignedIn ? sessionId ?? null : null;
  const initialState = isLoaded && initial.sessionId === activeSession ? initial : emptyWardrobe;
  return <WardrobePreview key={isLoaded ? activeSession ?? "visitor" : "loading"}
    initial={initialState} sessionId={activeSession} />;
}

function WardrobePreview({ initial, sessionId }: { initial: WardrobeState; sessionId: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<MascotRenderer>(null);
  const job = useRef<AbortController>(null);
  const saving = useRef(false);
  const talkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rendered = useRef("");
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState<MascotStatus>("loading");
  const [visibleItems, setVisibleItems] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<"standalone" | "fitted">("standalone");
  const [angle, setAngle] = useState<MascotView>("front");
  const [size, setSize] = useState<"Desktop" | 51 | 56>("Desktop");
  const entitled = state.access !== "locked";

  useEffect(() => {
    const signal = new AbortController();
    let controller: MascotRenderer | undefined;
    const refresh = async () => {
      if (job.current || signal.signal.aborted) return;
      const attempt = new AbortController();
      job.current = attempt;
      try {
        const next = await fetch(endpoint, { cache: "no-store", signal: attempt.signal })
          .then(response => response.ok ? response.json() as Promise<WardrobeState> : emptyWardrobe)
          .catch(() => emptyWardrobe);
        attempt.signal.throwIfAborted();
        if (next.sessionId !== sessionId || next.access === "locked") {
          controller?.clearWardrobe();
          rendered.current = "";
          setVisibleItems("");
          setState(emptyWardrobe);
          return;
        }
        setState(next);
        const look = next.itemIds.join(",");
        if (controller && look !== rendered.current) {
          const prepared = await controller.prepareWardrobe(next.itemIds, attempt.signal);
          try {
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
        if (job.current === attempt) job.current = null;
      }
    };
    void loadMascotRenderer().then(create => {
      if (signal.signal.aborted || !canvas.current) return;
      controller = create({ canvas: canvas.current, onStatus: setStatus, wardrobe: true });
      renderer.current = controller;
      controller.setMode("floating");
      void refresh();
    }).catch(() => {
      if (signal.signal.aborted) return;
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
      signal.abort();
      job.current?.abort();
      job.current = null;
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

  async function toggle(item: WardrobeItemId) {
    if (!renderer.current || saving.current || !entitled || !sessionId || status !== "ready") return;
    const ids = state.itemIds.includes(item)
      ? state.itemIds.filter(id => id !== item)
      : [...state.itemIds, item];
    const next = parseWardrobeSelection(ids);
    if (!next) return;
    const attempt = new AbortController();
    // An explicit outfit change takes priority over an in-flight background recheck.
    job.current?.abort();
    job.current = attempt;
    saving.current = true;
    setBusy(true);
    setMessage("");
    let prepared: Awaited<ReturnType<MascotRenderer["prepareWardrobe"]>> | undefined;
    try {
      prepared = await renderer.current.prepareWardrobe(next, attempt.signal);
      const response = await fetch(endpoint, {
        method: "POST", signal: attempt.signal, cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, itemIds: next }),
      });
      if (response.status === 403) {
        renderer.current.clearWardrobe();
        rendered.current = "";
        setVisibleItems("");
        setState(emptyWardrobe);
        setMessage("Wardrobe access has changed.");
        return;
      }
      if (!response.ok) throw new Error("Save failed.");
      const saved = await response.json() as WardrobeState;
      attempt.signal.throwIfAborted();
      if (saved.sessionId !== sessionId || saved.access === "locked") throw new Error("Session changed.");
      prepared.commit();
      rendered.current = saved.itemIds.join(",");
      setVisibleItems(rendered.current);
      setState(saved);
      setMessage("Ready’s look was saved.");
    } catch {
      if (!attempt.signal.aborted) setMessage("Could not update Ready’s look. Try again.");
    } finally {
      prepared?.discard();
      if (job.current === attempt) {
        job.current = null;
        saving.current = false;
        setBusy(false);
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

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pt-28 pb-12 text-zinc-100 sm:px-8 sm:pt-32">
      <div className="mx-auto max-w-6xl">
        {sessionId && <Link prefetch={false} className="text-sm text-orange-300 underline" href="/profile">Your profile</Link>}
        <h1 className="mt-3 text-3xl font-bold text-zinc-100 sm:text-4xl">Ready Wardrobe</h1>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <section className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6" aria-labelledby="wardrobe-preview-heading">
            <h2 id="wardrobe-preview-heading" className="text-xl font-semibold text-zinc-100">Ready Preview</h2>
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
          </section>
          <section className="min-w-0" aria-label="Ready items">
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
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {wardrobeItems.map(item => {
                const equipped = state.itemIds.includes(item.id);
                const file = preview + (entitled ? ".webp" : "-blur.webp");
                return (
                  <li key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                    {/* The server mediates all sharp bytes. The public variants are separately rendered WebPs. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="aspect-square w-full bg-zinc-900 object-contain" src={wardrobeAssetUrl(item.id, file)}
                      width={512} height={512} alt={`${item.name} ${preview} ${entitled ? "preview" : "blurred preview"}`} />
                    <div className="flex grow flex-col items-start gap-3 p-3">
                      <h3 className="text-base font-semibold text-zinc-100">{item.name}</h3>
                      {entitled ? (
                        <button className={control + " mt-auto"} disabled={busy || status !== "ready"}
                          aria-label={`${equipped ? "Remove" : "Equip"} ${item.name}`} onClick={() => void toggle(item.id)}>
                          {equipped ? "Remove" : "Equip"}
                        </button>
                      ) : <span className="mt-auto text-sm text-zinc-400">Locked</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 min-h-6 text-sm text-zinc-300" role="status">{busy ? "Updating Ready’s look…" : message}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
