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
  it("loads durable state, requests once and preserves adjacent form drafts", async () => {
    render(<><textarea aria-label="Result draft" defaultValue="unsaved result" /><MatchRoomAssistanceControls roomId={ROOM} /></>);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Request Admin Assistance" })); await tick();
    expect(mocks.request).toHaveBeenCalledWith({ roomId: ROOM, expectedRequestVersion: 0 });
    expect(screen.queryByRole("button", { name: "Request Admin Assistance" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Result draft")).toHaveValue("unsaved result");
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
  });
  it("resolves only with the authoritative capability and reopens using the current version", async () => {
    state = { ...state, status: "requested", requestVersion: 4, requestedAt: "2026-09-20T01:00:00Z", canResolve: true };
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    fireEvent.click(screen.getByRole("button", { name: /^Resolve assistance$/i })); await tick();
    expect(mocks.resolve).toHaveBeenCalledWith({ roomId: ROOM, expectedRequestVersion: 4 });
    fireEvent.click(screen.getByRole("button", { name: /Reopen/i })); await tick();
    expect(mocks.request).toHaveBeenCalledWith({ roomId: ROOM, expectedRequestVersion: 4 });
  });
  it("admin display props do not manufacture a resolve capability", async () => {
    state = { ...state, status: "requested", requestVersion: 1, requestedAt: "2026-09-20T01:00:00Z" };
    render(<MatchRoomAssistanceControls roomId={ROOM} admin />); await tick();
    expect(screen.queryByRole("button", { name: /^Resolve assistance$/i })).not.toBeInTheDocument();
  });
  it("keeps retries at the same version after an unconfirmed failure", async () => {
    mocks.request.mockRejectedValueOnce(new Error("lost response"));
    render(<MatchRoomAssistanceControls roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Request Admin Assistance" })); await tick();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request Admin Assistance" })); await tick();
    expect(mocks.request.mock.calls[0]).toEqual(mocks.request.mock.calls[1]);
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
    const view = render(<MatchRoomAssistanceControls roomId={ROOM} />); await tick();
    const other = "33333333-3333-4333-8333-333333333333";
    state = { ...state, roomId: other };
    view.rerender(<MatchRoomAssistanceControls roomId={other} />); await tick();
    await act(async () => complete({ ok: true, data: { ...state, roomId: ROOM, status: "requested", requestVersion: 9 } }));
    fireEvent.click(screen.getByRole("button", { name: "Request Admin Assistance" })); await tick();
    expect(mocks.request).toHaveBeenCalledWith({ roomId: other, expectedRequestVersion: 0 });
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
