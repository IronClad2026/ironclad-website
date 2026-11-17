// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReadyAssistant from "@/components/ready/ReadyAssistant";
import ReadyHeader from "@/components/ready/ReadyHeader";

const { mock, track, clerk, renderer } = vi.hoisted(() => ({
  mock: { path: "/", query: "", reduced: false, webgl: false },
  track: vi.fn(),
  clerk: { isLoaded: true, isSignedIn: true, sessionId: "first-session" as string | null },
  renderer: {
    ready: Promise.resolve(),
    setMode: vi.fn(), setDragging: vi.fn(), setExpression: vi.fn(), setReducedMotion: vi.fn(),
    react: vi.fn(), snapshot: vi.fn(), dispose: vi.fn(),
    startTalk: vi.fn(), setTalkGain: vi.fn(), stopTalk: vi.fn(),
  },
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => clerk }));
vi.mock("next/navigation", () => ({
  usePathname: () => mock.path,
  useSearchParams: () => new URLSearchParams(mock.query),
}));
vi.mock("@/components/ready/renderer", () => ({
  loadMascotRenderer: () => mock.webgl ? Promise.resolve(() => renderer) : new Promise(() => undefined),
}));
vi.mock("@/lib/ready/use-ready-usage", () => ({
  useReadyUsage: () => ({ enabled: false, loaded: true, saving: false, error: null, setEnabled: vi.fn(), track }),
}));

const getButton = (name: string) => screen.getByRole("button", { name });
const assistant = <ReadyAssistant workspaceScope="test-session" signedIn />;
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
    mock.webgl = false;
    clerk.isLoaded = true;
    clerk.isSignedIn = true;
    clerk.sessionId = "first-session";
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds the Sad line before the Neutral line and hands off to the six choices", () => {
    render(assistant);
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
    render(assistant);
    moveTime(32);
    dock();
    full();
    click("Time to kick some ass!");
    full();
    help();
    full();
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

  it("keeps typing and cancelling a suggestion separate from prepared answers and site analytics", () => {
    mock.reduced = true;
    render(assistant);
    moveTime(32);
    dock();
    help();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /search prepared answers/i })).toBeNull();
    click("Topic missing");
    expect(currentView()).toBe("topicMissing");
    expect(say()).toContain("Something missing, Commander?");
    const topic = screen.getByRole("textbox", { name: "Which topic or question is missing?" });
    expect(topic).toHaveAttribute("maxlength", "500");
    expect(getButton("Send suggestion")).toBeDisabled();
    fireEvent.change(topic, { target: { value: "Fixture" } });
    expect(screen.getByText("7 / 500 characters")).toBeInTheDocument();
    click("Cancel");
    expect(screen.queryByRole("textbox")).toBeNull();
    click("Rules & match help");
    click("Topic missing");
    click("Contact an admin");
    expect(getButton("In-site Admin Assistance")).toBeInTheDocument();
    expect(track.mock.calls.some(([event]) => event.type === "topic_missing")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves a visitor’s draft, retries with the same ID, and confirms only a successful save", async () => {
    mock.reduced = true;
    let respond!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }))
      .mockResolvedValue(Response.json({ saved: true }));
    render(<ReadyAssistant workspaceScope="visitor" signedIn={false} />);
    moveTime(32);
    dock();
    help();
    click("Rules & match help");
    click("Topic missing");
    const topic = screen.getByRole("textbox", { name: "Which topic or question is missing?" });
    fireEvent.change(topic, { target: { value: "  A training fixture  " } });
    const submit = getButton("Send suggestion");
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(say()).not.toContain("Suggestion received");
    const [endpoint, first] = vi.mocked(fetch).mock.calls[0];
    expect(endpoint).toBe("/api/ready/suggestions");
    const body = JSON.parse(first?.body as string);
    expect(body).toEqual({ description: "A training fixture", categoryId: "rules", submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await act(async () => respond(Response.json({ error: "unavailable" }, { status: 503 })));
    expect(say()).toContain("Your draft is still here");
    expect(topic).toHaveValue("  A training fixture  ");
    await act(async () => click("Send suggestion"));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual(body);
    expect(say()).toContain("Suggestion received, Commander.");
    expect(screen.queryByRole("textbox")).toBeNull();
    click("Main menu");
    click("Topic missing");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: body.description } });
    await act(async () => click("Send suggestion"));
    const newBody = JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string);
    expect(newBody).toEqual({ description: body.description, submissionId: expect.any(String) });
    expect(newBody.submissionId).not.toBe(body.submissionId);
    expect(JSON.stringify(track.mock.calls)).not.toContain(body.description);
  });

  it("dispatches the selected question ID, emits a single display and vote, and keeps navigation safe", async () => {
    mock.path = "/tournaments";
    mock.query = "tournament=review-tournament";
    mock.reduced = true;
    vi.mocked(fetch).mockResolvedValue(Response.json({
      text: "Use the published rule.",
      details: "The complete rule applies to the tournament edition linked below.",
      intent: { kind: "question", id: "disconnects" },
      sources: [{ title: "Applicable edition", url: "/rules", section: "10.1" }],
    }));
    render(assistant);
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
    expect(screen.getByText("More detail").closest("details")).not.toHaveAttribute("open");
    const source = screen.getByRole("link", { name: "Applicable edition · 10.1 (opens in a new tab)" });
    expect(source).toHaveAttribute("href", "/rules");
    expect(source).toHaveAttribute("target", "_blank");
    const display = track.mock.calls.filter(([event]) => event.type === "answer_display");
    expect(display).toHaveLength(1);
    expect(display[0][0]).toMatchObject({ questionId: "disconnects", categoryId: "rules" });
    const previousButton = getButton("Still need help");
    fireEvent.click(previousButton);
    fireEvent.click(previousButton);
    expect(say()).toBe("Try another topic or contact an admin, Commander.");
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
    const rendered = render(assistant);
    moveTime(32);
    dock();
    help();
    click("My match");
    click("My opponent");
    expect(currentView()).toBe("thinking");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    mock.query = "tournament=event-two";
    rendered.rerender(<ReadyAssistant workspaceScope="test-session" signedIn />);
    moveTime(32);
    expect(signal?.aborted).toBe(true);
    await act(async () => { deliver(Response.json({ text: "The stale private reply." })); });
    expect(say()).toBe("What can I help you with today, Commander?");
    expect(track.mock.calls.some(([event]) => event.type === "answer_display" || event.type === "technical_error")).toBe(false);
  });

  it("starts a past-match lookup from the menu without carrying over an active match", async () => {
    mock.reduced = true;
    const currentMatch = "1499cb0a-3786-401a-8de2-6c181fc7e4dd";
    const pastMatch = "9999cb0a-3786-401a-8de2-6c181fc7e4dd";
    const selection = { eventSlug: "old-event", matchId: pastMatch };
    const intent = { kind: "action", id: "past-match" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ text: "Active match found.", context: { eventSlug: "current-event", matchId: currentMatch } }))
      .mockResolvedValueOnce(Response.json({
        text: "Choose a past match.", actions: [{ label: "An earlier match", intent, context: selection }],
      }))
      .mockResolvedValueOnce(Response.json({ text: "Past match found." }));
    render(assistant);
    moveTime(32);
    dock();
    help();
    click("My match");
    await act(async () => click("My opponent"));
    click("Back");
    await act(async () => click("Find a past match"));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({ ...intent, context: {} });
    await act(async () => click("An earlier match"));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toEqual({ ...intent, context: selection });
  });

  it("counts an interrupted answer only when it becomes fully visible after reopening", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      text: "Use the published rule.",
      intent: { kind: "question", id: "disconnects" },
      sources: [{ title: "Rulebook", url: "/rules", section: "10.1" }],
    }));
    render(assistant);
    moveTime(32);
    dock();
    help();
    full();
    click("Rules & match help");
    full();
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

  it("drives the jaw from the shared reveal for menus, answers, acknowledgements and suggestion outcomes", async () => {
    mock.webgl = true;
    const starts = () => renderer.startTalk.mock.calls.length;
    const expectSpeaking = (previousStarts: number) => {
      expect(starts()).toBe(previousStarts + 1);
      expect(say()).toBe("");
      moveTime(128);
      expect(say()?.length).toBeGreaterThan(0);
      expect(renderer.setTalkGain).toHaveBeenLastCalledWith(expect.any(Number));
      expect(renderer.setTalkGain.mock.lastCall?.[0]).toBeGreaterThan(0);
    };
    const rendered = render(assistant);
    await act(async () => { vi.advanceTimersByTime(32); });
    let previousStarts = starts();
    dock();
    expectSpeaking(previousStarts);
    let previousStops = renderer.stopTalk.mock.calls.length;
    full();
    expect(renderer.stopTalk).toHaveBeenCalledTimes(previousStops + 1);
    previousStarts = starts();
    help();
    expectSpeaking(previousStarts);
    full();
    previousStarts = starts();
    click("Rules & match help");
    expectSpeaking(previousStarts);
    full();

    let finishLookup!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { finishLookup = resolve; }));
    previousStarts = starts();
    click("Disconnects & lag");
    expect(starts()).toBe(previousStarts);
    await act(async () => finishLookup(Response.json({
      text: "Use the published rule.",
      intent: { kind: "question", id: "disconnects" },
      sources: [{ title: "Rulebook", url: "/rules" }],
    })));
    expectSpeaking(previousStarts);
    full();
    previousStarts = starts();
    click("Helpful");
    expectSpeaking(previousStarts);
    full();
    expect(say()).toBe("Glad that helped, Commander.");
    expect(track.mock.calls.filter(([event]) => event.type === "answer_display")).toHaveLength(1);

    click("Back");
    full();
    previousStarts = starts();
    click("Topic missing");
    expectSpeaking(previousStarts);
    full();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A synthetic topic" } });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    previousStarts = starts();
    await act(async () => click("Send suggestion"));
    expectSpeaking(previousStarts);
    full();
    expect(say()).toContain("I couldn’t confirm");
    previousStarts = starts();
    await act(async () => click("Send suggestion"));
    expectSpeaking(previousStarts);
    expect(renderer.setExpression).toHaveBeenLastCalledWith("Neutral", 1);

    previousStarts = starts();
    rendered.rerender(<ReadyAssistant workspaceScope="test-session" signedIn />);
    expect(starts()).toBe(previousStarts);
    previousStops = renderer.stopTalk.mock.calls.length;
    click("Dock assistant");
    expect(renderer.stopTalk).toHaveBeenCalledTimes(previousStops + 1);
    moveTime(220);
    dock();
    moveTime(100);
    expect(starts()).toBe(previousStarts);
    expect(say()).toContain("Suggestion received, Commander.");
  });

  it("clears the open workspace and cancels a private reply when Clerk changes accounts", async () => {
    mock.reduced = true;
    let deliver!: (reply: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    const rendered = render(<ReadyHeader />);
    moveTime(32);
    dock();
    help();
    click("My match");
    click("My opponent");
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(currentView()).toBe("thinking");

    clerk.sessionId = "second-session";
    rendered.rerender(<ReadyHeader />);
    moveTime(32);
    expect(signal?.aborted).toBe(true);
    expect(currentView()).toBeUndefined();
    await act(async () => { deliver(Response.json({ text: "Previous account confidential reply" })); });
    dock();
    expect(currentView()).toBe("welcomeFirst");
    expect(say()).not.toContain("Previous account");

    clerk.sessionId = null;
    clerk.isSignedIn = false;
    rendered.rerender(<ReadyHeader />);
    moveTime(32);
    expect(currentView()).toBeUndefined();
    dock();
    expect(currentView()).toBe("welcomeFirst");
  });
});
