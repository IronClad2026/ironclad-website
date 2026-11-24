"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Expand, ImageIcon, LockKeyhole, Menu, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  type WardrobeItemId,
} from "@/lib/wardrobe/catalogue";
import { invalidateWardrobe, observeWardrobe, readWardrobe, saveWardrobe } from "@/lib/wardrobe/client";
import {
  loadMascotRenderer,
  type MascotRenderer,
  type MascotStatus,
  type MascotView,
  type TalkStyle,
} from "./renderer";
import styles from "./WardrobePilot.module.css";

const control = "min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:border-orange-500 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50";
const selected = "aria-pressed:border-orange-400 aria-pressed:text-orange-300";
const talkStyles: [string, TalkStyle][] = [
  ["Normal", "Talk_Normal"],
  ["Enthusiastic", "Talk_Enthusiastic"],
  ["Gentle", "Talk_Gentle"],
];
const categories = {
  eyes: "Eyewear",
  mouth: "Mouth",
  teeth: "Mouth",
  replacement: "Headwear",
  helmet: "Helmet accessories",
  "helmet-side": "Helmet accessories",
  visor: "Helmet accessories",
  face: "Face",
  paint: "Face",
  hair: "Face",
} as const satisfies Record<(typeof wardrobeItems)[number]["slot"], string>;
const categoryOptions = [...new Set(Object.values(categories))];
const presetThumbnailId = "helmet_trim_dynamite_helmet_band";

function WardrobeThumbnail({ src }: { src: string }) {
  const thumbnail = useRef<HTMLImageElement>(null);
  const [inRange, setInRange] = useState(false);
  useEffect(() => {
    if (!thumbnail.current || typeof IntersectionObserver === "undefined") return;
    // Native lazy loading can fetch every image in this compact catalogue at once.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setInRange(true);
      observer.disconnect();
    }, { rootMargin: "120px 0px" });
    observer.observe(thumbnail.current);
    return () => observer.disconnect();
  }, []);

  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={thumbnail} className={styles.thumbnail}
    src={inRange ? src : undefined} width={56} height={56} decoding="async" alt="" />;
}

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
  const [browse, setBrowse] = useState<"unopened" | "visible" | "hidden">("unopened");
  const [tab, setTab] = useState<"browse" | "equipped">("browse");
  const [category, setCategory] = useState("");
  const [artwork, setArtwork] = useState<(typeof wardrobeItems)[number] | null>(null);
  const [artworkView, setArtworkView] = useState<"standalone" | "fitted">("standalone");
  const [artworkZoom, setArtworkZoom] = useState(false);
  const [larger, setLarger] = useState(false);
  const artworkDialog = useRef<HTMLDialogElement>(null);
  const artworkTrigger = useRef<HTMLButtonElement>(null);
  const browseToggle = useRef<HTMLButtonElement>(null);
  const equippedTab = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const catalogueId = uid + "-catalogue";
  const catalogueVisible = !embedded || browse === "visible";
  const [angle, setAngle] = useState<MascotView>("front");
  const [size, setSize] = useState<"Desktop" | 51 | 56>("Desktop");
  const entitled = state.access !== "locked";
  const selection = pending ?? state;
  const listedItems = wardrobeItems.filter(item => tab === "equipped"
    ? state.itemIds.includes(item.id)
    : !category || categories[item.slot] === category);
  const showPreset = tab === "equipped" ? Boolean(state.dynamiteRestore) : !category;
  const assetUrl = (id: WardrobeItemId, view: "standalone" | "fitted") =>
    wardrobeAssetUrl(id, view + (entitled ? ".webp" : "-blur.webp"));
  const presetThumbnail = assetUrl(presetThumbnailId, "standalone");

  useEffect(() => {
    if (artwork) artworkDialog.current?.showModal();
  }, [artwork]);

  useEffect(() => {
    if (browse !== "hidden") return;
    const frame = window.requestAnimationFrame(() => {
      browseToggle.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [browse]);

  useEffect(() => {
    if (pending || !removeTrigger.current) return;
    if (tab === "equipped" && !removeTrigger.current.isConnected && document.activeElement === document.body) {
      equippedTab.current?.focus({ preventScroll: true });
    }
    removeTrigger.current = null;
  }, [pending, tab]);

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
  const ItemHeading = embedded ? "h5" : "h3";
  const workspace = (
    <div className={styles.container}>
      <div className={styles.workspace} data-ready-wardrobe-workspace=""
        data-browse-open={embedded ? catalogueVisible : undefined}>
      <section className={styles.studio} data-larger={larger} aria-labelledby={uid + "-preview"}>
        <div className={styles.previewSummary}>
          <PreviewHeading id={uid + "-preview"} className={styles.previewHeading}>Ready preview</PreviewHeading>
          <div className={styles.stage}>
            <div className={styles.model} style={size === "Desktop" ? undefined : { width: size }}>
            <canvas ref={canvas} aria-label="Ready 3D preview" role="img"
              className="absolute inset-0 size-full" style={{ visibility: status === "ready" ? "visible" : "hidden" }}
              data-wardrobe-renderer={status} data-wardrobe-items={visibleItems} />
            {status !== "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={READY_DOCK_POSTER_DATA} alt="Stock Ready" className="absolute inset-0 size-full object-contain" />
            )}
            </div>
          </div>
          <div className={styles.previewActions}>
            <button type="button" className={`${control} ${styles.resize}`} aria-expanded={larger}
              onClick={() => {
                resizePreview("Desktop");
                setLarger(!larger);
              }}>
              <Expand aria-hidden="true" size={16} /> {larger ? "Compact preview" : "Larger preview"}
            </button>
          </div>
          <p className={styles.feedback} role="status">
            {pending ? "Updating Ready’s look…" : message || (status === "loading" ? "Loading preview…" :
              status === "error" ? "Live preview unavailable. Item artwork is still available." : "")}
          </p>
        </div>
        <div className={embedded ? styles.studioTools : "contents"}>
          {embedded && (
            <button type="button" ref={browseToggle} className={`${control} ${styles.browseToggle}`}
              aria-controls={catalogueId} aria-expanded={catalogueVisible}
              onClick={() => setBrowse(value => value === "visible" ? "hidden" : "visible")}>
              <Menu size={16} aria-hidden="true" /> {catalogueVisible ? "Hide items" : "Browse items"}
            </button>
          )}
        <details className={styles.options} onToggle={event => {
          if (!event.currentTarget.open) return;
          const preview = event.currentTarget.closest("section");
          if (preview && preview.getBoundingClientRect().top < 0) preview.scrollIntoView({ block: "start" });
        }}>
          <summary className={control}><SlidersHorizontal aria-hidden="true" size={16} /> Preview options</summary>
          <div className={styles.optionsBody} data-lenis-prevent={embedded ? "" : undefined}>
        <div className="flex flex-wrap gap-2" aria-label="Preview angle" role="group">
          <button className={control + " " + selected} aria-pressed={angle === "front"} onClick={() => setView("front")}>Front</button>
          <button className={control + " " + selected} aria-pressed={angle === "three-quarter"} onClick={() => setView("three-quarter")}>Three-quarter</button>
          <button className={control} disabled={status !== "ready"} onClick={() => renderer.current?.react("Reaction_Shake")}>Head turn</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Preview size" role="group">
          {(["Desktop", 51, 56] as const).map(value => (
            <button key={value} className={control + " " + selected} aria-pressed={size === value} onClick={() => resizePreview(value)}>
              {value === "Desktop" ? "Standard size" : value + " px"}
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
          </div>
        </details>
        </div>
      </section>
      <section id={catalogueId} className={styles.catalogue} aria-label="Ready items" hidden={!catalogueVisible}>
        {(!embedded || browse !== "unopened") && <>
        <div className={styles.toolbar}>
          <div className={styles.tabs} aria-label="Catalogue view" role="group">
            <button type="button" aria-pressed={tab === "browse"} onClick={() => setTab("browse")}>Browse</button>
            <button type="button" ref={equippedTab} aria-pressed={tab === "equipped"} onClick={() => setTab("equipped")}>
              Equipped ({state.itemIds.length})
            </button>
          </div>
          {tab === "browse" && (
            <select aria-label="Category" className={styles.category} value={category}
              onChange={event => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
        </div>
        {!entitled && <p className={styles.notice}>
          IronClad Supporters can equip and save these items. Subscriptions are unavailable in this pilot.
          {!sessionId && <> <Link prefetch={false} className="text-orange-300 underline"
            href="/sign-in?redirect_url=%2Fprofile%2Fready">Sign in</Link></>}
        </p>}
        {showPreset && <div className={`${styles.row} ${styles.preset}`}>
          <WardrobeThumbnail key={presetThumbnail} src={presetThumbnail} />
          <div className={styles.itemCopy}>
            <ItemHeading>Dynamite Set</ItemHeading>
            <p>2-item preset · Helmet Band and Sparking Stick</p>
          </div>
          {entitled
            ? <button type="button" className={styles.itemAction} data-equipped={Boolean(selection.dynamiteRestore)}
                aria-label={selection.dynamiteRestore ? "Remove Dynamite Set" : "Equip Dynamite Set"}
                disabled={status !== "ready"}
                onClick={event => {
                  if (tab === "equipped") removeTrigger.current = event.currentTarget;
                  void updateSelection(toggleDynamiteSet);
                }}>
                {selection.dynamiteRestore ? "Remove" : "Equip"}
              </button>
            : <span className={styles.lock}><LockKeyhole size={14} aria-hidden="true" /> Locked</span>}
        </div>}
        {listedItems.length === 0 && (
          <p className={styles.notice}>{tab === "equipped" ? "No items equipped. Choose an item in Browse to change Ready’s look." : "No items in this category."}</p>
        )}
        <ul className={styles.items}>
          {listedItems.map(item => {
            const equipped = selection.itemIds.includes(item.id);
            const constraint = itemConstraint(item.id, selection.itemIds);
            const thumbnail = assetUrl(item.id, "standalone");
            return (
              <li key={item.id} className={styles.row} data-equipped={equipped}>
                <button type="button" className={styles.artworkTrigger} aria-label={`View artwork for ${item.name}`}
                  onClick={event => {
                    artworkTrigger.current = event.currentTarget;
                    setArtworkView("standalone");
                    setArtworkZoom(false);
                    setArtwork(item);
                  }}>
                  <WardrobeThumbnail key={thumbnail} src={thumbnail} />
                  <ImageIcon className={styles.artworkIcon} aria-hidden="true" size={13} />
                </button>
                <div className={styles.itemCopy}>
                  <ItemHeading>{item.name}</ItemHeading>
                  <p>{categories[item.slot]}</p>
                  {entitled && constraint && <p className={styles.constraint}>
                    {equipped && !constraint.startsWith("Hidden") ? "Saved · " : ""}{constraint}
                  </p>}
                </div>
                {entitled ? (
                  <button type="button" className={styles.itemAction} data-equipped={equipped} disabled={status !== "ready"}
                    aria-label={`${equipped ? "Remove" : "Equip"} ${item.name}`}
                    onClick={event => {
                      if (tab === "equipped") removeTrigger.current = event.currentTarget;
                      void updateSelection(outfit => toggleWardrobeItem(outfit, item.id));
                    }}>
                    {equipped ? <Minus aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}
                    {equipped ? "Remove" : "Equip"}
                  </button>
                ) : <span className={styles.lock}><LockKeyhole size={14} aria-hidden="true" /> Locked</span>}
              </li>
            );
          })}
        </ul>
        </>}
      </section>
      </div>
      <dialog ref={artworkDialog} className={styles.artworkDialog} aria-labelledby={uid + "-artwork"}
        onClose={() => {
          setArtwork(null);
          artworkTrigger.current?.focus({ preventScroll: true });
        }}>
        {artwork && <>
          <div className={styles.artworkHeading}>
            <h2 id={uid + "-artwork"}>{artwork.name}</h2>
            <button type="button" className={control} aria-label="Close artwork" autoFocus
              onClick={() => artworkDialog.current?.close()}><X aria-hidden="true" size={20} /></button>
          </div>
          <div className={styles.artworkFrame} data-zoom={artworkZoom}
            tabIndex={artworkZoom ? 0 : undefined} aria-label="Artwork close-up" role="region">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={entitled ? "clear" : "blurred"} className={styles.artworkImage} src={assetUrl(artwork.id, artworkView)} alt={
              `${entitled ? "" : "Blurred "}${artwork.name}${artworkView === "fitted" ? " on Ready" : " standalone artwork"}`} />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Artwork view">
            <button type="button" className={control + " " + selected} aria-pressed={artworkView === "standalone"}
              onClick={() => setArtworkView("standalone")}>Standalone</button>
            <button type="button" className={control + " " + selected} aria-pressed={artworkView === "fitted"}
              onClick={() => setArtworkView("fitted")}>Fitted on Ready</button>
            <button type="button" className={control + " " + selected} aria-pressed={artworkZoom}
              onClick={() => setArtworkZoom(!artworkZoom)}>Close-up</button>
          </div>
        </>}
      </dialog>
    </div>
  );

  if (embedded) return workspace;

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
