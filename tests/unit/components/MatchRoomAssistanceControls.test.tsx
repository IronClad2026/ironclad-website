// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchRoomAssistance } from "@/lib/match-room-assistance";
const mocks = vi.hoisted(() => ({ read: vi.fn(), request: vi.fn(), resolve: vi.fn() }));
vi.mock("@/app/tournaments/support-actions", () => ({ getMatchRoomAssistance: mocks.read, requestMatchAdminAssistance: mocks.request, resolveMatchAdminAssistance: mocks.resolve }));
import MatchRoomAssistanceControls from "@/components/MatchRoomAssistanceControls";
const ROOM = "22222222-2222-4222-8222-222222222222";
let state: MatchRoomAssistance;
const tick = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  state = { roomId: ROOM, status: "none", requestVersion: 0, requestedAt: null, resolvedAt: null, canResolve: false };
  mocks.read.mockImplementation(async () => ({ ok: true, data: { ...state } }));
  mocks.request.mockImplementation(async () => {
    state = { ...state, status: "requested", requestVersion: state.requestVersion + 1, requestedAt: "2026-09-20T01:00:00Z", resolvedAt: null };
    return { ok: true, data: { ...state } };
  });
  mocks.resolve.mockImplementation(async () => {
    state = { ...state, status: "resolved", resolvedAt: "2026-09-20T01:01:00Z", canResolve: false };
    return { ok: true, data: { ...state } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("room assistance lifecycle controls", () => {
  it("reads legacy request history without creation or reopening and preserves adjacent drafts", async () => {
    state = { ...state, status: "requested", requestVersion: 2, requestedAt: "2026-09-20T01:00:00Z" };
    render(<><textarea aria-label="Result draft" defaultValue="unsaved result" /><MatchRoomAssistanceControls roomId={ROOM} /></>);
    await tick();
    expect(mocks.read).toHaveBeenCalledWith({ roomId: ROOM });
    expect(screen.getByRole("status")).toHaveTextContent("Assistance requested");
    expect(screen.queryByRole("button", { name: "Request Admin Assistance" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Result draft")).toHaveValue("unsaved result");
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
    state = { ...state, status: "resolved", resolvedAt: "2026-09-20T01:01:00Z" };
    fireEvent.focus(window); await tick();
    expect(screen.getByRole("status")).toHaveTextContent("Assistance resolved");
    expect(screen.queryByRole("button", { name: /Request assistance again|Reopen/i })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Result draft")).toHaveValue("unsaved result");
  });
  it("resolves an earlier request with its authoritative capability and keeps reopening retired", async () => {
    state = { ...state, status: "requested", requestVersion: 4, requestedAt: "2026-09-20T01:00:00Z", canResolve: true };
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    fireEvent.click(screen.getByRole("button", { name: /^Resolve assistance$/i })); await tick();
    expect(mocks.resolve).toHaveBeenCalledWith({ roomId: ROOM, expectedRequestVersion: 4 });
    expect(screen.getByRole("status")).toHaveTextContent("Assistance resolved");
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Request assistance again|Reopen/i })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("admin display props do not manufacture a resolve capability", async () => {
    state = { ...state, status: "requested", requestVersion: 1, requestedAt: "2026-09-20T01:00:00Z" };
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
  });
  it("keeps retries at the same version after an unconfirmed failure", async () => {
    state = { ...state, status: "requested", requestVersion: 4, requestedAt: "2026-09-20T01:00:00Z", canResolve: true };
    mocks.resolve.mockRejectedValueOnce(new Error("lost response"));
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    fireEvent.click(screen.getByRole("button", { name: /^Resolve assistance$/i })); await tick();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Resolve assistance$/i })); await tick();
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.resolve.mock.calls[0]).toEqual([{ roomId: ROOM, expectedRequestVersion: 4 }]);
    expect(mocks.resolve.mock.calls[1]).toEqual(mocks.resolve.mock.calls[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Assistance resolved");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("polls communication only, pauses hidden and refreshes on focus", async () => {
    render(<MatchRoomAssistanceControls roomId={ROOM} />); await tick();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent.focus(window); await tick();
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });
  it("does not show another room's assistance while a prior request is in flight", async () => {
    let complete!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const view = render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    const other = "33333333-3333-4333-8333-333333333333";
    state = { ...state, roomId: other, status: "requested", requestVersion: 3, requestedAt: "2026-09-20T01:00:00Z", canResolve: true };
    view.rerender(<MatchRoomAssistanceControls roomId={other} admin />); await tick();
    await act(async () => complete({ ok: true, data: { ...state, roomId: ROOM, status: "requested", requestVersion: 9 } }));
    fireEvent.click(screen.getByRole("button", { name: /^Resolve assistance$/i })); await tick();
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({ roomId: other, expectedRequestVersion: 3 });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("fails closed on denied history instead of keeping a resolve button", async () => {
    state = { ...state, status: "requested", requestVersion: 1, requestedAt: "2026-09-20T01:00:00Z", canResolve: true };
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    mocks.read.mockResolvedValue({ ok: false, code: "forbidden" });
    fireEvent.focus(window); await tick();
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
