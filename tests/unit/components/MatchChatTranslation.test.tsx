// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchChatTranslationControls, MatchChatTranslationProvider, MatchChatTranslatedMessage,
} from "@/components/MatchChatTranslation";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import { getChatTranslationCopy } from "@/lib/i18n/chat-translation";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { MatchRoomMessage } from "@/lib/match-room";
import type { ChatTranslationInput } from "@/lib/chat-translation";
import * as actions from "@/lib/chat-translation-client";

const identity = vi.hoisted(() => ({ userId: "test-player", sessionId: "test-session" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => identity }));
vi.mock("@/lib/chat-translation-client", () => ({
  translateMatchChatMessage: vi.fn(), validateMatchChatTranslations: vi.fn(),
}));
const ROOM = "10000000-0000-4000-8000-000000000001";
const OWN = "10000000-0000-4000-8000-000000000002";
const OPPONENT = "10000000-0000-4000-8000-000000000003";
const body = "Possiamo giocare il 12 novembre 2026 alle 19:30 UTC? Non alle 20:30. 2-0 @Alpha https://example.com/match";
const copy = getChatTranslationCopy("en");
const message = (sequence = 1, overrides: Partial<MatchRoomMessage> = {}): MatchRoomMessage => ({
  id: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`, roomId: ROOM, sequence,
  senderKind: "player", senderRegistrationId: OPPONENT, body, createdAt: "2026-11-03T00:00:00Z", ...overrides,
});
const ok = <T,>(data: T) => ({ ok: true as const, data });
const translated = (value: unknown, overrides = {}) => {
  const input = value as ChatTranslationInput;
  return ok({
    roomId: input.roomId, messageId: input.messageId, original: body, sourceHash: "a".repeat(64),
    sourceLanguage: "it" as const, targetLanguage: input.targetLanguage,
    translatedText: "Can we play on 12 November 2026 at 19:30 UTC? Not at 20:30. 2-0 @Alpha https://example.com/match",
    cached: false, status: "translated" as const, ...overrides,
  });
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
};
function Fixture({ messages = [message()], locale = "en", roomId = ROOM, active = true }: {
  messages?: MatchRoomMessage[]; locale?: Locale; roomId?: string; active?: boolean;
}) {
  return <LocaleProvider locale={locale} dictionaries={{}}>
    <MatchChatTranslationProvider roomId={roomId} viewerRegistrationId={OWN} messages={messages} active={active}>
      <MatchChatTranslationControls />
      {messages.map((entry) => <article key={entry.id} data-testid={entry.id}><MatchChatTranslatedMessage message={entry} /></article>)}
      <textarea aria-label="Unrelated draft" defaultValue="Unfinished result / replay draft" />
    </MatchChatTranslationProvider>
  </LocaleProvider>;
}
async function ready() {
  await waitFor(() => expect(screen.getAllByRole("button", { name: copy.translate })[0]).toBeEnabled());
}
async function translateFirst() {
  await ready();
  fireEvent.click(screen.getAllByRole("button", { name: copy.translate })[0]);
  await screen.findByRole("button", { name: copy.showOriginal });
}
beforeEach(() => {
  localStorage.clear();
  identity.userId = "test-player";
  identity.sessionId = "test-session";
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.mocked(actions.validateMatchChatTranslations).mockImplementation(async (value) => {
    const { messageIds } = value as { messageIds: string[] };
    return ok({ enabled: true, messages: messageIds.map((messageId) => ({ messageId, original: body, sourceHash: "a".repeat(64) })) });
  });
  vi.mocked(actions.translateMatchChatMessage).mockImplementation(async (input) => translated(input));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Match chat translation", () => {
  it.each(SUPPORTED_LOCALES)("defaults reading language to website %s and provides a localized notice", async (locale) => {
    render(<Fixture locale={locale} />);
    const localized = getChatTranslationCopy(locale);
    expect(screen.getByRole("combobox", { name: localized.readingLanguage })).toHaveValue(locale);
    expect(screen.getByRole("combobox", { name: localized.sourceLanguage })).toHaveValue("auto");
    fireEvent.focus(screen.getByRole("button", { name: localized.info }));
    expect(screen.getByText(localized.notice)).toBeVisible();
    expect(localized.notice.length).toBeGreaterThan(30);
    await waitFor(() => expect(actions.validateMatchChatTranslations).toHaveBeenCalled());
  });

  it("translates independently, labels output and restores the exact original without changing drafts", async () => {
    render(<Fixture />);
    await translateFirst();
    expect(actions.translateMatchChatMessage).toHaveBeenCalledWith({ roomId: ROOM, messageId: message().id, targetLanguage: "en", sourceLanguage: "auto" });
    expect(screen.getByText(copy.translated)).toBeVisible();
    expect(screen.getByText(/^Can we play/)).toHaveTextContent("19:30 UTC? Not at 20:30. 2-0 @Alpha https://example.com/match");
    expect(screen.getByText(/^Can we play/)).toHaveAttribute("lang", "en");
    expect(screen.getByRole("textbox", { name: "Unrelated draft" })).toHaveValue("Unfinished result / replay draft");
    fireEvent.click(screen.getByRole("button", { name: copy.showOriginal }));
    expect(screen.getByText(body)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    await waitFor(() => expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(2));
  });

  it("stores only account-scoped language and auto preferences, never message or translation text", async () => {
    const view = render(<Fixture />);
    await ready();
    fireEvent.change(screen.getByRole("combobox", { name: copy.readingLanguage }), { target: { value: "fr" } });
    fireEvent.click(screen.getByRole("checkbox", { name: copy.automatic }));
    expect(localStorage.getItem("ironclad.chat-translation.v1:test-player")).toBe('{"readingLanguage":"fr","automatic":true}');
    view.unmount();
    render(<Fixture locale="it" />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: getChatTranslationCopy("it").readingLanguage })).toHaveValue("fr"));
    expect(actions.translateMatchChatMessage).not.toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain("19:30");
  });

  it("automatically translates only new opponent messages, skipping history, self and admin messages", async () => {
    const view = render(<Fixture />);
    await ready();
    fireEvent.change(screen.getByRole("combobox", { name: copy.sourceLanguage }), { target: { value: "es" } });
    fireEvent.click(screen.getByRole("checkbox", { name: copy.automatic }));
    expect(actions.translateMatchChatMessage).not.toHaveBeenCalled();
    view.rerender(<Fixture messages={[
      message(), message(2, { senderRegistrationId: OWN }),
      message(3, { senderKind: "admin", senderRegistrationId: null }), message(4), message(5),
    ]} />);
    await waitFor(() => expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(actions.translateMatchChatMessage).mock.calls.map(([input]) => (input as ChatTranslationInput).messageId)).toEqual([message(4).id, message(5).id]);
    expect(vi.mocked(actions.translateMatchChatMessage).mock.calls.every(([input]) => (input as ChatTranslationInput).sourceLanguage === "auto")).toBe(true);
    view.rerender(<Fixture messages={[message(0), message(), message(4), message(5)]} />);
    expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(2);
  });

  it("asks for an explicit source when detection is ambiguous and never uses website locale as source", async () => {
    vi.mocked(actions.translateMatchChatMessage).mockImplementation(async (input) => translated(input, {
      sourceLanguage: null, translatedText: null, status: "source_required",
    }));
    render(<Fixture />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    await screen.findByText(copy.source_required);
    fireEvent.change(screen.getByRole("combobox", { name: copy.sourceLanguage }), { target: { value: "es" } });
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    await waitFor(() => expect(actions.translateMatchChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({ sourceLanguage: "es" })));
  });

  it.each(["quota_exhausted", "rate_limited", "busy", "unavailable"] as const)("keeps originals and drafts available on %s", async (status) => {
    vi.mocked(actions.translateMatchChatMessage).mockImplementation(async (input) => translated(input, { translatedText: null, status }));
    render(<Fixture />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    await screen.findByText(copy[status]);
    expect(screen.getByText(body)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Unrelated draft" })).toHaveValue("Unfinished result / replay draft");
  });

  it("keeps disabled controls visible and validates privacy independently of the provider switch", async () => {
    vi.mocked(actions.validateMatchChatTranslations).mockResolvedValue(ok({ enabled: false, messages: [] }));
    render(<Fixture />);
    await screen.findByText(copy.unavailable);
    expect(screen.getByRole("button", { name: copy.translate })).toBeDisabled();
    expect(screen.getByText(body)).toBeVisible();
    expect(actions.translateMatchChatMessage).not.toHaveBeenCalled();
  });

  it("discards an in-flight response after reading language or session changes", async () => {
    const waiting = deferred<Awaited<ReturnType<typeof actions.translateMatchChatMessage>>>();
    vi.mocked(actions.translateMatchChatMessage).mockReturnValue(waiting.promise);
    const view = render(<Fixture />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    const input = vi.mocked(actions.translateMatchChatMessage).mock.calls[0][0];
    fireEvent.change(screen.getByRole("combobox", { name: copy.readingLanguage }), { target: { value: "ko" } });
    await act(async () => waiting.resolve(translated(input)));
    expect(screen.queryByText(/^Can we play/)).not.toBeInTheDocument();
    identity.sessionId = "replacement-session";
    view.rerender(<Fixture />);
    expect(screen.getByText(body)).toBeVisible();
    expect(screen.queryByText(copy.translated)).not.toBeInTheDocument();
  });

  it("clears derived text on hidden/offline and reauthorizes on return without requesting another translation", async () => {
    render(<Fixture />);
    await translateFirst();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.queryByText(/^Can we play/)).not.toBeInTheDocument();
    expect(screen.getByText(body)).toBeVisible();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    await ready();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new Event("offline"));
    expect(screen.getByRole("button", { name: copy.translate })).toBeDisabled();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    fireEvent(window, new Event("online"));
    await ready();
    expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(1);
    expect(actions.validateMatchChatTranslations).toHaveBeenLastCalledWith({ roomId: ROOM, messageIds: [message().id] });
  });

  it("never restores redacted text from stale props or a late translation, even with the provider off", async () => {
    const waiting = deferred<Awaited<ReturnType<typeof actions.translateMatchChatMessage>>>();
    vi.mocked(actions.translateMatchChatMessage).mockReturnValue(waiting.promise);
    render(<Fixture />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: copy.translate }));
    const input = vi.mocked(actions.translateMatchChatMessage).mock.calls[0][0];
    vi.mocked(actions.validateMatchChatTranslations).mockResolvedValue(ok({ enabled: false,
      messages: [{ messageId: message().id, original: null, sourceHash: null }],
    }));
    fireEvent.focus(window);
    await screen.findByText(copy.redacted);
    await act(async () => waiting.resolve(translated(input)));
    expect(screen.queryByText(body)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Can we play/)).not.toBeInTheDocument();
    fireEvent.focus(window);
    await screen.findByText(copy.redacted);
  });

  it("removes derived content when validation denies access or fails", async () => {
    render(<Fixture />);
    await translateFirst();
    vi.mocked(actions.validateMatchChatTranslations).mockResolvedValue({ ok: false, code: "forbidden" });
    fireEvent.focus(window);
    await screen.findByText(copy.denied);
    expect(screen.queryByText(body)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Can we play/)).not.toBeInTheDocument();
  });

  it("revalidates displayed results every 15 seconds and replaces changed originals without showing stale translations", async () => {
    vi.useFakeTimers();
    render(<Fixture />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.translate })));
    expect(screen.getByText(/^Can we play/)).toBeVisible();
    vi.mocked(actions.validateMatchChatTranslations).mockResolvedValue(ok({ enabled: true,
      messages: [{ messageId: message().id, original: "Updated original: 20:00 UTC, not 19:30", sourceHash: "b".repeat(64) }],
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(actions.validateMatchChatTranslations).toHaveBeenLastCalledWith({ roomId: ROOM, messageIds: [message().id] });
    expect(screen.getByText("Updated original: 20:00 UTC, not 19:30")).toBeVisible();
    expect(screen.queryByText(/^Can we play/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Unrelated draft" })).toHaveValue("Unfinished result / replay draft");
  });

  it("keeps automatic requests serial across history refreshes and does not duplicate a pending message", async () => {
    const waiting = deferred<Awaited<ReturnType<typeof actions.translateMatchChatMessage>>>();
    vi.mocked(actions.translateMatchChatMessage).mockReturnValueOnce(waiting.promise);
    const view = render(<Fixture />);
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: copy.automatic }));
    view.rerender(<Fixture messages={[message(), message(2), message(3)]} />);
    await waitFor(() => expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(1));
    const input = vi.mocked(actions.translateMatchChatMessage).mock.calls[0][0];
    view.rerender(<Fixture messages={[message(), message(2), message(3)]} />);
    expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(1);
    await act(async () => waiting.resolve(translated(input)));
    await waitFor(() => expect(actions.translateMatchChatMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(actions.translateMatchChatMessage).mock.calls.map(([request]) => (request as ChatTranslationInput).messageId)).toEqual([message(2).id, message(3).id]);
  });

  it("bounds derived results and each validation batch to the latest 50 requested messages", async () => {
    const messages = Array.from({ length: 55 }, (_, index) => message(index + 1));
    render(<Fixture messages={messages} />);
    await ready();
    for (const entry of messages) {
      const button = screen.getByTestId(entry.id).querySelector("button")!;
      await act(async () => fireEvent.click(button));
    }
    expect(screen.getAllByText(copy.translated)).toHaveLength(50);
    fireEvent.focus(window);
    await waitFor(() => expect(actions.validateMatchChatTranslations).toHaveBeenLastCalledWith({
      roomId: ROOM, messageIds: messages.slice(5).map((entry) => entry.id),
    }));
    expect(vi.mocked(actions.validateMatchChatTranslations).mock.calls.every(([input]) => (input as { messageIds: string[] }).messageIds.length <= 50)).toBe(true);
  });

  it("renders translations as plain text and exposes the notice by hover, focus, tap and Escape", async () => {
    vi.mocked(actions.translateMatchChatMessage).mockImplementation(async (input) => translated(input, { translatedText: "<img src=x onerror=alert(1)>" }));
    const view = render(<Fixture />);
    await translateFirst();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(view.container.querySelector("img")).toBeNull();
    const info = screen.getByRole("button", { name: copy.info });
    fireEvent.mouseEnter(info.parentElement!);
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(copy.notice)).toBeVisible();
    fireEvent.mouseLeave(info.parentElement!);
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(info);
    fireEvent.click(info);
    expect(screen.getByText(copy.notice)).toBeVisible();
    fireEvent.keyDown(info, { key: "Escape" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(screen.getByText(copy.notice)).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(info).toHaveAttribute("aria-expanded", "false");
  });

  it("does not mount translation controls or actions for admin chat", async () => {
    render(<Fixture active={false} />);
    expect(screen.getByText(body)).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await act(async () => {});
    expect(actions.validateMatchChatTranslations).not.toHaveBeenCalled();
  });
});
