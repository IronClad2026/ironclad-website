// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LenisOptions = NonNullable<
  ConstructorParameters<typeof import("lenis").default>[0]
>;

const desktopQuery = "(min-width: 1024px)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const coarsePointerQuery = "(pointer: coarse)";
const hoverNoneQuery = "(hover: none)";

class MediaQuery extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  change(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

let media: Map<string, MediaQuery>;
let instances: MockLenis[];
let moduleLoads: number;
let resolveModule: (module: { default: typeof MockLenis }) => void;
let rejectModule: (error: Error) => void;
let SmoothScrollProvider: typeof import("@/components/SmoothScrollProvider").default;

class MockLenis {
  start = vi.fn();
  stop = vi.fn();
  destroy = vi.fn();

  constructor(public options: LenisOptions) {
    instances.push(this);
  }
}

async function finishLoading() {
  await act(async () => {
    resolveModule({ default: MockLenis });
    await vi.dynamicImportSettled();
  });
}

describe("conditional smooth scrolling", () => {
  beforeEach(async () => {
    vi.resetModules();
    instances = [];
    moduleLoads = 0;
    media = new Map([
      [desktopQuery, new MediaQuery(true)],
      [reducedMotionQuery, new MediaQuery(false)],
      [coarsePointerQuery, new MediaQuery(false)],
      [hoverNoneQuery, new MediaQuery(false)],
    ]);
    vi.stubGlobal("matchMedia", (query: string) => media.get(query));
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 0,
    });

    const modulePromise = new Promise<{ default: typeof MockLenis }>((resolve, reject) => {
      resolveModule = resolve;
      rejectModule = reject;
    });
    vi.doMock("lenis", () => {
      moduleLoads += 1;
      return modulePromise;
    });
    SmoothScrollProvider = (await import("@/components/SmoothScrollProvider")).default;
  });

  afterEach(async () => {
    cleanup();
    await finishLoading();
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    Reflect.deleteProperty(navigator, "maxTouchPoints");
    vi.unstubAllGlobals();
    vi.doUnmock("lenis");
  });

  it.each([
    ["a narrow viewport", desktopQuery, false],
    ["reduced motion", reducedMotionQuery, true],
    ["a coarse pointer", coarsePointerQuery, true],
    ["no hover", hoverNoneQuery, true],
  ] as const)("does not load Lenis with %s", async (_label, query, matches) => {
    media.get(query)!.matches = matches;
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);

    await vi.dynamicImportSettled();

    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(moduleLoads).toBe(0);
    expect(instances).toHaveLength(0);
  });

  it("does not load Lenis on a touch-capable desktop", async () => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 1,
    });
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);

    await vi.dynamicImportSettled();

    expect(moduleLoads).toBe(0);
    expect(instances).toHaveLength(0);
  });

  it("keeps content available while loading and preserves desktop options", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(instances).toHaveLength(0);

    await finishLoading();

    expect(instances).toHaveLength(1);
    expect(instances[0].options).toEqual({
      anchors: true,
      autoRaf: true,
      autoResize: true,
      lerp: 0.08,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.85,
      prevent: expect.any(Function),
    });
    expect(instances[0].start).toHaveBeenCalledOnce();
  });

  it("starts when a previously excluded viewport becomes eligible", async () => {
    media.get(desktopQuery)!.matches = false;
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await vi.dynamicImportSettled();
    expect(moduleLoads).toBe(0);

    act(() => media.get(desktopQuery)!.change(true));
    await waitFor(() => expect(moduleLoads).toBe(1));
    await finishLoading();

    expect(instances).toHaveLength(1);
  });

  it("uses the latest capabilities when an import resolves", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));
    act(() => media.get(reducedMotionQuery)!.change(true));

    await finishLoading();
    expect(instances).toHaveLength(0);

    act(() => media.get(reducedMotionQuery)!.change(false));
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(moduleLoads).toBe(1);
  });

  it("coalesces overlapping refreshes and capability changes during loading", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));
    act(() => {
      window.dispatchEvent(new Event("resize"));
      media.get(desktopQuery)!.change(false);
      media.get(desktopQuery)!.change(true);
      window.dispatchEvent(new Event("resize"));
    });

    await finishLoading();

    expect(moduleLoads).toBe(1);
    expect(instances).toHaveLength(1);
  });

  it("does not start an instance after unmount during loading", async () => {
    const view = render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));

    view.unmount();
    await finishLoading();
    window.dispatchEvent(new Event("resize"));

    expect(instances).toHaveLength(0);
  });

  it("starts only the current effect in StrictMode and cleans it up", async () => {
    const view = render(
      <StrictMode>
        <SmoothScrollProvider>Content</SmoothScrollProvider>
      </StrictMode>
    );
    await waitFor(() => expect(moduleLoads).toBe(1));
    await finishLoading();

    expect(instances).toHaveLength(1);
    view.unmount();
    expect(instances[0].destroy).toHaveBeenCalledOnce();
  });

  it("destroys scrolling when capabilities change and can start again", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await finishLoading();

    act(() => media.get(coarsePointerQuery)!.change(true));
    expect(instances[0].destroy).toHaveBeenCalledOnce();

    act(() => media.get(coarsePointerQuery)!.change(false));
    await waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[1].start).toHaveBeenCalledOnce();
  });

  it("honors locks set while loading and observes both body and html locks", async () => {
    const view = render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));
    document.body.style.overflow = "hidden";
    await finishLoading();

    const instance = instances[0];
    expect(instance.stop).toHaveBeenCalledOnce();
    expect(instance.start).not.toHaveBeenCalled();

    document.body.style.overflow = "";
    await waitFor(() => expect(instance.start).toHaveBeenCalledOnce());
    document.documentElement.style.overflow = "hidden";
    await waitFor(() => expect(instance.stop).toHaveBeenCalledTimes(2));

    view.unmount();
    document.documentElement.style.overflow = "";
    await act(async () => Promise.resolve());
    expect(instance.start).toHaveBeenCalledOnce();
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it("continues to exclude modal and native-scrollable ancestors", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await finishLoading();
    const prevent = instances[0].options.prevent!;

    for (const attribute of ["data-lenis-prevent", "data-lenis-prevent-wheel"]) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute(attribute, "");
      const child = wrapper.appendChild(document.createElement("button"));
      expect(prevent(child)).toBe(true);
    }
    for (const [attribute, value] of [
      ["role", "dialog"],
      ["aria-modal", "true"],
      ["class", "cl-modalBackdrop"],
      ["class", "cl-modalContent"],
      ["class", "cl-rootBox"],
    ]) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute(attribute, value);
      const child = wrapper.appendChild(document.createElement("button"));
      expect(prevent(child)).toBe(true);
    }

    const scrollable = document.createElement("div");
    scrollable.style.overflowY = "auto";
    Object.defineProperty(scrollable, "scrollHeight", { value: 300 });
    Object.defineProperty(scrollable, "clientHeight", { value: 100 });
    const child = scrollable.appendChild(document.createElement("button"));
    document.body.appendChild(scrollable);
    expect(prevent(child)).toBe(true);
    scrollable.remove();
    expect(prevent(document.createElement("button"))).toBe(false);
  });

  it("leaves content and native scrolling available when the chunk fails", async () => {
    render(<SmoothScrollProvider>Content</SmoothScrollProvider>);
    await waitFor(() => expect(moduleLoads).toBe(1));

    await act(async () => {
      rejectModule(new Error("Chunk unavailable"));
      await vi.dynamicImportSettled();
    });

    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(instances).toHaveLength(0);
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });
});
