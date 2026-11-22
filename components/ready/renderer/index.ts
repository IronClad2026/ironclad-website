import type { WardrobeItemId } from "@/lib/wardrobe/catalogue";

export type MascotMode = "dock" | "floating";
export type MascotView = "front" | "three-quarter";
export type TalkStyle = "Talk_Normal" | "Talk_Enthusiastic" | "Talk_Gentle";
export type MascotReaction = "Reaction_Nod" | "Reaction_Shake" | "Reaction_Surprise";
export type MascotStatus = "loading" | "ready" | "error";
export type Anchor = { x: number; y: number };

export type MascotSnapshot = {
  clips: string[];
  expression: string;
  expressionPhase: "idle" | "entering" | "holding" | "returning";
  expressionWeight: number;
  expressionWeights: Record<string, number>;
  style: TalkStyle | null;
  talkWeight: number;
  talkGain: number;
  jaw: number;
  restingJaw: number;
  poseTime: number;
  idleGlance: {
    direction: "up" | "down" | "left" | "right" | null;
    target: { id: string; label?: string; screenPoint?: Anchor } | null;
    phase: "waiting" | "entering" | "holding" | "returning" | "interrupting";
    sequence: number;
    pitch: number;
    yaw: number;
    roll: number;
  };
  headPose: { pitch: number; yaw: number; roll: number; x: number; y: number; z: number };
  headForward: [number, number, number];
  leftBlink: number;
  rightBlink: number;
  tearOpacity: number;
  tearDrops: number;
  tearEmission: number;
  smokeParticles: number;
  cigar: Anchor;
  smokeOrigin: Anchor | null;
  mouth: Anchor | null;
  totalDraws: number;
};

export type MascotFrameReport = {
  graphics: { vendor: string; renderer: string; version: string; antialias: boolean };
  userAgent: string;
  visibility: DocumentVisibilityState;
  mode: MascotMode[];
  window: [number, number];
  canvasCSS: [number, number];
  drawingBuffer: [number, number];
  devicePixelRatio: number;
  elapsedMs: number;
  drawnFrames: number;
  drawnFPS: number;
  p50FrameMs: number;
  p95FrameMs: number;
  slowOver33ms: number;
  p95RenderSubmitMs: number;
  drawCalls: { min: number; max: number; median: number };
  triangles: { min: number; max: number };
};

export type MascotRenderer = {
  /** Resolves after the first visible model frame is drawn. */
  ready: Promise<void>;
  setMode(mode: MascotMode): void;
  setView(view: MascotView): void;
  setDragging(dragging: boolean): void;
  setExpression(name: string, intensity?: number): void;
  startTalk(style: TalkStyle, initialGain?: number): void;
  setTalkGain(gain: number): void;
  stopTalk(): void;
  react(name: MascotReaction): void;
  blink(side?: "both" | "left" | "right"): void;
  setSmoke(enabled: boolean): void;
  setTears(value: "auto" | "on" | "off"): void;
  setReducedMotion(enabled: boolean): void;
  setVisible(enabled: boolean): void;
  prepareWardrobe(items: WardrobeItemId[], signal: AbortSignal): Promise<{
    commit(): void;
    discard(): void;
  }>;
  clearWardrobe(): void;
  snapshot(): MascotSnapshot | null;
  measure(durationMs?: number): Promise<MascotFrameReport>;
  dispose(): void;
};

type Factory = (options: {
  canvas: HTMLCanvasElement;
  onStatus?: (status: MascotStatus, error?: Error) => void;
  onAnchor?: (anchor: Anchor) => void;
  wardrobe?: boolean;
}) => MascotRenderer;

type Module = { createMascotRenderer: Factory };

declare global {
  interface Window {
    IronCladMascotV6?: Module;
  }
}

let loading: Promise<Factory> | undefined;

/** Deliver the V6 runtime after the page has loaded, with no scene work during Next rendering. */
export function loadMascotRenderer(): Promise<Factory> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The mascot renderer requires a browser."));
  }
  if (window.IronCladMascotV6) return Promise.resolve(window.IronCladMascotV6.createMascotRenderer);
  loading ??= new Promise<Factory>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/mascot-v6/renderer.js";
    const fail = (reason: string) => {
      loading = undefined;
      script.remove();
      reject(new Error(reason));
    };
    script.addEventListener("load", () => {
      const factory = window.IronCladMascotV6?.createMascotRenderer;
      if (factory) resolve(factory);
      else fail("The IronClad model runtime did not register.");
    }, { once: true });
    script.addEventListener("error", () => fail("The IronClad model runtime could not be loaded."), { once: true });
    document.head.append(script);
  });
  return loading;
}
