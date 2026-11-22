// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReadyDockInvitation from "@/components/ready/ReadyDockInvitation";

const lastKey = "ironclad-ready:invitation:v1:last";

function Dock({ sessionId = null, onAsk = () => {} }: {
  sessionId?: string | null;
  onAsk?: () => void;
}) {
  const dock = useRef<HTMLButtonElement>(null);
  return (
    <>
      <header><button ref={dock} type="button">Ready icon</button></header>
      <form><label>Display name <input /></label></form>
      <ReadyDockInvitation dock={dock} wardrobeSessionId={sessionId} onAsk={onAsk} />
    </>
  );
}

async function tick(ms = 30_000) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 56, 56));
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("waits for quiet time, opens Help only on request, and alternates on a new eligible tab", async () => {
  const onAsk = vi.fn();
  const fetch = vi.fn().mockResolvedValue(Response.json({ access: "admin", sessionId: "admin-session" }));
  vi.stubGlobal("fetch", fetch);
  const first = render(<Dock onAsk={onAsk} sessionId="admin-session" />);
  await tick(29_999);
  expect(screen.queryByRole("region", { name: "Ready invitation" })).toBeNull();
  await tick(1);
  expect(screen.getByText("I’m Ready, Commander. Need a hand with IronClad?")).toBeVisible();
  expect(onAsk).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Ask Ready" }));
  expect(onAsk).toHaveBeenCalledOnce();
  first.unmount();

  const sameTab = render(<Dock sessionId="admin-session" />);
  await tick();
  expect(screen.queryByRole("region", { name: "Ready invitation" })).toBeNull();
  sameTab.unmount();
  sessionStorage.clear();

  render(<Dock sessionId="admin-session" />);
  await tick();
  expect(screen.getByText("Want to change my look, Commander?")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open wardrobe" })).toHaveAttribute("href",
    "/dashboard?wardrobe=open#ready-wardrobe");
  expect(localStorage.getItem(lastKey)).toBe("wardrobe");
});

it("holds the invitation while a form has focus and permanently dismisses it for the tab", async () => {
  render(<Dock />);
  const field = screen.getByRole("textbox", { name: "Display name" });
  field.focus();
  await tick();
  expect(field).toHaveFocus();
  expect(screen.queryByRole("region", { name: "Ready invitation" })).toBeNull();
  field.blur();
  await tick();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.getByRole("button", { name: "Ready icon" })).toHaveFocus();
  fireEvent(window, new Event("resize"));
  await tick();
  expect(screen.queryByRole("region", { name: "Ready invitation" })).toBeNull();
});

it("clears the bubble when editing begins without moving focus away from the field", async () => {
  render(<Dock />);
  await tick();
  expect(screen.getByRole("region", { name: "Ready invitation" })).toBeVisible();
  const field = screen.getByRole("textbox", { name: "Display name" });
  act(() => field.focus());
  expect(screen.queryByRole("region", { name: "Ready invitation" })).toBeNull();
  expect(field).toHaveFocus();
});

it.each([
  [null, { access: "subscriber", sessionId: "player-session" }, false],
  ["player-session", { access: "locked", sessionId: "player-session" }, true],
  ["player-session", { access: "subscriber", sessionId: "former-session" }, true],
])("keeps the wardrobe action hidden without current access (%s)", async (sessionId, state, expectedRequest) => {
  localStorage.setItem(lastKey, "help");
  const fetch = vi.fn().mockResolvedValue(Response.json(state));
  vi.stubGlobal("fetch", fetch);
  render(<Dock sessionId={sessionId} />);
  await tick();
  expect(screen.getByRole("button", { name: "Ask Ready" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Open wardrobe" })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(expectedRequest ? 1 : 0);
});
