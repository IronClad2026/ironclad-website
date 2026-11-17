// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReadyAssistant from "@/components/ready/ReadyAssistant";
import { placeCloud, placeCompactCloud, placeSkull } from "@/components/ready/floating-layout";

const { mock, track } = vi.hoisted(() => ({
  mock: { path: "/", query: "", reduced: false },
  track: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mock.path,
  useSearchParams: () => new URLSearchParams(mock.query),
}));
vi.mock("@/components/ready/renderer", () => ({ loadMascotRenderer: () => new Promise(() => undefined) }));
vi.mock("@/lib/ready/use-ready-usage", () => ({
  useReadyUsage: () => ({ enabled: false, loaded: true, saving: false, error: null, setEnabled: vi.fn(), track }),
}));

const getButton = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(getButton(name));
const say = () => document.querySelector("[data-mascot-message]")?.textContent;
const moveTime = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const currentView = () => document.querySelector("[data-ready-view]")?.getAttribute("data-ready-view");
const dock = () => click("Open Ready, the IronClad assistant");
const full = () => click("Show full message");
const help = () => {
  const handle = getButton("Move assistant with drag or arrow keys");
  fireEvent.click(handle, { detail: 0 });
  click("Help");
};

describe("Ready player menu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion") && mock.reduced,
      addEventListener() {}, removeEventListener() {},
    }));
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
    mock.path = "/";
    mock.query = "";
    mock.reduced = false;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds the Sad line before the Neutral line and hands off to the six choices", () => {
    render(<ReadyAssistant />);
    moveTime(32);
    dock();
    full();
    click("I’m never winning this… white flag’s up!");
    full();
    expect(say()).toBe("Oh, poor you, Commander… let me shed a tactical tear.");
    moveTime(1800);
    expect(currentView()).toBe("welcomeRough");
    moveTime(600);
    expect(currentView()).toBe("welcomeResolve");
    full();
    expect(say()).toBe("Permission to surrender? Denied. One match at a time, Commander.");
    moveTime(2500);
    expect(currentView()).toBe("main");
    moveTime(8000);
    expect(say()).toBe("What can I help you with today, Commander?");
    expect(document.querySelectorAll("[data-ready-category]")).toHaveLength(6);
    expect(track.mock.calls).toEqual([[{ type: "manual_open" }], [{ type: "engage" }]]);
  });

  it("cancels an obsolete morale timer when Help opens and does not redock or restart it", () => {
    render(<ReadyAssistant />);
    moveTime(32);
    dock();
    full();
    click("Time to kick some ass!");
    full();
    help();
    click("My match");
    moveTime(10000);
    expect(currentView()).toBe("submenu");
    expect(getButton("My opponent")).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith({ type: "category_select", categoryId: "match" });
    click("Dock assistant");
    moveTime(200);
    expect(currentView()).toBeUndefined();
    dock();
    expect(currentView()).toBe("submenu");
  });

  it("dispatches the selected question ID, emits a single display and vote, and keeps navigation safe", async () => {
    mock.path = "/tournaments";
    mock.query = "tournament=review-tournament";
    mock.reduced = true;
    vi.mocked(fetch).mockResolvedValue(Response.json({
      text: "Use the published rule.",
      intent: { kind: "question", id: "disconnects" },
      sources: [{ title: "Applicable edition", url: "/rules", section: "10.1" }],
    }));
    render(<ReadyAssistant />);
    moveTime(32);
    dock();
    help();
    click("Rules & match help");
    await act(async () => click("Disconnects & lag"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe("/api/ready");
    expect(JSON.parse(request[1]?.body as string)).toEqual({
      kind: "question", id: "disconnects", context: { eventSlug: "review-tournament" },
    });
    expect(say()).toBe("Use the published rule.");
    const display = track.mock.calls.filter(([event]) => event.type === "answer_display");
    expect(display).toHaveLength(1);
    expect(display[0][0]).toMatchObject({ questionId: "disconnects", categoryId: "rules" });
    const previousButton = getButton("Still need help");
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);
    expect(track.mock.calls.filter(([event]) => event.type === "helpfulness")).toEqual([[
      { type: "helpfulness", questionId: "disconnects", answerInstanceId: display[0][0].answerInstanceId, helpful: false },
    ]]);
    expect(getButton("Contact an admin")).toBeInTheDocument();
    click("Back");
    expect(getButton("Disconnects & lag")).toBeInTheDocument();
  });

  it("discards a delayed reply after navigating to another event", async () => {
    mock.path = "/tournaments";
    mock.query = "tournament=event-one";
    mock.reduced = true;
    let deliver!: (reply: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { deliver = resolve; }));
    const rendered = render(<ReadyAssistant />);
    moveTime(32);
    dock();
    help();
    click("My match");
    click("My opponent");
    expect(currentView()).toBe("thinking");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    mock.query = "tournament=event-two";
    rendered.rerender(<ReadyAssistant />);
    moveTime(32);
    expect(signal?.aborted).toBe(true);
    await act(async () => { deliver(Response.json({ text: "The stale private reply." })); });
    expect(say()).toBe("What can I help you with today, Commander?");
    expect(track.mock.calls.some(([event]) => event.type === "answer_display" || event.type === "technical_error")).toBe(false);
  });

  it("counts an interrupted answer only when it becomes fully visible after reopening", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      text: "Use the published rule.",
      intent: { kind: "question", id: "disconnects" },
      sources: [{ title: "Rulebook", url: "/rules", section: "10.1" }],
    }));
    render(<ReadyAssistant />);
    moveTime(32);
    dock();
    help();
    click("Rules & match help");
    await act(async () => click("Disconnects & lag"));
    const count = () => track.mock.calls.filter(([event]) => event.type === "answer_display").length;
    expect(count()).toBe(0);
    click("Dock assistant");
    moveTime(220);
    expect(count()).toBe(0);
    dock();
    moveTime(32);
    expect(count()).toBe(1);
    click("Dock assistant");
    moveTime(220);
    dock();
    moveTime(32);
    expect(count()).toBe(1);
  });
});

it("reserves enough vertical room for the default phone menu and a clear desktop oval", () => {
  const narrow = { left: 10, right: 380, top: 72, bottom: 770 };
  expect(placeCloud(narrow, placeSkull(narrow, null), 290).maxHeight).toBeGreaterThanOrEqual(290);
  const desktop = { left: 10, right: 1270, top: 88, bottom: 790 };
  const oval = placeCloud(desktop, placeSkull(desktop, null), 254, [], { width: 602, minWidth: 516, minHeight: 254 });
  expect(oval.side).toBe("left");
  expect(oval.width).toBe(602);
});

it("uses the clear band below both full-width portrait hero actions", () => {
  const area = { left: 10, top: 101, right: 380, bottom: 770 };
  const controls = [
    { x: 20, y: 440, width: 350, height: 48 },
    { x: 20, y: 500, width: 350, height: 48 },
  ];
  expect(placeCompactCloud(area, placeSkull(area, null), 290, controls)).toEqual({
    side: "below", width: 370, x: 10, top: 556, bottom: 770,
  });
});

it("keeps the landscape dialogue beside the mascot and beside or beyond a page control", () => {
  const area = { left: 10, top: 92, right: 770, bottom: 380 };
  const skull = { x: 520, y: 152, width: 180, height: 169 };
  const control = { x: 20, y: 198, width: 234, height: 48 };
  const slot = placeCompactCloud(area, skull, 270, [control]);
  expect(slot?.side).toBe("left");
  expect(slot?.x).toBeGreaterThanOrEqual(control.x + control.width + 8);
  expect(slot?.bottom).toBe(area.bottom);
});
