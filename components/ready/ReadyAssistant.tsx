"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentPropsWithRef, FormEvent, KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { createPortal } from "react-dom";

import { READY_MAIN_MESSAGE, readyCategories, readyQuestionCatalogue } from "@/lib/ready/catalogue";
import type { ReadyActionId, ReadyCategoryId, ReadyMenuChoice, ReadyQuestionId } from "@/lib/ready/catalogue";
import { READY_QUESTION_LIMIT } from "@/lib/ready/contracts";
import { readReadyRequest } from "@/lib/ready/contracts";
import type { ReadyContext, ReadyIntent, ReadyReply } from "@/lib/ready/contracts";
import { useReadyUsage } from "@/lib/ready/use-ready-usage";
import { dialogue } from "./dialogue";
import type { DialogueAnswer, DialogueId, DialogueNode } from "./dialogue";
import { cloudOrigin, placeCloud, placeContextMenu, placeSkull, thoughtTrail } from "./floating-layout";
import type { Bounds, Point, Rect, Side } from "./floating-layout";
import { loadMascotRenderer } from "./renderer";
import type { MascotRenderer, TalkStyle } from "./renderer";
import { compileSpeech, sampleSpeech } from "./speech";
import ThoughtCloudShape from "./ThoughtCloudShape";
import { ReadyCloudLink, ReadySources } from "./ReadyReplyContent";
import { useMascotCloudMenu } from "./useMascotCloudMenu";
import styles from "./ReadyAssistant.module.css";

type Workspace = { open: boolean; position: Point | null; seenGreeting: boolean };
type ReadyView = {
  id: DialogueId | "main" | "submenu" | "search" | "thinking" | "reply";
  node: DialogueNode;
  categoryId?: ReadyCategoryId;
  choices?: readonly ReadyMenuChoice[];
  parent?: ReadyView;
  reply?: ReadyReply;
  questionId?: ReadyQuestionId;
  answerInstanceId?: string;
  fallback?: "no_result" | "unavailable" | "unsupported";
};
type Drag = { id: number; origin: Point; start: Point; startedAt: number; moved: boolean };
type Tap = { id: number; target: HTMLButtonElement; start: Point };
type Reveal = { frame: number; last: number | null; elapsed: number; gain: number; style: TalkStyle; advance: FrameRequestCallback };
type AssetStatus = "loading" | "ready" | "error";

const workspaceKey = "ironclad-ready:workspace:v1";
const defaultWorkspace: Workspace = { open: false, position: null, seenGreeting: false };
const poster = "/images/ironclad-logo.png";
const requestTimeoutMs = 12000;
const reducedQuery = "(prefers-reduced-motion: reduce)";
const resumeOnClient = () => true;
const pauseOnServer = () => false;
const subscribeClient = () => () => undefined;
const menuButtonSize = { width: 72, height: 47 };
const menuGap = 6;
const ovalBounds = { width: 602, minWidth: 516, minHeight: 254 };
const moraleReadMs = 2050;
const neutralNode = (text: string): DialogueNode => ({ text, expression: "Neutral", style: "Talk_Normal", answers: [] });
const dialogueView = (id: DialogueId): ReadyView => ({ id, node: dialogue[id] });
const firstGreeting = dialogueView("welcomeFirst");
const mainMenu: ReadyView = { id: "main", node: neutralNode(READY_MAIN_MESSAGE) };
const searchMenu: ReadyView = {
  id: "search", node: neutralNode("Search IronClad’s prepared answers, Commander."), parent: mainMenu,
};
const unavailableReply: ReadyReply = {
  text: "I couldn’t get an answer just now, Commander. Try again or open the rules and support page.",
  actions: [{ label: "Rules and support", href: "/rules", actionId: "rules-hub" }],
};

function categoryView(category: (typeof readyCategories)[number]): ReadyView {
  return { id: "submenu", node: neutralNode(category.message), categoryId: category.id, choices: category.choices, parent: mainMenu };
}

function replyView(reply: ReadyReply, parent: ReadyView, fallback?: ReadyView["fallback"]): ReadyView {
  const questionId = !fallback && reply.sources?.length && reply.intent?.kind === "question" ? reply.intent.id : undefined;
  return {
    id: "reply", reply, parent, node: neutralNode(reply.text), questionId, fallback,
    categoryId: parent.categoryId ?? (questionId ? readyQuestionCatalogue[questionId]?.category : undefined),
    answerInstanceId: questionId ? crypto.randomUUID() : undefined,
  };
}

function isMoraleReply(view: ReadyView) {
  return view.id === "welcomeReady" || view.id === "welcomeNervous" || view.id === "welcomeRough" || view.id === "welcomeResolve";
}

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function loadWorkspace(): Workspace {
  try {
    const raw = sessionStorage.getItem(workspaceKey);
    if (!raw) return defaultWorkspace;
    const value = JSON.parse(raw) as Partial<Workspace>;
    return {
      open: value.open === true,
      seenGreeting: value.seenGreeting === true,
      position: value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
        ? value.position : null,
    };
  } catch {
    return defaultWorkspace;
  }
}

function saveWorkspace(value: Workspace) {
  try {
    sessionStorage.setItem(workspaceKey, JSON.stringify(value));
  } catch {
    // The assistant still works while browser storage is unavailable.
  }
}

function viewportBounds(element: HTMLElement, logo: HTMLElement | null, menu = false): Bounds {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? innerWidth;
  const height = viewport?.height ?? innerHeight;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const safe = getComputedStyle(element);
  const inset = (side: string) => Number.parseFloat(safe.getPropertyValue(`--safe-${side}`)) || 0;
  const margin = 10;
  const headerBottom = logo?.closest("header")?.getBoundingClientRect().bottom ?? 0;
  return {
    left: left + inset("left") + margin,
    top: Math.max(top + inset("top") + margin, Math.min(headerBottom + 9, top + height * .31)),
    right: left + width - inset("right") - margin,
    bottom: top + height - inset("bottom") - (menu ? 2 : margin),
  };
}

function mainControls(area: Bounds): Rect[] {
  return Array.from(document.querySelectorAll("main a[href],main button:not([disabled])")).flatMap((control) => {
    const { x, y, right, bottom, width, height } = control.getBoundingClientRect();
    return width && height && x < area.right && right > area.left && y < area.bottom && bottom > area.top
      ? [{ x, y, width, height }] : [];
  });
}

type TouchButtonProps = Omit<ComponentPropsWithRef<"button">,
  "onClick" | "onTouchStart" | "onTouchMove" | "onTouchEnd" | "onTouchCancel"> & { onActivate: () => void };

function TouchButton({ onActivate, ...props }: TouchButtonProps) {
  const tap = useRef<Tap | null>(null);

  function tapStart(event: TouchEvent<HTMLButtonElement>) {
    const contact = event.touches.length === 1 ? event.touches[0] : null;
    tap.current = contact ? { id: contact.identifier, target: event.currentTarget,
      start: { x: contact.clientX, y: contact.clientY } } : null;
  }

  function tapMove(event: TouchEvent<HTMLButtonElement>) {
    const start = tap.current;
    if (!start) return;
    const contact = Array.from(event.touches).find((item) => item.identifier === start.id);
    if (!contact || Math.hypot(contact.clientX - start.start.x, contact.clientY - start.start.y) >= 8) {
      tap.current = null;
    }
  }

  function tapEnd(event: TouchEvent<HTMLButtonElement>) {
    const start = tap.current;
    tap.current = null;
    if (start?.target !== event.currentTarget) return;
    const contact = Array.from(event.changedTouches).find((item) => item.identifier === start.id);
    if (!contact || Math.hypot(contact.clientX - start.start.x, contact.clientY - start.start.y) >= 8) return;
    const { left, top, right, bottom } = start.target.getBoundingClientRect();
    if (contact.clientX < left || contact.clientX > right || contact.clientY < top || contact.clientY > bottom) return;
    // Touch sequences after a drag can deliver touchend without a synthetic click.
    if (event.cancelable) event.preventDefault();
    onActivate();
  }

  return <button {...props} onClick={onActivate} onTouchStart={tapStart} onTouchMove={tapMove}
    onTouchEnd={tapEnd} onTouchCancel={() => { tap.current = null; }} />;
}

export default function ReadyAssistant() {
  const client = useSyncExternalStore(subscribeClient, resumeOnClient, pauseOnServer);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => matchMedia(reducedQuery).matches, pauseOnServer);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [open, setOpen] = useState(defaultWorkspace.open);
  const [view, setView] = useState(firstGreeting);
  const [status, setStatus] = useState<AssetStatus>("loading");
  const [revealing, setRevealing] = useState(false);
  const [cloudExit, setCloudExit] = useState<{ revealing: boolean } | null>(null);
  const [question, setQuestion] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const usage = useReadyUsage();
  const trackRef = useRef(usage.track);
  const [votes, setVotes] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const voteRef = useRef(new Map<string, boolean>());
  const moveFocus = useRef(false);
  const grip = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const { open: menuOpen, dismiss: dismissMenu, toggle: toggleMenu, events: menuEvents } = useMascotCloudMenu(grip, menuPanel);

  const dock = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const floating = useRef<HTMLElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const speech = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const questionInput = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tether = useRef<HTMLSpanElement>(null);
  const renderer = useRef<MascotRenderer | null>(null);
  const workspace = useRef<Workspace>(defaultWorkspace);
  const current = useRef(firstGreeting);
  const lastSettled = useRef(firstGreeting);
  const pending = useRef<AbortController | null>(null);
  const context = useRef<ReadyContext | undefined>(undefined);
  const reveal = useRef<Reveal | null>(null);
  const queuedText = useRef(0);
  const followupFrame = useRef(0);
  const completedViews = useRef(new WeakSet<ReadyView>());
  const afterReveal = useRef<(shown: ReadyView) => void>(() => undefined);
  const pointer = useRef<Drag | null>(null);
  const anchor = useRef<Point>({ x: .5, y: .69 });
  const projection = useRef<{ skull: Rect; bubble: Rect; side: Side } | null>(null);
  const obstacles = useRef<Rect[]>([]);
  const menuLayout = useRef<{ area: Bounds; skull: Rect; speech: Rect } | null>(null);
  const dockingTimer = useRef<number | null>(null);
  const cloudExitTimer = useRef<number | null>(null);
  const previousPath = useRef(locationKey);

  const { id: nodeId, node, reply } = view;

  useEffect(() => { trackRef.current = usage.track; }, [usage.track]);

  const cancelFollowup = useCallback(() => {
    cancelAnimationFrame(followupFrame.current);
    followupFrame.current = 0;
  }, []);

  const abortPending = useCallback(() => {
    const previous = pending.current;
    pending.current = null;
    previous?.abort();
  }, []);

  const showAnchor = useCallback((point: Point) => {
    anchor.current = point;
    if (!projection.current || !workspace.current.open) return;
    const { skull, bubble: rect, side } = projection.current;
    const mouth = { x: skull.x + skull.width * point.x, y: skull.y + skull.height * point.y };
    if (!tether.current) return;
    const points = thoughtTrail(skull, rect, side, mouth);
    const beads = tether.current.children;
    for (let index = 0; index < beads.length; index += 1) {
      const bead = beads[index] as HTMLSpanElement;
      const location = points[index];
      const hidden = location === undefined;
      if (bead.hidden !== hidden) bead.hidden = hidden;
      if (!location) continue;
      bead.style.setProperty("--thought-x", `${location.x}px`);
      bead.style.setProperty("--thought-y", `${location.y}px`);
    }
  }, []);

  const layoutMenu = useCallback(() => {
    const panel = menuPanel.current;
    const geometry = menuLayout.current;
    if (!panel || !geometry || !floating.current) return;
    const { area, skull, speech: dialogueBounds } = geometry;
    const close = closeButton.current?.getBoundingClientRect();
    const avoid = close ? [dialogueBounds, close] : [dialogueBounds];
    const position = placeContextMenu(area, skull, menuButtonSize, menuGap, avoid, obstacles.current)
      ?? placeContextMenu(viewportBounds(floating.current, dock.current, true), skull, menuButtonSize, menuGap, avoid, obstacles.current);
    panel.toggleAttribute("data-positioned", !!position);
    if (!position) return;
    panel.style.flexDirection = position.direction;
    panel.style.transform = `translate3d(${position.x - skull.x}px, ${position.y - skull.y}px, 0)`;
  }, [menuPanel]);

  useLayoutEffect(() => {
    if (menuOpen) layoutMenu();
  }, [layoutMenu, menuOpen]);

  const layout = useCallback(() => {
    const { open: expanded, position } = workspace.current;
    const visual = surface.current;
    if (!visual) return;
    if (expanded && floating.current && speech.current && bubble.current) {
      const area = viewportBounds(floating.current, dock.current);
      const skull = placeSkull(area, position);
      if (!pointer.current) obstacles.current = mainControls(area);
      // Keep a dragged position; a new player's default can adapt when the viewport changes.
      const placement = `translate3d(${skull.x}px, ${skull.y}px, 0)`;
      for (const element of [floating.current, visual]) {
        element.style.transform = placement;
        element.style.width = `${skull.width}px`;
        element.style.height = `${skull.height}px`;
      }
      const conversation = speech.current;
      const broad = current.current.id === "main" && area.right - area.left >= 820
        ? placeCloud(area, skull, ovalBounds.minHeight, obstacles.current, ovalBounds)
        : null;
      const oval = !!broad && broad.width >= ovalBounds.minWidth && broad.maxHeight >= ovalBounds.minHeight;
      if (oval) conversation.dataset.menuLayout = "oval";
      else delete conversation.dataset.menuLayout;
      const { side, width, maxHeight } = oval ? broad : placeCloud(area, skull, conversation.scrollHeight, obstacles.current);
      conversation.dataset.side = side;
      conversation.style.width = `${width}px`;
      conversation.style.maxHeight = `${maxHeight}px`;
      const overflowing = conversation.scrollHeight > conversation.clientHeight + 1;
      if (overflowing) {
        conversation.setAttribute("data-overflow", "true");
        conversation.tabIndex = 0;
      } else {
        conversation.removeAttribute("data-overflow");
        conversation.removeAttribute("tabindex");
      }
      const origin = cloudOrigin(area, skull, side, width, conversation.offsetHeight, obstacles.current);
      conversation.style.transform = `translate3d(${origin.x - skull.x}px, ${origin.y - skull.y}px, 0)`;
      const bounds = conversation.getBoundingClientRect();
      if (overflowing && composer.current && document.activeElement === questionInput.current) {
        const { bottom, top } = composer.current.getBoundingClientRect();
        if (bottom > bounds.bottom) conversation.scrollTop += Math.ceil(bottom - bounds.bottom);
        else if (top < bounds.top) conversation.scrollTop -= Math.ceil(bounds.top - top);
      }
      const rect = bubble.current.getBoundingClientRect();
      menuLayout.current = { area, skull, speech: bounds };
      if (menuPanel.current?.dataset.mascotMenuOpen === "true") layoutMenu();
      const bubbleVisible = rect.bottom > bounds.top && rect.top < bounds.bottom;
      projection.current = bubbleVisible ? { skull, side, bubble: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } } : null;
      if (tether.current) tether.current.style.visibility = bubbleVisible ? "visible" : "hidden";
      showAnchor(anchor.current);
      return;
    }

    const rect = dock.current?.getBoundingClientRect();
    if (!rect) return;
    menuLayout.current = null;
    projection.current = null;
    visual.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    visual.style.width = `${rect.width}px`;
    visual.style.height = `${rect.height}px`;
  }, [layoutMenu, menuPanel, showAnchor]);

  const finishReveal = useCallback((displayFull: boolean, handoff = true) => {
    if (reveal.current) cancelAnimationFrame(reveal.current.frame);
    cancelAnimationFrame(queuedText.current);
    queuedText.current = 0;
    reveal.current = null;
    renderer.current?.stopTalk();
    if (displayFull && text.current) text.current.textContent = current.current.node.text;
    setRevealing(false);
    if (displayFull && handoff) afterReveal.current(current.current);
  }, []);

  const begin = useCallback((next: ReadyView, animate = true) => {
    cancelFollowup();
    if (reveal.current) cancelAnimationFrame(reveal.current.frame);
    cancelAnimationFrame(queuedText.current);
    queuedText.current = 0;
    const entry = next.node;
    current.current = next;
    if (next.id !== "thinking") lastSettled.current = next;
    setView(next);
    setCopyStatus("");
    if (speech.current) speech.current.scrollTop = 0;
    renderer.current?.stopTalk();
    renderer.current?.setExpression(animate && !reducedMotion ? entry.expression : "Neutral", entry.intensity ?? 1);
    if (animate && !reducedMotion && entry.reaction) renderer.current?.react(entry.reaction);

    if (!animate || reducedMotion || next.id === "thinking") {
      reveal.current = null;
      setRevealing(false);
      if (text.current) {
        text.current.textContent = entry.text;
        if (next.id === "reply" || (animate && next.id !== "thinking")) afterReveal.current(next);
      }
      else queuedText.current = requestAnimationFrame(() => {
        queuedText.current = 0;
        if (workspace.current.open && current.current === next && text.current) {
          text.current.textContent = entry.text;
          if (next.id === "reply" || (animate && next.id !== "thinking")) afterReveal.current(next);
        }
      });
      return;
    }

    setRevealing(true);
    if (text.current) text.current.textContent = "";
    const plan = compileSpeech(entry.text);
    const advance = (time: number) => {
      if (reveal.current !== target) return;
      target.frame = 0;
      if (document.hidden) {
        target.last = null;
        return;
      }
      target.elapsed += target.last === null ? 0 : Math.min(80, time - target.last);
      target.last = time;
      const sample = sampleSpeech(plan, target.elapsed);
      const line = entry.text.slice(0, sample.visibleCount);
      if (text.current && text.current.textContent !== line) text.current.textContent = line;
      target.gain = sample.gain;
      renderer.current?.setTalkGain(sample.gain);
      if (sample.done) {
        finishReveal(true);
        return;
      }
      target.frame = requestAnimationFrame(advance);
    };
    const target: Reveal = { frame: 0, last: null, elapsed: 0, gain: 0, style: entry.style, advance };
    reveal.current = target;
    renderer.current?.startTalk(entry.style, 0);
    if (!document.hidden) target.frame = requestAnimationFrame(advance);
  }, [cancelFollowup, finishReveal, reducedMotion]);

  // Keep the current callbacks available to the one-time workspace hydration.
  const beginRef = useRef(begin);
  useEffect(() => { beginRef.current = begin; }, [begin]);

  useEffect(() => {
    afterReveal.current = (shown) => {
      if (current.current !== shown || !workspace.current.open || completedViews.current.has(shown)) return;
      completedViews.current.add(shown);
      if (shown.questionId && shown.answerInstanceId) trackRef.current({
        type: "answer_display", questionId: shown.questionId, answerInstanceId: shown.answerInstanceId, categoryId: shown.categoryId,
      });
      if (shown.fallback) trackRef.current({ type: "fallback", outcome: shown.fallback });
      if (!isMoraleReply(shown)) return;

      // Reading time uses visible frame time so a hidden tab cannot skip either line.
      let elapsed = 0;
      let last: number | undefined;
      let neutralRequested = false;
      const wait: FrameRequestCallback = (time) => {
        if (current.current !== shown || !workspace.current.open) return;
        if (!document.hidden && last !== undefined) elapsed += Math.min(80, time - last);
        last = document.hidden ? undefined : time;
        if (elapsed >= moraleReadMs) {
          if (shown.id === "welcomeRough") {
            if (!neutralRequested) {
              neutralRequested = true;
              renderer.current?.setExpression("Neutral");
            }
            const sample = renderer.current?.snapshot();
            const settled = !sample || (sample.expression === "Neutral" && sample.expressionPhase === "idle"
              && sample.tearOpacity < .02 && sample.tearDrops === 0);
            if ((settled && elapsed >= moraleReadMs + (reducedMotion ? 0 : 180)) || elapsed >= moraleReadMs + 2600) {
              beginRef.current(dialogueView("welcomeResolve"));
              return;
            }
          } else {
            const pose = renderer.current?.snapshot();
            if (shown.id !== "welcomeReady" || !pose || pose.expressionPhase === "idle" || elapsed >= moraleReadMs + 1800) {
              beginRef.current(mainMenu);
              return;
            }
          }
        }
        followupFrame.current = requestAnimationFrame(wait);
      };
      followupFrame.current = requestAnimationFrame(wait);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!client) return;
    const frame = requestAnimationFrame(() => {
      if (workspace.current !== defaultWorkspace) return;
      const saved = loadWorkspace();
      workspace.current = { ...saved, seenGreeting: saved.open || saved.seenGreeting };
      setOpen(saved.open);
      const initial = saved.seenGreeting ? dialogueView("welcomeReturning") : firstGreeting;
      current.current = initial;
      lastSettled.current = initial;
      if (saved.open) beginRef.current(initial, !saved.seenGreeting);
    });
    return () => cancelAnimationFrame(frame);
  }, [client]);

  useEffect(() => {
    if (!client || !canvas.current) return;
    let cancelled = false;
    let controller: MascotRenderer | null = null;
    const currentCanvas = canvas.current;
    const start = async () => {
      try {
        const create = await loadMascotRenderer();
        if (cancelled) return;
        controller = create({ canvas: currentCanvas,
          onStatus: (value) => { if (!cancelled) setStatus(value); }, onAnchor: showAnchor });
        renderer.current = controller;
        controller.setReducedMotion(matchMedia(reducedQuery).matches);
        controller.setMode(workspace.current.open ? "floating" : "dock");
        controller.setDragging(Boolean(pointer.current?.moved));
        if (workspace.current.open && (reveal.current || current.current.id === "thinking")) {
          const entry = current.current.node;
          controller.setExpression(entry.expression, entry.intensity ?? 1);
          if (reveal.current) controller.startTalk(reveal.current.style, reveal.current.gain);
        }
        await controller.ready;
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    // Give the page a paint before downloading WebGL code and the 3D asset.
    const frame = requestAnimationFrame(() => { void start(); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      controller?.dispose();
      if (renderer.current === controller) renderer.current = null;
    };
  }, [client, showAnchor]);

  useEffect(() => {
    renderer.current?.setReducedMotion(reducedMotion);
    if (reducedMotion && reveal.current) {
      renderer.current?.setExpression("Neutral");
      const frame = requestAnimationFrame(() => finishReveal(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [finishReveal, reducedMotion]);

  useEffect(() => {
    renderer.current?.setMode(open ? "floating" : "dock");
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    layout();
    const observer = new ResizeObserver(schedule);
    for (const element of [dock.current, speech.current, bubble.current]) {
      if (element) observer.observe(element);
    }
    const viewport = window.visualViewport;
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [client, layout, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(layout);
    return () => cancelAnimationFrame(frame);
  }, [layout, open, view]);

  useLayoutEffect(() => {
    if (!moveFocus.current || !open) return;
    moveFocus.current = false;
    bubble.current?.focus({ preventScroll: true });
  }, [open, view]);

  useEffect(() => {
    let frame = 0;
    const leavePage = () => {
      abortPending();
      cancelFollowup();
      context.current = undefined;
      setQuestion("");
      const activeView = current.current;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        dismissMenu();
        if (current.current !== activeView) return;
        if (!workspace.current.open) {
          if (lastSettled.current.id === "reply" || isMoraleReply(lastSettled.current)) lastSettled.current = mainMenu;
          return;
        }
        if (activeView.id === "thinking" || activeView.id === "reply" || isMoraleReply(activeView)) begin(mainMenu, false);
        else finishReveal(true, false);
        layout();
      });
    };
    if (previousPath.current !== locationKey) {
      previousPath.current = locationKey;
      leavePage();
    }
    window.addEventListener("hashchange", leavePage);
    window.addEventListener("popstate", leavePage);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", leavePage);
      window.removeEventListener("popstate", leavePage);
    };
  }, [abortPending, begin, cancelFollowup, dismissMenu, finishReveal, layout, locationKey]);

  useEffect(() => {
    const onVisibility = () => {
      const target = reveal.current;
      if (!target) return;
      if (document.hidden) {
        cancelAnimationFrame(target.frame);
        target.frame = 0;
        target.last = null;
      } else if (!target.frame) {
        target.frame = requestAnimationFrame(target.advance);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      abortPending();
      cancelFollowup();
      if (reveal.current) cancelAnimationFrame(reveal.current.frame);
      cancelAnimationFrame(queuedText.current);
      if (dockingTimer.current !== null) window.clearTimeout(dockingTimer.current);
      if (cloudExitTimer.current !== null) window.clearTimeout(cloudExitTimer.current);
    };
  }, [abortPending, cancelFollowup]);

  function openAssistant() {
    if (workspace.current.open) return;
    usage.track({ type: "manual_open" });
    if (cloudExitTimer.current !== null) window.clearTimeout(cloudExitTimer.current);
    cloudExitTimer.current = null;
    setCloudExit(null);
    if (dockingTimer.current !== null) window.clearTimeout(dockingTimer.current);
    dockingTimer.current = null;
    surface.current?.removeAttribute("data-mascot-travel");
    const animate = !workspace.current.seenGreeting;
    workspace.current = { ...workspace.current, open: true, seenGreeting: true };
    saveWorkspace(workspace.current);
    setOpen(true);
    begin(lastSettled.current, animate);
  }

  function dockAssistant() {
    if (!workspace.current.open) return;
    const restoreFocus = floating.current?.contains(document.activeElement);
    abortPending();
    cancelFollowup();
    dismissMenu();
    if (pointer.current?.moved) renderer.current?.setDragging(false);
    pointer.current = null;
    if (!reducedMotion) {
      setCloudExit({ revealing });
      cloudExitTimer.current = window.setTimeout(() => {
        setCloudExit(null);
        cloudExitTimer.current = null;
      }, 160);
    }
    finishReveal(false);
    setQuestion("");
    if (isMoraleReply(lastSettled.current)) lastSettled.current = mainMenu;
    workspace.current = { ...workspace.current, open: false };
    saveWorkspace(workspace.current);
    renderer.current?.setExpression("Neutral", 1);
    if (!reducedMotion && surface.current && status === "ready") {
      surface.current.setAttribute("data-mascot-travel", "docking");
      dockingTimer.current = window.setTimeout(() => {
        surface.current?.removeAttribute("data-mascot-travel");
        dockingTimer.current = null;
      }, 460);
    }
    setOpen(false);
    if (restoreFocus) dock.current?.focus({ preventScroll: true });
  }

  function moveTo(position: Point) {
    if (!floating.current) return;
    workspace.current = { ...workspace.current, position };
    layout();
    const { x, y } = floating.current.getBoundingClientRect();
    workspace.current = { ...workspace.current, position: { x, y } };
  }

  function dragStart(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !floating.current) return;
    const { x, y } = floating.current.getBoundingClientRect();
    pointer.current = { id: event.pointerId, origin: { x, y },
      start: { x: event.clientX, y: event.clientY }, startedAt: event.timeStamp, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const action = pointer.current;
    if (!action || action.id !== event.pointerId) return;
    const x = event.clientX - action.start.x;
    const y = event.clientY - action.start.y;
    if (!action.moved) {
      if (Math.hypot(x, y) < 6) return;
      action.moved = true;
      renderer.current?.setDragging(true);
    }
    moveTo({ x: action.origin.x + x, y: action.origin.y + y });
  }

  function dragEnd(event: PointerEvent<HTMLButtonElement>) {
    const action = pointer.current;
    if (action?.id !== event.pointerId) return;
    if (action.moved) {
      renderer.current?.setDragging(false);
      saveWorkspace(workspace.current);
    }
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!action.moved && event.type === "pointerup" && (event.pointerType === "touch" || event.pointerType === "pen")
      && event.timeStamp - action.startedAt < 500
      && Math.hypot(event.clientX - action.start.x, event.clientY - action.start.y) < 6) {
      toggleMenu("touch");
    }
  }

  function moveByArrow(event: KeyboardEvent<HTMLButtonElement>) {
    if (!floating.current || !event.key.startsWith("Arrow")) return;
    const position = floating.current.getBoundingClientRect();
    event.preventDefault();
    const step = event.shiftKey ? 40 : 14;
    moveTo({ x: position.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      y: position.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) });
    saveWorkspace(workspace.current);
  }

  function changeView(next: ReadyView, animate = false) {
    const focused = document.activeElement;
    moveFocus.current = !!focused && (focused === grip.current || !!speech.current?.contains(focused))
      && focused.matches(":focus-visible");
    abortPending();
    dismissMenu();
    begin(next, animate);
  }

  function pick(answer: DialogueAnswer) {
    if (current.current !== view || reveal.current) return;
    usage.track({ type: "engage" });
    changeView(dialogueView(answer.next), true);
  }

  function openCategory(category: (typeof readyCategories)[number]) {
    if (current.current !== view) return;
    usage.track({ type: "category_select", categoryId: category.id });
    changeView(categoryView(category));
  }

  function choose(choice: ReadyMenuChoice, parent = view) {
    if (current.current !== view) return;
    if (choice.kind === "group") {
      changeView({
        id: "submenu", node: neutralNode(choice.message), categoryId: parent.categoryId, choices: choice.choices, parent,
      });
    } else if (choice.kind === "question") void ask({ kind: "question", id: choice.id }, parent);
    else void ask({ kind: "action", id: choice.id }, parent);
  }

  async function ask(request: ReadyIntent | { kind: "search"; query: string }, parent: ReadyView, selected?: ReadyContext) {
    const categoryId = parent.categoryId;
    if (!workspace.current.open || current.current !== view) return;
    const eventSlug = pathname === "/tournaments" ? searchParams?.get("tournament") ?? undefined : undefined;
    const matchId = eventSlug ? searchParams?.get("match") ?? undefined : undefined;
    const scope = selected ?? { eventSlug, matchId, ...context.current };
    const payload = readReadyRequest({ ...request, context: scope }) ?? readReadyRequest(request);
    if (!payload) return;
    if (request.kind === "question") {
      usage.track({ type: "question_select", questionId: request.id, categoryId });
    } else {
      usage.track({ type: "engage" });
    }
    changeView({ id: "thinking", node: neutralNode("Checking the site, Commander…"), parent, categoryId });
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch("/api/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const answer = await response.json() as Partial<ReadyReply> | null;
      if (pending.current !== controller || !workspace.current.open) return;
      if (controller.signal.aborted || typeof answer?.text !== "string" || !answer.text.trim()) {
        trackRef.current({ type: "technical_error", outcome: controller.signal.aborted ? "timeout" : "invalid_reply" });
        begin(replyView(unavailableReply, parent, "unavailable"));
        return;
      }
      const next = answer as ReadyReply;
      if (response.ok) context.current = next.context ?? scope;
      if (next.searchOutcome) trackRef.current({
        type: "search_outcome", outcome: next.searchOutcome, questionId: next.intent?.kind === "question" ? next.intent.id : undefined,
      });
      if (response.status >= 500) trackRef.current({ type: "technical_error", outcome: "request_failed" });
      const fallback = next.searchOutcome === "no_result" ? "no_result"
        : !response.ok ? "unavailable" : next.fallback ? "unsupported" : undefined;
      begin(replyView(next, parent, fallback));
    } catch {
      if (pending.current === controller && workspace.current.open) {
        trackRef.current({ type: "technical_error", outcome: controller.signal.aborted ? "timeout" : "request_failed" });
        begin(replyView(unavailableReply, parent, "unavailable"));
      }
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || [...trimmed].length > READY_QUESTION_LIMIT) return;
    setQuestion("");
    void ask({ kind: "search", query: trimmed }, searchMenu);
  }

  function actionPicked(actionId?: ReadyActionId) {
    cancelFollowup();
    if (actionId) usage.track({ type: "action_click", actionId, categoryId: view.categoryId, questionId: view.questionId });
  }

  async function copyReference(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      if (current.current === view) setCopyStatus("Match reference copied.");
    } catch {
      if (current.current === view) setCopyStatus(value);
    }
  }

  function vote(helpful: boolean) {
    const { answerInstanceId, questionId } = view;
    if (current.current !== view || !answerInstanceId || !questionId || voteRef.current.has(answerInstanceId)) return;
    voteRef.current.set(answerInstanceId, helpful);
    setVotes(new Map(voteRef.current));
    usage.track({ type: "helpfulness", questionId, answerInstanceId, helpful });
  }

  const displayRevealing = cloudExit?.revealing ?? revealing;
  const cloudExiting = !open ? "true" : undefined;
  const voted = view.answerInstanceId ? votes.get(view.answerInstanceId) : undefined;
  const related = voted === false ? readyCategories.find((item) => item.id === (view.parent?.categoryId ?? view.categoryId)) : undefined;

  return (
    <div className={styles.brand}>
      <TouchButton aria-controls={open ? "ironclad-assistant" : undefined} aria-expanded={open} aria-label="Open Ready, the IronClad assistant"
        className={styles.dock} data-ready-dock="" onActivate={openAssistant} ref={dock} tabIndex={open ? -1 : 0} title="Open Ready" type="button">
        {!open && status !== "ready" && <Image alt="" className={styles.poster} height={56} src={poster} unoptimized width={56} />}
      </TouchButton>
      {client && createPortal(<>
        <div aria-hidden="true" className={styles.surface} data-asset-status={status} data-mode={open ? "floating" : "dock"} ref={surface}>
          <canvas className={styles.canvas} ref={canvas} />
        </div>

        {(open || cloudExit) && <>
          <span aria-hidden="true" className={styles.tether} data-exiting={cloudExiting} data-thought-trail="" ref={tether}>
            <span /><span /><span />
          </span>
          <section aria-label="Ready, the IronClad assistant" className={styles.assistant}
            aria-hidden={open ? undefined : true} inert={!open}
            data-dialogue-node={nodeId} id="ironclad-assistant" ref={floating}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              if (menuOpen) dismissMenu(true);
              else dockAssistant();
            }}>
            {open && status !== "ready" && <>
              <Image alt="IronClad mascot poster" className={styles.artPoster} fill sizes="320px" src={poster} unoptimized />
              <span aria-live="polite" className={styles.assetNotice}>{status === "loading" ? "Loading 3D mascot…" : "3D unavailable. Text controls are available."}</span>
            </>}
            {open && <>
              <button aria-controls="ironclad-cloud-menu" aria-expanded={menuOpen}
                aria-label="Move assistant with drag or arrow keys" className={styles.grip} data-mascot-drag="" ref={grip}
                {...menuEvents} onClick={(event) => { if (event.detail === 0) toggleMenu("keyboard"); }}
                onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd}
                onPointerCancel={dragEnd} onLostPointerCapture={dragEnd} onKeyDown={moveByArrow} type="button" />
              <div aria-label="IronClad quick actions" className={styles.contextMenu} data-mascot-menu=""
                data-mascot-menu-open={menuOpen ? "true" : undefined} id="ironclad-cloud-menu" inert={!menuOpen}
                ref={menuPanel} role="group" style={{ gap: menuGap }} {...menuEvents}>
                <TouchButton className={styles.answer} onActivate={() => { dismissMenu(true); changeView(dialogueView("welcomeReturning"), true); }}
                  style={menuButtonSize} type="button">
                  <ThoughtCloudShape variant="answer" />
                  <span>Welcome</span>
                </TouchButton>
                <TouchButton className={styles.answer} onActivate={() => {
                  usage.track({ type: "engage" });
                  dismissMenu(true);
                  changeView(mainMenu);
                }}
                  style={menuButtonSize} type="button">
                  <ThoughtCloudShape variant="answer" />
                  <span>Help</span>
                </TouchButton>
              </div>
              <TouchButton aria-label="Dock assistant" className={styles.close} onActivate={dockAssistant} ref={closeButton} title="Dock assistant" type="button">
                <span aria-hidden="true">×</span>
              </TouchButton>
            </>}

            <div aria-label="Assistant message and answers" className={styles.speech} data-mascot-dialogue="" ref={speech} role="group"
              data-exiting={cloudExiting} data-revealing={displayRevealing ? "true" : undefined} data-ready-view={nodeId}>
              <div className={styles.bubble} data-thought-cloud="" ref={bubble} tabIndex={-1}>
                <ThoughtCloudShape variant="main" />
                <div className={styles.messageLayout}>
                  <p aria-hidden="true" className={`${styles.message} ${styles.messageReserve}`}>{node.text}</p>
                  <p aria-hidden="true" className={styles.message} data-mascot-message="" ref={text} />
                </div>
                <p aria-live="polite" aria-atomic="true" className={styles.srOnly}>{displayRevealing ? "" : node.text}</p>
                {!displayRevealing && reply && <ReadySources details={reply.details} sources={reply.sources} />}
                {open && nodeId === "search" && <form aria-label="Search Ready’s prepared answers" className={styles.composer} onSubmit={submit} ref={composer}>
                  <input aria-label="Ask about IronClad" autoComplete="off" maxLength={READY_QUESTION_LIMIT}
                    name="question" onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about IronClad…"
                    ref={questionInput} type="text" value={question} enterKeyHint="send" />
                  <button aria-label="Send question" className={styles.answer} disabled={!question.trim()} type="submit">
                    <ThoughtCloudShape variant="answer" />
                    <span>Ask</span>
                  </button>
                </form>}
              </div>
              <div className={styles.answerZone}>
                <div className={styles.answers} inert={displayRevealing}>
                  {node.answers.map((answer) => (
                    <TouchButton className={styles.answer} data-answer-cloud="" key={answer.id} onActivate={() => pick(answer)} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{answer.label}</span>
                    </TouchButton>
                  ))}
                  {nodeId === "main" && readyCategories.map((category) => (
                    <TouchButton className={styles.answer} data-answer-cloud="" data-ready-category={category.id}
                      key={category.id} onActivate={() => openCategory(category)} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{category.label}</span>
                    </TouchButton>
                  ))}
                  {view.choices?.map((choice) => (
                    <TouchButton className={styles.answer} data-answer-cloud="" data-ready-choice={choice.id}
                      key={choice.id} onActivate={() => choose(choice)} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{choice.label}</span>
                    </TouchButton>
                  ))}
                  {reply?.actions?.map((action) => {
                    if ("href" in action) return <ReadyCloudLink href={action.href} key={action.href} label={action.label}
                      onActivate={() => actionPicked(action.actionId)} />;
                    return <TouchButton className={styles.answer} data-answer-cloud="" key={action.label} onActivate={() => {
                      if ("intent" in action) void ask(action.intent, view, action.context);
                      else if ("copyText" in action) {
                        actionPicked(action.actionId);
                        void copyReference(action.copyText);
                      }
                    }} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{action.label}</span>
                    </TouchButton>;
                  })}
                </div>
                {displayRevealing && nodeId !== "main" && <div className={styles.revealAction}>
                  <TouchButton className={styles.textAction} onActivate={() => finishReveal(true)} type="button">Show full message</TouchButton>
                </div>}
              </div>
              {!displayRevealing && view.questionId && view.answerInstanceId && <div className={styles.feedback} aria-label="Answer feedback" role="group">
                {voted === undefined ? <>
                  <span>Was this helpful?</span>
                  <TouchButton className={styles.textAction} onActivate={() => vote(true)} type="button">Helpful</TouchButton>
                  <TouchButton className={styles.textAction} onActivate={() => vote(false)} type="button">Still need help</TouchButton>
                </> : <span role="status">{voted ? "Glad that helped, Commander." : "Try another topic or contact an admin, Commander."}</span>}
                {voted === false && <div className={styles.readyFooter}>
                  {related && <TouchButton className={styles.textAction} onActivate={() => openCategory(related)} type="button">
                    More about {related.label.toLowerCase()}
                  </TouchButton>}
                  <TouchButton className={styles.textAction} onActivate={() => {
                    const support = readyCategories.find((item) => item.id === "support");
                    if (support) openCategory(support);
                  }} type="button">Contact an admin</TouchButton>
                </div>}
              </div>}
              {nodeId === "main" && <div className={styles.readyFooter} inert={displayRevealing}>
                <TouchButton className={styles.textAction} onActivate={() => changeView(searchMenu)} type="button">Search prepared answers</TouchButton>
                {usage.loaded && <details className={styles.analyticsChoice}>
                  <summary>Ready analytics</summary>
                  <div className={styles.analyticsNotice}>
                    <p>Optional for Staging reviewers. Ready usage analytics counts deliberate interactions such as chosen topics and link clicks. It does not collect what you type, morale choices, or private match details. Ready works the same with this off.</p>
                    <label><input checked={usage.enabled} disabled={usage.saving || usage.withdrawalPending} onChange={(event) => {
                      void usage.setEnabled(event.currentTarget.checked);
                    }} type="checkbox" /> Allow Ready usage analytics</label>
                    {usage.withdrawalPending && <TouchButton className={styles.textAction} disabled={usage.saving}
                      onActivate={() => { void usage.setEnabled(false); }} type="button">Turn off</TouchButton>}
                    {usage.error && <p role="status">{usage.error}</p>}
                  </div>
                </details>}
              </div>}
              {view.parent && <div className={styles.readyFooter} aria-label="Ready menu navigation" role="group">
                {nodeId !== "search" && <TouchButton className={styles.textAction} onActivate={() => {
                  if (view.parent) changeView(view.parent);
                }} type="button">Back</TouchButton>}
                <TouchButton className={styles.textAction} onActivate={() => changeView(mainMenu)} type="button">Main menu</TouchButton>
              </div>}
              {copyStatus && <output className={styles.copyStatus}>{copyStatus}</output>}
            </div>
          </section>

        </>}
      </>, document.body)}
    </div>
  );
}
