// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadyUsage } from "@/lib/ready/use-ready-usage";

const endpoint = "/api/ready/usage";
const epoch = "97400208-7b75-4c93-9243-cca74658b3a5";
const off = { enabled: false, epoch: null };
const on = { enabled: true, epoch };
const fetcher = vi.fn<typeof fetch>();
const body = (request: RequestInit | undefined) => JSON.parse(String(request?.body)) as unknown;

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Ready usage consent in the browser", () => {
  it("sends no guest requests and creates no guest analytics storage", () => {
    const { result } = renderHook(() => useReadyUsage(false));
    act(() => { result.current.track({ type: "manual_open" }); });
    expect(result.current.enabled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("drops pre-consent interactions and immediately pauses and aborts pending events when consent is withdrawn", async () => {
    const initial = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(initial.promise);
    const { result } = renderHook(() => useReadyUsage(true));
    expect(result.current.enabled).toBe(false);
    expect(fetcher.mock.calls).toEqual([[endpoint, { cache: "no-store", signal: expect.any(AbortSignal) }]]);
    act(() => { result.current.track({ type: "manual_open" }); });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => { initial.resolve(Response.json(off)); });
    expect(result.current.loaded).toBe(true);
    expect(result.current.enabled).toBe(false);
    act(() => { result.current.track({ type: "category_select", categoryId: "rules" }); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);

    const consent = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(consent.promise);
    act(() => { void result.current.setEnabled(true); });
    expect(body(fetcher.mock.calls[1][1])).toEqual({ kind: "choice", enabled: true });
    act(() => { result.current.track({ type: "engage" }); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => { consent.resolve(Response.json(on)); });
    expect(result.current.enabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const pendingEvent = Promise.withResolvers<Response>();
    const withdrawal = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(pendingEvent.promise).mockReturnValueOnce(withdrawal.promise);
    act(() => { result.current.track({ type: "question_select", questionId: "disconnects" }); });
    expect(fetcher.mock.calls[2][0]).toBe(endpoint);
    const eventRequest = fetcher.mock.calls[2][1];
    expect(body(eventRequest)).toEqual({
      kind: "event", epoch,
      browserId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      event: { type: "question_select", questionId: "disconnects" },
    });
    expect(eventRequest?.signal?.aborted).toBe(false);

    act(() => { void result.current.setEnabled(false); });
    expect(body(fetcher.mock.calls[3][1])).toEqual({ kind: "choice", enabled: false });
    expect(eventRequest?.signal?.aborted).toBe(true);
    expect(result.current.enabled).toBe(false);
    act(() => { result.current.track({ type: "manual_open" }); });
    expect(fetcher).toHaveBeenCalledTimes(4);

    await act(async () => {
      pendingEvent.resolve(Response.json({}, { status: 503 }));
      withdrawal.resolve(Response.json(off));
    });
    act(() => { result.current.track({ type: "engage" }); });
    expect(result.current.enabled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(sessionStorage.length).toBe(0);
  });

  it("discards events and does not retry when the server rejects an epoch withdrawn in another tab", async () => {
    fetcher.mockResolvedValueOnce(Response.json(on));
    const { result } = renderHook(() => useReadyUsage(true));
    await waitFor(() => expect(result.current.enabled).toBe(true));
    fetcher.mockResolvedValueOnce(Response.json({ error: "off" }, { status: 403 }));

    await act(async () => { result.current.track({ type: "manual_open" }); });
    expect(result.current.enabled).toBe(false);
    act(() => { result.current.track({ type: "engage" }); });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
