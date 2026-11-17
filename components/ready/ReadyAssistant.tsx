"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentPropsWithRef, FormEvent, KeyboardEvent, PointerEvent, TouchEvent } from "react";
import { createPortal, flushSync } from "react-dom";

import { READY_MAIN_MESSAGE, readyCategories, readyQuestionCatalogue } from "@/lib/ready/catalogue";
import type { ReadyActionId, ReadyCategoryId, ReadyMenuChoice, ReadyQuestionId } from "@/lib/ready/catalogue";
import { readReadyRequest } from "@/lib/ready/contracts";
import type { ReadyContext, ReadyIntent, ReadyReply } from "@/lib/ready/contracts";
import { READY_SUGGESTION_MAX_LENGTH } from "@/lib/ready/suggestion-contract";
import { useReadyUsage } from "@/lib/ready/use-ready-usage";
import { dialogue } from "./dialogue";
import type { DialogueAnswer, DialogueId, DialogueNode } from "./dialogue";
import { dialogueRect, placeContextMenu, placeReady, thoughtTrail } from "./floating-layout";
import type { Bounds, Point, ReadyPosition, Rect, Side } from "./floating-layout";
import { loadMascotRenderer } from "./renderer";
import type { MascotRenderer, TalkStyle } from "./renderer";
import { compileSpeech, sampleSpeech } from "./speech";
import ThoughtCloudShape from "./ThoughtCloudShape";
import { ReadyCloudLink, ReadySources } from "./ReadyReplyContent";
import ReadyPoster from "./ReadyPoster";
import { useMascotCloudMenu } from "./useMascotCloudMenu";
import styles from "./ReadyAssistant.module.css";

type Workspace = { open: boolean; position: ReadyPosition | null; seenGreeting: boolean };
type ReadyView = {
  id: DialogueId | "main" | "submenu" | "thinking" | "reply" | "feedback" | "copyStatus" | "topicMissing" | "suggestionSaved";
  node: DialogueNode;
  categoryId?: ReadyCategoryId;
  choices?: readonly ReadyMenuChoice[];
  parent?: ReadyView;
  reply?: ReadyReply;
  questionId?: ReadyQuestionId;
  answerInstanceId?: string;
  fallback?: "unavailable" | "unsupported";
};
type Drag = { id: number; origin: Point; start: Point; startedAt: number; moved: boolean };
type Tap = { id: number; target: HTMLButtonElement; start: Point };
type Reveal = { frame: number; last: number | null; elapsed: number; gain: number; style: TalkStyle; advance: FrameRequestCallback };
type AssetStatus = "loading" | "ready" | "error";

const defaultWorkspace: Workspace = { open: false, position: null, seenGreeting: false };
const requestTimeoutMs = 12000;
const reducedQuery = "(prefers-reduced-motion: reduce)";
const resumeOnClient = () => true;
const pauseOnServer = () => false;
const subscribeClient = () => () => undefined;
const menuGap = 6;
const moraleReadMs = 2050;
const neutralNode = (text: string): DialogueNode => ({ text, expression: "Neutral", style: "Talk_Normal", answers: [] });
const dialogueView = (id: DialogueId): ReadyView => ({ id, node: dialogue[id] });
const firstGreeting = dialogueView("welcomeFirst");
const mainMenu: ReadyView = { id: "main", node: neutralNode(READY_MAIN_MESSAGE) };
const suggestionPrompt = "Something missing, Commander? Tell us which topic or question you wanted Ready to cover.";
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

function isLookupReply(view: ReadyView) {
  return view.id === "reply" || view.id === "feedback" || view.id === "copyStatus";
}

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(reducedQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function loadWorkspace(key: string): Workspace {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return defaultWorkspace;
    const value = JSON.parse(raw) as Partial<Workspace>;
    return {
      open: value.open === true,
      seenGreeting: value.seenGreeting === true,
      position: value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
        ? {
          x: value.position.x, y: value.position.y,
          width: typeof value.position.width === "number" && Number.isFinite(value.position.width) && value.position.width > 0
            ? value.position.width : undefined,
        } : null,
    };
  } catch {
    return defaultWorkspace;
  }
}

function saveWorkspace(key: string, value: Workspace) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The assistant still works while browser storage is unavailable.
  }
}

function viewportBounds(element: HTMLElement, logo: HTMLElement | null): Bounds {
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
    bottom: top + height - inset("bottom") - margin,
  };
}

function mainControls(area: Bounds): Rect[] {
  return Array.from(document.querySelectorAll("main a[href],main button:not([disabled]),main summary")).flatMap((control) => {
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

export default function ReadyAssistant({ workspaceScope, signedIn }: { workspaceScope: string; signedIn: boolean }) {
  const workspaceKey = `ironclad-ready:workspace:v2:${workspaceScope}`;
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
  const suggestionId = useId();
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const suggestionAttempt = useRef<{ submissionId: string; description: string } | null>(null);
  const suggestionForm = useRef<HTMLFormElement>(null);
  const usage = useReadyUsage(signedIn);
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
  const text = useRef<HTMLParagraphElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tether = useRef<HTMLSpanElement>(null);
  const renderer = useRef<MascotRenderer | null>(null);
  const workspace = useRef<Workspace>(defaultWorkspace);
  const openedThisMount = useRef(false);
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
  const dragFrame = useRef(0);
  const nextDragPosition = useRef<Point | null>(null);
  const anchor = useRef<Point>({ x: .5, y: .69 });
  const projection = useRef<{ skull: Rect; bubble: Rect; side: Side; compact: boolean } | null>(null);
  const obstacles = useRef<Rect[]>([]);
  const lastPlacement = useRef<ReturnType<typeof placeReady> | undefined>(undefined);
  const menuLayout = useRef<{ area: Bounds; skull: Rect; speech: Rect } | null>(null);
  const dockingTimer = useRef<number | null>(null);
  const cloudExitTimer = useRef<number | null>(null);
  const previousPath = useRef(locationKey);

  const { id: nodeId, node, reply } = view;
  const hasSuggestionForm = nodeId === "topicMissing";

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
    const { skull, bubble: rect, side, compact } = projection.current;
    const mouth = { x: skull.x + skull.width * point.x, y: skull.y + skull.height * point.y };
    if (!tether.current) return;
    const points = thoughtTrail(skull, rect, side, mouth);
    const beads = tether.current.children;
    for (let index = 0; index < beads.length; index += 1) {
      const bead = beads[index] as HTMLSpanElement;
      const location = points[index];
      const hidden = !location || (compact && obstacles.current.some(({ x, y, width, height }) =>
        location.x + 5 > x && location.x - 5 < x + width && location.y + 5 > y && location.y - 5 < y + height));
      if (bead.hidden !== hidden) bead.hidden = hidden;
      if (hidden || !location) continue;
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
    const menuButtonSize = Array.from(panel.querySelectorAll("button")).reduce((size, button) => ({
      width: Math.max(size.width, button.offsetWidth),
      height: Math.max(size.height, button.offsetHeight),
    }), { width: 0, height: 0 });
    const position = placeContextMenu(area, skull, menuButtonSize, menuGap, avoid, obstacles.current);
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
      const conversation = speech.current;
      const compact = area.right - area.left < 620 || area.bottom - area.top < 420;
      conversation.toggleAttribute("data-compact-placement", compact);
      obstacles.current = position ? [] : mainControls(area);
      const placement = placeReady(area, position, {
        height: conversation.scrollHeight,
        bubbleHeight: bubble.current.offsetHeight,
        main: current.current.id === "main",
        roomy: current.current.id === "topicMissing" || !!bubble.current.querySelector("details[open]"),
        editing: compact && document.activeElement instanceof HTMLTextAreaElement &&
          conversation.contains(document.activeElement),
      }, obstacles.current, lastPlacement.current);
      lastPlacement.current = placement;
      const { skull, dialogue: slot } = placement;
      const skullTransform = `translate3d(${skull.x}px, ${skull.y}px, 0)`;
      for (const element of [floating.current, visual]) {
        element.style.transform = skullTransform;
        element.style.width = `${skull.width}px`;
        element.style.height = `${skull.height}px`;
      }
      if (slot.oval) conversation.dataset.menuLayout = "oval";
      else delete conversation.dataset.menuLayout;
      conversation.dataset.side = slot.side;
      conversation.style.width = `${slot.width}px`;
      conversation.style.maxHeight = `${slot.maxHeight}px`;
      const overflowing = conversation.scrollHeight > conversation.clientHeight + 1;
      if (overflowing) {
        conversation.setAttribute("data-overflow", "true");
        conversation.tabIndex = 0;
      } else {
        conversation.removeAttribute("data-overflow");
        conversation.removeAttribute("tabindex");
      }
      const bounds = dialogueRect(slot, conversation.offsetHeight);
      conversation.style.transform = `translate3d(${bounds.x - skull.x}px, ${bounds.y - skull.y}px, 0)`;
      const rect = bubble.current.getBoundingClientRect();
      menuLayout.current = { area, skull, speech: bounds };
      if (menuPanel.current?.dataset.mascotMenuOpen === "true") layoutMenu();
      const top = Math.max(bounds.y, rect.top);
      const height = Math.min(bounds.y + bounds.height, rect.bottom) - top;
      const bubbleVisible = height > 10;
      projection.current = bubbleVisible
        ? { skull, side: slot.side, compact, bubble: { x: rect.left, y: top, width: rect.width, height } }
        : null;
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

  function skipReply() {
    finishReveal(true);
    if (speech.current) speech.current.scrollTop = 0;
    bubble.current?.focus({ preventScroll: true });
  }

  const begin = useCallback((next: ReadyView, newReply = true) => {
    cancelFollowup();
    if (reveal.current) cancelAnimationFrame(reveal.current.frame);
    cancelAnimationFrame(queuedText.current);
    queuedText.current = 0;
    const entry = next.node;
    const speak = newReply && next.id !== "thinking" && !reducedMotion;
    current.current = next;
    if (next.id !== "thinking") lastSettled.current = next;
    setView(next);
    if (speech.current) speech.current.scrollTop = 0;
    renderer.current?.stopTalk();
    renderer.current?.setExpression(speak ? entry.expression : "Neutral", entry.intensity ?? 1);
    if (speak && entry.reaction) renderer.current?.react(entry.reaction);

    if (!speak) {
      reveal.current = null;
      setRevealing(false);
      if (text.current) {
        text.current.textContent = entry.text;
        if (next.id === "reply" || (newReply && next.id !== "thinking")) afterReveal.current(next);
      }
      else queuedText.current = requestAnimationFrame(() => {
        queuedText.current = 0;
        if (workspace.current.open && current.current === next && text.current) {
          text.current.textContent = entry.text;
          if (next.id === "reply" || (newReply && next.id !== "thinking")) afterReveal.current(next);
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
      if (shown.id === "reply" && shown.questionId && shown.answerInstanceId) trackRef.current({
        type: "answer_display", questionId: shown.questionId, answerInstanceId: shown.answerInstanceId, categoryId: shown.categoryId,
      });
      if (shown.id === "reply" && shown.fallback) trackRef.current({ type: "fallback", outcome: shown.fallback });
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
      const saved = loadWorkspace(workspaceKey);
      workspace.current = { ...saved, seenGreeting: saved.open || saved.seenGreeting };
      openedThisMount.current = saved.open;
      setOpen(saved.open);
      const initial = saved.seenGreeting ? dialogueView("welcomeReturning") : firstGreeting;
      current.current = initial;
      lastSettled.current = initial;
      if (saved.open) beginRef.current(initial, !saved.seenGreeting);
    });
    return () => cancelAnimationFrame(frame);
  }, [client, workspaceKey]);

  useEffect(() => {
    if (!client || !canvas.current) return;
    let cancelled = false;
    let controller: MascotRenderer | null = null;
    const currentCanvas = canvas.current;
    const start = async () => {
      try {
        const create = await loadMascotRenderer();
        if (cancelled) return;
        controller = create({
          canvas: currentCanvas,
          onStatus: (value) => {
            if (cancelled) return;
            // Swap layers before the compositor presents the first WebGL draw.
            if (value === "ready") flushSync(() => setStatus(value));
            else setStatus(value);
          },
          onAnchor: showAnchor,
        });
        renderer.current = controller;
        controller.setReducedMotion(matchMedia(reducedQuery).matches);
        controller.setMode(workspace.current.open ? "floating" : "dock");
        controller.setDragging(Boolean(pointer.current?.moved));
        if (workspace.current.open && (reveal.current || current.current.id === "thinking")) {
          const entry = current.current.node;
          controller.setExpression(entry.expression, entry.intensity ?? 1);
          if (reveal.current) {
            if (entry.reaction) controller.react(entry.reaction);
            controller.startTalk(reveal.current.style, reveal.current.gain);
          }
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
    let followField = false;
    const conversation = speech.current;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const revealField = followField;
        followField = false;
        layout();
        const field = document.activeElement;
        if (!revealField || !(field instanceof HTMLTextAreaElement) || !conversation?.contains(field)) return;
        const visible = conversation.getBoundingClientRect();
        const target = field.getBoundingClientRect();
        if (target.top < visible.top + 8 || target.bottom > visible.bottom - 8) {
          conversation.scrollTop += target.top - visible.top - 8;
        }
      });
    };
    const resize = () => { followField = true; schedule(); };
    const focusEditor = (event: FocusEvent) => { if (event.target instanceof HTMLTextAreaElement) resize(); };
    layout();
    const observer = new ResizeObserver(schedule);
    for (const element of [dock.current, speech.current, bubble.current]) {
      if (element) observer.observe(element);
    }
    const viewport = window.visualViewport;
    conversation?.addEventListener("focusin", focusEditor);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      conversation?.removeEventListener("focusin", focusEditor);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", resize);
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
      if (pointer.current?.moved) renderer.current?.setDragging(false);
      pointer.current = null;
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
      nextDragPosition.current = null;
      context.current = undefined;
      const activeView = current.current;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        dismissMenu();
        if (current.current !== activeView) return;
        setSavingSuggestion(false);
        if (!workspace.current.open) {
          if (isLookupReply(lastSettled.current) || isMoraleReply(lastSettled.current)) lastSettled.current = mainMenu;
          return;
        }
        if (activeView.id === "thinking" || isLookupReply(activeView) || isMoraleReply(activeView)) begin(mainMenu, false);
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
      cancelAnimationFrame(dragFrame.current);
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
    const newReply = !openedThisMount.current;
    openedThisMount.current = true;
    workspace.current = { ...workspace.current, open: true, seenGreeting: true };
    saveWorkspace(workspaceKey, workspace.current);
    setOpen(true);
    begin(lastSettled.current, newReply);
  }

  function dockAssistant() {
    if (!workspace.current.open) return;
    const restoreFocus = floating.current?.contains(document.activeElement);
    abortPending();
    setSavingSuggestion(false);
    cancelFollowup();
    dismissMenu();
    if (pointer.current?.moved) renderer.current?.setDragging(false);
    pointer.current = null;
    cancelAnimationFrame(dragFrame.current);
    dragFrame.current = 0;
    nextDragPosition.current = null;
    if (!reducedMotion) {
      setCloudExit({ revealing });
      cloudExitTimer.current = window.setTimeout(() => {
        setCloudExit(null);
        cloudExitTimer.current = null;
      }, 160);
    }
    finishReveal(false);
    if (isMoraleReply(lastSettled.current)) lastSettled.current = mainMenu;
    workspace.current = { ...workspace.current, open: false };
    saveWorkspace(workspaceKey, workspace.current);
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
    workspace.current = { ...workspace.current, position: { ...position, width: lastPlacement.current?.skull.width } };
    layout();
    const skull = lastPlacement.current?.skull;
    if (skull) workspace.current = { ...workspace.current, position: { x: skull.x, y: skull.y, width: skull.width } };
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
    nextDragPosition.current = { x: action.origin.x + x, y: action.origin.y + y };
    if (dragFrame.current) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = 0;
      const target = nextDragPosition.current;
      nextDragPosition.current = null;
      if (target) moveTo(target);
    });
  }

  function dragEnd(event: PointerEvent<HTMLButtonElement>) {
    const action = pointer.current;
    if (action?.id !== event.pointerId) return;
    if (action.moved) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
      const target = nextDragPosition.current;
      nextDragPosition.current = null;
      if (target) moveTo(target);
      renderer.current?.setDragging(false);
      saveWorkspace(workspaceKey, workspace.current);
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
    saveWorkspace(workspaceKey, workspace.current);
  }

  function changeView(next: ReadyView) {
    const focused = document.activeElement;
    moveFocus.current = !!focused && (focused === grip.current || !!speech.current?.contains(focused))
      && focused.matches(":focus-visible");
    abortPending();
    setSavingSuggestion(false);
    dismissMenu();
    begin(next);
  }

  function pick(answer: DialogueAnswer) {
    if (current.current !== view || reveal.current) return;
    usage.track({ type: "engage" });
    changeView(dialogueView(answer.next));
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

  async function ask(request: ReadyIntent, parent: ReadyView, selected?: ReadyContext) {
    const categoryId = parent.categoryId;
    if (!workspace.current.open || current.current !== view) return;
    const eventSlug = pathname === "/tournaments" ? searchParams?.get("tournament") ?? undefined : undefined;
    const matchId = eventSlug ? searchParams?.get("match") ?? undefined : undefined;
    const historical = request.kind === "action" && request.id === "past-match";
    const scope = selected ?? (historical ? { eventSlug } : { eventSlug, matchId, ...context.current });
    const payload = readReadyRequest({ ...request, context: scope }) ?? readReadyRequest(request);
    if (!payload) return;
    if (request.kind === "question") {
      usage.track({ type: "question_select", questionId: request.id, categoryId });
    } else {
      usage.track({ type: "engage" });
    }
    changeView({ id: "thinking", node: neutralNode("Checking the site…"), parent, categoryId });
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
      if (response.status >= 500) trackRef.current({ type: "technical_error", outcome: "request_failed" });
      const fallback = !response.ok ? "unavailable" : next.fallback ? "unsupported" : undefined;
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

  function reportMissingTopic() {
    if (current.current !== view) return;
    setSuggestionDraft("");
    suggestionAttempt.current = null;
    changeView({ id: "topicMissing", node: neutralNode(suggestionPrompt), parent: view, categoryId: view.categoryId });
  }

  async function sendSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace.current.open || current.current !== view || view.id !== "topicMissing" || pending.current) return;
    const description = suggestionDraft.trim();
    if (!description || description.length > READY_SUGGESTION_MAX_LENGTH) return;
    const attempt = suggestionAttempt.current?.description === description
      ? suggestionAttempt.current
      : { submissionId: crypto.randomUUID(), description };
    suggestionAttempt.current = attempt;

    const controller = new AbortController();
    pending.current = controller;
    setSavingSuggestion(true);
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    const showFailure = (message: string) => begin({ ...view, node: neutralNode(message) });
    try {
      const response = await fetch("/api/ready/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...attempt, categoryId: view.categoryId }),
        signal: controller.signal,
      });
      const result: { saved?: boolean } | null = await response.json();
      if (pending.current !== controller) return;
      if (response.status === 429) {
        showFailure("I can’t accept another suggestion right now, Commander. Your draft is still here. Try again later.");
        return;
      }
      if (response.status === 409) suggestionAttempt.current = null;
      if (!response.ok || result?.saved !== true) throw new Error("Suggestion save not confirmed");
      suggestionAttempt.current = null;
      setSuggestionDraft("");
      changeView({
        id: "suggestionSaved",
        node: neutralNode("Suggestion received, Commander. The IronClad team can now review it and improve my menu."),
      });
    } catch {
      if (pending.current === controller) {
        showFailure("I couldn’t confirm that your suggestion was saved, Commander. Your draft is still here. Try sending it again.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setSavingSuggestion(false);
      }
    }
  }

  function contactAdmin() {
    const support = readyCategories.find((item) => item.id === "support");
    if (support) openCategory(support);
  }

  function actionPicked(actionId?: ReadyActionId) {
    cancelFollowup();
    if (actionId) usage.track({ type: "action_click", actionId, categoryId: view.categoryId, questionId: view.questionId });
  }

  async function copyReference(value: string) {
    let message: string;
    try {
      await navigator.clipboard.writeText(value);
      message = "Match reference copied.";
    } catch {
      message = `I couldn’t copy the match reference, Commander. Here it is: ${value}`;
    }
    if (current.current === view && workspace.current.open) changeView({ ...view, id: "copyStatus", node: neutralNode(message) });
  }

  function vote(helpful: boolean) {
    const { answerInstanceId, questionId } = view;
    if (current.current !== view || !answerInstanceId || !questionId || voteRef.current.has(answerInstanceId)) return;
    voteRef.current.set(answerInstanceId, helpful);
    setVotes(new Map(voteRef.current));
    usage.track({ type: "helpfulness", questionId, answerInstanceId, helpful });
    changeView({
      ...view,
      id: "feedback",
      node: neutralNode(helpful ? "Glad that helped, Commander." : "Try another topic or contact an admin, Commander."),
    });
  }

  const displayRevealing = cloudExit?.revealing ?? revealing;
  const cloudExiting = !open ? "true" : undefined;
  const voted = view.answerInstanceId ? votes.get(view.answerInstanceId) : undefined;
  const related = voted === false ? readyCategories.find((item) => item.id === (view.parent?.categoryId ?? view.categoryId)) : undefined;

  return (
    <div className={styles.brand}>
      <TouchButton aria-controls={open ? "ironclad-assistant" : undefined} aria-expanded={open} aria-label="Open Ready, the IronClad assistant"
        className={styles.dock} data-ready-dock="" data-ready-status={status} onActivate={openAssistant}
        ref={dock} tabIndex={open ? -1 : 0} title="Open Ready" type="button">
        {!open && status !== "ready" && <ReadyPoster />}
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
              <ReadyPoster floating />
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
                <TouchButton className={styles.answer} onActivate={() => { dismissMenu(true); changeView(dialogueView("welcomeReturning")); }}
                  type="button">
                  <ThoughtCloudShape variant="answer" />
                  <span>Welcome</span>
                </TouchButton>
                <TouchButton className={styles.answer} onActivate={() => {
                  usage.track({ type: "engage" });
                  dismissMenu(true);
                  changeView(mainMenu);
                }}
                  type="button">
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
                {hasSuggestionForm && <form className={styles.suggestionForm} onSubmit={sendSuggestion} ref={suggestionForm}>
                  <p className={styles.suggestionHint} id={`${suggestionId}-notice`}>
                    Your suggestion will be saved for the IronClad team to review and improve Ready’s menu and answers.
                    {" "}This is not a live support request, and a reply is not guaranteed. Please don’t include personal or sensitive information.
                  </p>
                  <label htmlFor={suggestionId}>Which topic or question is missing?</label>
                  <textarea aria-describedby={`${suggestionId}-notice ${suggestionId}-counter`} autoComplete="off"
                    id={suggestionId} maxLength={READY_SUGGESTION_MAX_LENGTH} onChange={(event) => setSuggestionDraft(event.currentTarget.value)}
                    readOnly={savingSuggestion} required rows={3} value={suggestionDraft} />
                  <span className={styles.suggestionCounter} id={`${suggestionId}-counter`}>
                    {suggestionDraft.length} / {READY_SUGGESTION_MAX_LENGTH} characters
                  </span>
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
                      else {
                        actionPicked(action.actionId);
                        void copyReference(action.copyText);
                      }
                    }} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{action.label}</span>
                    </TouchButton>;
                  })}
                  {hasSuggestionForm && <>
                    <TouchButton className={styles.answer} data-answer-cloud=""
                      disabled={savingSuggestion || !suggestionDraft.trim()}
                      onActivate={() => suggestionForm.current?.requestSubmit()} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>{savingSuggestion ? "Saving suggestion…" : "Send suggestion"}</span>
                    </TouchButton>
                    <TouchButton className={styles.answer} data-answer-cloud="" onActivate={() => changeView(view.parent ?? mainMenu)} type="button">
                      <ThoughtCloudShape variant="answer" />
                      <span>Cancel</span>
                    </TouchButton>
                  </>}
                  {(hasSuggestionForm || nodeId === "suggestionSaved") && <TouchButton className={styles.answer} data-answer-cloud=""
                    onActivate={contactAdmin} type="button">
                    <ThoughtCloudShape variant="answer" />
                    <span>Contact an admin</span>
                  </TouchButton>}
                  {nodeId === "suggestionSaved" && <TouchButton className={styles.answer} data-answer-cloud=""
                    onActivate={() => changeView(mainMenu)} type="button">
                    <ThoughtCloudShape variant="answer" />
                    <span>Main menu</span>
                  </TouchButton>}
                </div>
                {displayRevealing && <div className={styles.revealAction}>
                  <TouchButton className={styles.textAction} onActivate={skipReply} type="button">Show full message</TouchButton>
                </div>}
              </div>
              {!displayRevealing && view.questionId && view.answerInstanceId && voted !== true && <div className={styles.feedback} aria-label="Answer feedback" role="group">
                {voted === undefined ? <>
                  <span>Was this helpful?</span>
                  <TouchButton className={styles.textAction} onActivate={() => vote(true)} type="button">Helpful</TouchButton>
                  <TouchButton className={styles.textAction} onActivate={() => vote(false)} type="button">Still need help</TouchButton>
                </> : null}
                {voted === false && <div className={styles.readyFooter}>
                  {related && <TouchButton className={styles.textAction} onActivate={() => openCategory(related)} type="button">
                    More about {related.label.toLowerCase()}
                  </TouchButton>}
                  <TouchButton className={styles.textAction} onActivate={contactAdmin} type="button">Contact an admin</TouchButton>
                </div>}
              </div>}
              {nodeId === "main" && <div className={styles.readyFooter} inert={displayRevealing}>
                <TouchButton className={styles.textAction} onActivate={reportMissingTopic} type="button">Topic missing</TouchButton>
                {usage.loaded && <details className={styles.analyticsChoice}>
                  <summary>Ready analytics</summary>
                  <div className={styles.analyticsNotice}>
                    <p>Optional for Staging reviewers. Ready usage analytics counts selected topics and link clicks and includes answer feedback. It excludes morale choices and private match details. Written topic suggestions are saved separately when you select Send suggestion. Ready works the same with analytics off.</p>
                    <label><input checked={usage.enabled} disabled={usage.saving || usage.withdrawalPending} onChange={(event) => {
                      void usage.setEnabled(event.currentTarget.checked);
                    }} type="checkbox" /> Allow Ready usage analytics</label>
                    {usage.withdrawalPending && <TouchButton className={styles.textAction} disabled={usage.saving}
                      onActivate={() => { void usage.setEnabled(false); }} type="button">Turn off</TouchButton>}
                    {usage.error && <p role="status">{usage.error}</p>}
                  </div>
                </details>}
              </div>}
              {view.parent && !hasSuggestionForm && <div className={styles.readyFooter} aria-label="Ready menu navigation" role="group">
                <TouchButton className={styles.textAction} onActivate={() => {
                  if (view.parent) changeView(view.parent);
                }} type="button">Back</TouchButton>
                <TouchButton className={styles.textAction} onActivate={() => changeView(mainMenu)} type="button">Main menu</TouchButton>
                {nodeId === "submenu" && <TouchButton className={styles.textAction} onActivate={reportMissingTopic} type="button">Topic missing</TouchButton>}
              </div>}
              {hasSuggestionForm && <div className={styles.readyFooter} aria-label="Ready menu navigation" role="group">
                <TouchButton className={styles.textAction} onActivate={() => changeView(mainMenu)} type="button">Main menu</TouchButton>
              </div>}
            </div>
          </section>

        </>}
      </>, document.body)}
    </div>
  );
}
