// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MatchRoom from "@/components/MatchRoom";
import * as actions from "@/app/tournaments/room-actions";
import { getMatchRoomCopy } from "@/lib/i18n/match-room";
import type { MatchRoom as Room, MatchRoomHistory, MatchRoomMessage } from "@/lib/match-room";

vi.mock("@/app/tournaments/room-actions", () => ({
  resolveMatchRoom: vi.fn(),
  getMatchRoomHistory: vi.fn(),
  getMatchRoomEarlierHistory: vi.fn(),
  markMatchRoomRead: vi.fn(),
  sendMatchRoomMessage: vi.fn(),
  sendAdminMatchRoomMessage: vi.fn(),
}));

const id = (n: number) => `d19a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const copy = getMatchRoomCopy("en");
const participants = [{ registrationId: id(1), name: "Alpha" }, { registrationId: id(2), name: "Bravo" }];
const room = (overrides: Partial<Room> = {}): Room => ({
  id: id(100), matchId: id(300), roomRevision: 1, communicationGeneration: 1,
  activationVersionSnapshot: 1, playerOneRegistrationId: id(1), playerTwoRegistrationId: id(2),
  viewerRegistrationId: id(1), createdAt: "2026-09-19T00:00:00Z", closedAt: null,
  closureReason: null, writable: true, lastSequence: 1, lastReadSequence: 0, ...overrides,
});
const message = (sequence = 1, overrides: Partial<MatchRoomMessage> = {}): MatchRoomMessage => ({
  id: id(1000 + sequence), roomId: id(100), sequence, senderKind: "player",
  senderRegistrationId: id(2), body: `Message ${sequence}`, createdAt: "2026-09-19T00:00:00Z", ...overrides,
});
const page = (overrides: Partial<MatchRoomHistory> = {}): MatchRoomHistory => ({
  room: room(), messages: [message()], hasMore: false, nextAfterSequence: 1, ...overrides,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const renderRoom = (props: Partial<React.ComponentProps<typeof MatchRoom>> = {}) =>
  render(<MatchRoom matchId={id(300)} participants={participants} {...props} />);
async function ready() { await screen.findByText("Message 1"); }
async function refresh() {
  await waitFor(() => expect(screen.getByRole("button", { name: copy.refresh })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: copy.refresh }));
}

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: room() }));
  vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page()));
  vi.mocked(actions.markMatchRoomRead).mockImplementation(async (input) =>
    ok({ roomId: input.roomId, lastReadSequence: input.throughSequence }));
  vi.mocked(actions.sendMatchRoomMessage).mockResolvedValue(ok({ message: message(2), duplicate: false }));
  vi.mocked(actions.sendAdminMatchRoomMessage).mockResolvedValue(ok({ message: message(2, { senderKind: "admin", senderRegistrationId: null }), duplicate: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Match Room", () => {
  it("loads the authorized operational log, fixed author label, disclosure and private read cursor", async () => {
    renderRoom();
    await ready();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText(copy.privateNotice)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: copy.composerLabel })).toBeInTheDocument();
    await waitFor(() => expect(actions.markMatchRoomRead).toHaveBeenCalledWith({ roomId: id(100), throughSequence: 1 }));
    expect(screen.queryByText(id(2))).not.toBeInTheDocument();
  });

  it("renders no-room state without a broken composer or assistance footer", async () => {
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: null }));
    const footer = vi.fn();
    renderRoom({ footer });
    expect(await screen.findByText(copy.noRoom)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(actions.getMatchRoomHistory).not.toHaveBeenCalled();
    expect(footer).not.toHaveBeenCalled();
  });

  it("denies outsiders without fetching a transcript", async () => {
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue({ ok: false, code: "forbidden" });
    renderRoom();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.errors.forbidden);
    expect(actions.getMatchRoomHistory).not.toHaveBeenCalled();
  });

  it("pins historical access and never resolves a replacement when denied", async () => {
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue({ ok: false, code: "forbidden" });
    renderRoom({ roomId: id(99) });
    await screen.findByRole("alert");
    expect(actions.resolveMatchRoom).not.toHaveBeenCalled();
    expect(actions.getMatchRoomHistory).toHaveBeenCalledWith({ roomId: id(99), afterSequence: 0, limit: 50 });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows original historical membership read-only without borrowing replacement labels", async () => {
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      room: room({ writable: false, closedAt: "2026-09-19T01:00:00Z", closureReason: "lifecycle_changed" }),
    })));
    renderRoom({ roomId: id(100), participants: [{ registrationId: id(3), name: "Replacement" }] });
    await ready();
    expect(screen.getByText(copy.participant)).toBeInTheDocument();
    expect(screen.queryByText("Replacement")).not.toBeInTheDocument();
    expect(screen.getByText(copy.historical)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(actions.resolveMatchRoom).not.toHaveBeenCalled();
  });

  it("loads newest 50 rather than the oldest page in a current room", async () => {
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: room({ lastSequence: 120 }) }));
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      room: room({ lastSequence: 120 }), messages: [message(120)], nextAfterSequence: 120,
    })));
    renderRoom();
    await screen.findByText("Message 120");
    expect(actions.getMatchRoomHistory).toHaveBeenCalledWith({ roomId: id(100), afterSequence: 70, limit: 50 });
    expect(screen.getByText(copy.historyNotice)).toBeInTheDocument();
  });

  it("keeps exact Unicode draft on failure and reuses its client ID on retry", async () => {
    vi.mocked(actions.sendMatchRoomMessage)
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce(ok({ message: message(2), duplicate: true }));
    renderRoom();
    await ready();
    const draft = "  😀 ready\nsecond line  ";
    const textbox = screen.getByRole("textbox");
    fireEvent.change(textbox, { target: { value: draft } });
    fireEvent.click(screen.getByRole("button", { name: copy.send }));
    await screen.findByRole("button", { name: copy.retry });
    expect(textbox).toHaveValue(draft);
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
    await waitFor(() => expect(textbox).toHaveValue(""));
    const calls = vi.mocked(actions.sendMatchRoomMessage).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(calls[0][0].body).toBe(draft);
    expect(calls[0][0].expectedRoomId).toBe(id(100));
  });

  it("validates blank and code-point limit without preventing multiline input", async () => {
    renderRoom();
    await ready();
    const textbox = screen.getByRole("textbox");
    const send = screen.getByRole("button", { name: copy.send });
    fireEvent.change(textbox, { target: { value: " \n\t" } });
    expect(send).toBeDisabled();
    fireEvent.change(textbox, { target: { value: "😀".repeat(1000) } });
    expect(send).toBeEnabled();
    fireEvent.keyDown(textbox, { key: "Enter" });
    expect(actions.sendMatchRoomMessage).not.toHaveBeenCalled();
    fireEvent.change(textbox, { target: { value: "😀".repeat(1001) } });
    expect(send).toBeDisabled();
  });

  it("renders message text without interpreting markup and distinguishes admins", async () => {
    const body = "<img src=x onerror=alert(1)>\n<script>bad()</script>";
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      messages: [message(1, { senderKind: "admin", senderRegistrationId: null, body })],
    })));
    const { container } = renderRoom();
    expect(await screen.findByText(copy.adminLabel)).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByRole("log").textContent).toContain(body);
  });

  it("uses admin command and reports the active-profile requirement", async () => {
    const { unmount } = renderRoom({ admin: true });
    await ready();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Admin direction" } });
    fireEvent.click(screen.getByRole("button", { name: copy.send }));
    await waitFor(() => expect(actions.sendAdminMatchRoomMessage).toHaveBeenCalledTimes(1));
    expect(actions.sendMatchRoomMessage).not.toHaveBeenCalled();
    unmount();
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue({ ok: false, code: "forbidden" });
    renderRoom({ admin: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.adminProfileRequired);
  });

  it("keeps completed rooms read-only for players and admins", async () => {
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      room: room({ writable: false, closedAt: "2026-09-19T01:00:00Z", closureReason: "match_completed" }),
    })));
    renderRoom({ admin: true });
    await ready();
    expect(screen.getByText(copy.readOnly)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("retains transcript and draft after a failed refresh", async () => {
    renderRoom();
    await ready();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsent draft" } });
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue({ ok: false, code: "unavailable" });
    await refresh();
    await screen.findByRole("alert");
    expect(screen.getByText("Message 1")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Unsent draft");
  });

  it("polls at 10 seconds, pauses hidden tabs, and refreshes on focus and reconnect", async () => {
    vi.useFakeTimers();
    renderRoom();
    await act(async () => {});
    expect(actions.resolveMatchRoom).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(actions.resolveMatchRoom).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(actions.resolveMatchRoom).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(actions.resolveMatchRoom).toHaveBeenCalledTimes(3);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(actions.resolveMatchRoom).toHaveBeenCalledTimes(4);
  });

  it("does not pull a scrolled-up reader to new messages or acknowledge unseen messages", async () => {
    renderRoom();
    await ready();
    await waitFor(() => expect(actions.markMatchRoomRead).toHaveBeenCalledTimes(1));
    const log = screen.getByRole("log");
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 100 },
    });
    fireEvent.scroll(log);
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      room: room({ lastSequence: 2, lastReadSequence: 1 }), messages: [message(2)], nextAfterSequence: 2,
    })));
    await refresh();
    await screen.findByText("Message 2");
    expect(log.scrollTop).toBe(100);
    expect(actions.markMatchRoomRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: copy.newMessages }));
    await waitFor(() => expect(actions.markMatchRoomRead).toHaveBeenLastCalledWith({ roomId: id(100), throughSequence: 2 }));
    expect(log.scrollTop).toBe(1000);
  });

  it("ignores old asynchronous history after selecting another match", async () => {
    const waiting = deferred<Awaited<ReturnType<typeof actions.getMatchRoomHistory>>>();
    vi.mocked(actions.getMatchRoomHistory).mockReturnValueOnce(waiting.promise);
    const view = renderRoom();
    await waitFor(() => expect(actions.getMatchRoomHistory).toHaveBeenCalledTimes(1));
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: null }));
    view.rerender(<MatchRoom matchId={id(301)} participants={participants} />);
    await screen.findByText(copy.noRoom);
    await act(async () => { waiting.resolve(ok(page())); });
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
  });

  it("discards the old transcript and draft before a replacement room history loads", async () => {
    renderRoom();
    await ready();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Old private draft" } });
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: room({ id: id(101), roomRevision: 2 }) }));
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue({ ok: false, code: "unavailable" });
    await refresh();
    await screen.findByRole("alert");
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("ignores a stale send response after a lifecycle replacement", async () => {
    const waiting = deferred<Awaited<ReturnType<typeof actions.sendMatchRoomMessage>>>();
    vi.mocked(actions.sendMatchRoomMessage).mockReturnValue(waiting.promise);
    renderRoom();
    await ready();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Old room send" } });
    fireEvent.click(screen.getByRole("button", { name: copy.send }));
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: room({ id: id(101), roomRevision: 2, lastSequence: 0 }) }));
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValue(ok(page({
      room: room({ id: id(101), roomRevision: 2, lastSequence: 0 }), messages: [], nextAfterSequence: 0,
    })));
    await refresh();
    await screen.findByText(copy.empty);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New room draft" } });
    await act(async () => { waiting.resolve(ok({ message: message(2), duplicate: false })); });
    expect(screen.getByRole("textbox")).toHaveValue("New room draft");
    expect(screen.queryByText("Message 2")).not.toBeInTheDocument();
  });
});

describe("Match Room earlier history", () => {
  const messages = (first: number, last: number) =>
    Array.from({ length: last - first + 1 }, (_, index) => message(first + index));
  const recent = () => page({
    room: room({ lastSequence: 120, lastReadSequence: 120 }),
    messages: messages(71, 120), nextAfterSequence: 120,
  });
  const earlier = (first = 21, last = 70, hasMore = true) => ({
    room: room({ lastSequence: 120, lastReadSequence: 120 }),
    messages: messages(first, last), hasMore, nextBeforeSequence: first,
  });
  async function openRecent() {
    vi.mocked(actions.resolveMatchRoom).mockResolvedValue(ok({ room: recent().room }));
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValueOnce(ok(recent()));
    const view = renderRoom();
    await screen.findByText("Message 120");
    return view;
  }
  function loadEarlier() {
    fireEvent.click(screen.getByRole("button", { name: copy.loadOlder }));
  }
  function sequences() {
    return Array.from(screen.getByRole("log").querySelectorAll("article p"))
      .map((element) => Number(element.textContent!.split(" ")[1]));
  }

  it("loads bounded chronological unique pages until the beginning without changing read state", async () => {
    await openRecent();
    vi.mocked(actions.getMatchRoomEarlierHistory)
      .mockResolvedValueOnce(ok(earlier()))
      .mockResolvedValueOnce(ok(earlier(1, 20, false)));
    loadEarlier();
    await screen.findByText("Message 21");
    loadEarlier();
    await screen.findByText("Message 1");
    expect(sequences()).toEqual(Array.from({ length: 120 }, (_, index) => index + 1));
    expect(screen.queryByRole("button", { name: copy.loadOlder })).not.toBeInTheDocument();
    expect(actions.getMatchRoomEarlierHistory).toHaveBeenNthCalledWith(1, { roomId: id(100), beforeSequence: 71, limit: 50 });
    expect(actions.getMatchRoomEarlierHistory).toHaveBeenNthCalledWith(2, { roomId: id(100), beforeSequence: 21, limit: 50 });
    expect(actions.markMatchRoomRead).not.toHaveBeenCalled();
  });

  it("preserves the visible message anchor when a page prepends", async () => {
    await openRecent();
    const log = screen.getByRole("log");
    const anchor = log.querySelector<HTMLElement>("article")!;
    Object.defineProperties(log, {
      scrollTop: { configurable: true, writable: true, value: 100 },
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 200 },
    });
    vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => ({
      ...new DOMRect(), top: Array.from(log.querySelectorAll("article")).indexOf(anchor) * 20 - log.scrollTop,
    }));
    fireEvent.scroll(log);
    vi.mocked(actions.getMatchRoomEarlierHistory).mockResolvedValueOnce(ok(earlier()));
    loadEarlier();
    await screen.findByText("Message 21");
    expect(log.scrollTop).toBe(1100);
    expect(actions.markMatchRoomRead).not.toHaveBeenCalled();
  });

  it.each(["earlier first", "poll first"])("keeps both pages during concurrent refresh: %s", async (order) => {
    await openRecent();
    const older = deferred<Awaited<ReturnType<typeof actions.getMatchRoomEarlierHistory>>>();
    const poll = deferred<Awaited<ReturnType<typeof actions.getMatchRoomHistory>>>();
    vi.mocked(actions.getMatchRoomEarlierHistory).mockReturnValueOnce(older.promise);
    vi.mocked(actions.getMatchRoomHistory).mockReturnValueOnce(poll.promise);
    loadEarlier();
    await refresh();
    const newPage = page({
      room: room({ lastSequence: 121, lastReadSequence: 120 }), messages: [message(121)], nextAfterSequence: 121,
    });
    if (order === "earlier first") {
      await act(async () => { older.resolve(ok(earlier())); });
      await act(async () => { poll.resolve(ok(newPage)); });
    } else {
      await act(async () => { poll.resolve(ok(newPage)); });
      await act(async () => { older.resolve(ok(earlier())); });
    }
    expect(sequences()).toEqual(Array.from({ length: 101 }, (_, index) => index + 21));
    expect(actions.markMatchRoomRead).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: copy.newMessages })).toBeInTheDocument();
  });

  it("retains transcript, draft and earlier cursor on failure and retries the same page", async () => {
    await openRecent();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsent current draft" } });
    vi.mocked(actions.getMatchRoomEarlierHistory)
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce(ok(earlier()));
    loadEarlier();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.historyLoadFailed);
    expect(screen.getByText("Message 120")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Unsent current draft");
    loadEarlier();
    await screen.findByText("Message 21");
    const calls = vi.mocked(actions.getMatchRoomEarlierHistory).mock.calls;
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores an earlier page after a lifecycle replacement", async () => {
    await openRecent();
    const older = deferred<Awaited<ReturnType<typeof actions.getMatchRoomEarlierHistory>>>();
    vi.mocked(actions.getMatchRoomEarlierHistory).mockReturnValueOnce(older.promise);
    loadEarlier();
    const replacement = room({ id: id(101), roomRevision: 2, lastSequence: 0 });
    vi.mocked(actions.resolveMatchRoom).mockResolvedValueOnce(ok({ room: replacement }));
    vi.mocked(actions.getMatchRoomHistory).mockResolvedValueOnce(ok(page({
      room: replacement, messages: [], nextAfterSequence: 0,
    })));
    await refresh();
    await screen.findByText(copy.empty);
    await act(async () => { older.resolve(ok(earlier())); });
    expect(screen.queryByText("Message 21")).not.toBeInTheDocument();
    expect(screen.queryByText("Message 120")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.loadOlder })).not.toBeInTheDocument();
  });

  it("does not restore history from an in-flight poll after earlier-page authorization is denied", async () => {
    await openRecent();
    const older = deferred<Awaited<ReturnType<typeof actions.getMatchRoomEarlierHistory>>>();
    const poll = deferred<Awaited<ReturnType<typeof actions.getMatchRoomHistory>>>();
    vi.mocked(actions.getMatchRoomEarlierHistory).mockReturnValueOnce(older.promise);
    vi.mocked(actions.getMatchRoomHistory).mockReturnValueOnce(poll.promise);
    loadEarlier();
    await refresh();
    await act(async () => { older.resolve({ ok: false, code: "forbidden" }); });
    await act(async () => { poll.resolve(ok(recent())); });
    expect(screen.getByRole("alert")).toHaveTextContent(copy.errors.forbidden);
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("uses only the pinned historical room when loading earlier messages", async () => {
    const closed = room({ lastSequence: 120, lastReadSequence: 120, writable: false,
      closedAt: "2026-09-19T02:00:00Z", closureReason: "lifecycle_changed" });
    vi.mocked(actions.getMatchRoomHistory)
      .mockResolvedValueOnce(ok(page({ room: closed, messages: messages(1, 50), hasMore: true, nextAfterSequence: 50 })))
      .mockResolvedValueOnce(ok({ ...recent(), room: closed }));
    vi.mocked(actions.getMatchRoomEarlierHistory).mockResolvedValueOnce(ok({ ...earlier(), room: closed }));
    renderRoom({ roomId: id(100) });
    await screen.findByText("Message 120");
    loadEarlier();
    await screen.findByText("Message 21");
    expect(actions.resolveMatchRoom).not.toHaveBeenCalled();
    expect(screen.getByText(copy.historical)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
