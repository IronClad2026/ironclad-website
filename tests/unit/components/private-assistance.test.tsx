// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistanceAdminQueue, AssistanceContext, AssistanceConversation as History, AssistanceRequest } from "@/lib/private-assistance";

const mocks = vi.hoisted(() => ({ context: vi.fn(), open: vi.fn(), read: vi.fn(), reply: vi.fn(), queue: vi.fn(), status: vi.fn(), auth: { isLoaded: true, userId: "player-a", sessionId: "session-a", sessionClaims: { metadata: { role: "player" } } } }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/app/tournaments/private-assistance-actions", () => ({ getPrivateAssistanceContext: mocks.context, openPrivateAssistance: mocks.open, readPrivateAssistance: mocks.read, replyPrivateAssistance: mocks.reply }));
vi.mock("@/app/admin/tournaments/assistance-actions", () => ({ getAdminPrivateAssistanceQueue: mocks.queue, setPrivateAssistanceStatus: mocks.status }));
import PrivateMatchAssistance from "@/components/PrivateMatchAssistance";
import AssistanceConversation from "@/components/AssistanceConversation";
import AdminPrivateAssistance from "@/components/admin/tournaments/AdminPrivateAssistance";

const ROOM = "11111111-1111-4111-8111-111111111111";
const TOUR = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
let context: AssistanceContext;
let request: AssistanceRequest;
let history: History;
let queue: AssistanceAdminQueue;
const tick = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.auth = { isLoaded: true, userId: "player-a", sessionId: "session-a", sessionClaims: { metadata: { role: "player" } } };
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  request = { id: REQUEST, roomId: ROOM, tournamentId: TOUR, tournamentTitle: "Tournament A", tournamentBracketId: OTHER, divisionName: "Academy", matchId: OTHER, matchReference: "Quarterfinal1", reference: "Tournament A / Academy / Quarterfinal1", requesterRegistrationId: OTHER, requesterName: "Player A", status: "open", version: 1, lastSequence: 1, createdAt: "2026-11-03T01:00:00Z", updatedAt: "2026-11-03T01:00:00Z", resolvedAt: null, contentPurgedAt: null };
  context = { room: { ...request }, request: null, newRequestsEnabled: true, canCreate: true, discordUrl: null };
  history = { request, messages: [{ id: OTHER, requestId: REQUEST, sequence: 1, senderKind: "requester", body: "Private original", createdAt: request.createdAt, redactedAt: null }], hasMore: false, nextAfterSequence: 1, canReply: true, canSetStatus: false };
  queue = { tournamentId: TOUR, requests: [request], counts: { all: 1, open: 1, in_progress: 0, resolved: 0 }, filteredCount: 1, page: 1, pageCount: 1, filter: "all", selectedRequest: request, newRequestsEnabled: true };
  mocks.context.mockImplementation(async () => ({ ok: true, data: context }));
  mocks.read.mockImplementation(async () => ({ ok: true, data: history }));
  mocks.queue.mockImplementation(async () => ({ ok: true, data: queue }));
  mocks.open.mockImplementation(async (input) => ({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: input.clientMessageId, duplicate: false } }));
  mocks.reply.mockImplementation(async (input) => ({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: input.clientMessageId, duplicate: false } }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("private assistance player controls", () => {
  it("requires a body, preserves adjacent drafts, and keeps Discord unavailable until verified", async () => {
    render(<><textarea aria-label="Unfinished result" defaultValue="result draft" /><input aria-label="Replay draft" type="file" /><PrivateMatchAssistance roomId={ROOM} /></>); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    expect(screen.getByRole("button", { name: "Send private request" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Explain the issue"), { target: { value: "Please check this issue" } });
    fireEvent.click(screen.getByRole("button", { name: "Get help on Discord" }));
    expect(screen.queryByRole("link", { name: "Open Discord support" })).not.toBeInTheDocument();
    expect(screen.getByText(/has not yet been verified/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    expect(mocks.open).toHaveBeenCalledWith({ roomId: ROOM, body: "Please check this issue", clientMessageId: expect.any(String) });
    expect(screen.getByLabelText("Unfinished result")).toHaveValue("result draft");
    expect(screen.getByLabelText("Replay draft")).toBeInTheDocument();
    expect(screen.getByLabelText("Reply")).toHaveValue("");
  });

  it("reuses an unconfirmed request UUID and retains text from a simultaneous existing-thread result", async () => {
    mocks.open.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ ok: true, data: { request, message: null, accepted: false, acceptedClientMessageId: null, duplicate: false } });
    render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    fireEvent.change(screen.getByLabelText("Explain the issue"), { target: { value: "Keep this text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    expect(screen.getByLabelText("Explain the issue")).toHaveValue("Keep this text");
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    expect(mocks.open.mock.calls[0]).toEqual(mocks.open.mock.calls[1]);
    expect(screen.getByLabelText("Reply")).toHaveValue("Keep this text");
    expect(screen.getAllByText(/A conversation already exists/).length).toBeGreaterThan(0);
  });

  it("reconciles a lost successful create with its original UUID even after creation is disabled", async () => {
    mocks.open.mockRejectedValueOnce(new Error("accepted but response lost"));
    render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    fireEvent.change(screen.getByLabelText("Explain the issue"), { target: { value: "Initial message already stored" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    context = { ...context, request, newRequestsEnabled: false, canCreate: false };
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(mocks.open.mock.calls).toHaveLength(2);
    expect(mocks.open.mock.calls[0]).toEqual(mocks.open.mock.calls[1]);
    expect(screen.getByLabelText("Reply")).toHaveValue("");
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("does not convert an uncertain create body to a new reply until its UUID is reconciled", async () => {
    mocks.open.mockRejectedValueOnce(new Error("create response lost")).mockRejectedValueOnce(new Error("reconciliation unavailable"));
    render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    fireEvent.change(screen.getByLabelText("Explain the issue"), { target: { value: "Keep the original operation" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    context = { ...context, request, canCreate: false };
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Explain the issue")).toHaveValue("Keep the original operation");
    fireEvent.submit(screen.getByLabelText("Explain the issue").closest("form")!); await tick();
    expect(mocks.open.mock.calls).toHaveLength(3);
    expect(mocks.open.mock.calls[0]).toEqual(mocks.open.mock.calls[2]);
    expect(screen.getByLabelText("Reply")).toHaveValue("");
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("does not treat a mismatched accepted create UUID as permission to send a fresh reply", async () => {
    mocks.open.mockResolvedValueOnce({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: OTHER, duplicate: false } });
    render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    fireEvent.change(screen.getByLabelText("Explain the issue"), { target: { value: "Unconfirmed initial body" } });
    fireEvent.click(screen.getByRole("button", { name: "Send private request" })); await tick();
    expect(screen.getByLabelText("Explain the issue")).toHaveValue("Unconfirmed initial body");
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("keeps existing replies available when creation is off and clears private state on identity change", async () => {
    context = { ...context, newRequestsEnabled: false, canCreate: false, request };
    const view = render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    expect(screen.getByText("Private original")).toBeVisible();
    expect(screen.getByLabelText("Reply")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Send private request" })).not.toBeInTheDocument();
    mocks.auth = { ...mocks.auth, userId: "player-b", sessionId: "session-b" };
    mocks.context.mockImplementation(() => new Promise(() => {}));
    view.rerender(<PrivateMatchAssistance roomId={ROOM} />);
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
  });

  it("rejects a late response from the prior room without displaying its conversation", async () => {
    let complete!: (value: unknown) => void;
    mocks.context.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    context = { ...context, room: { ...context.room, roomId: OTHER } };
    view.rerender(<PrivateMatchAssistance roomId={OTHER} />); await tick();
    await act(async () => complete({ ok: true, data: { ...context, room: { ...context.room, roomId: ROOM }, request } }));
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
  });

  it("shows the server-confirmed Discord panel and copies only its server-derived reference", async () => {
    context = { ...context, discordUrl: "https://discord.com/channels/1440092095619662105/1440201093110960137", newRequestsEnabled: false, canCreate: false };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PrivateMatchAssistance roomId={ROOM} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Message IronClad admins" }));
    expect(screen.getByText(/New website assistance requests are temporarily unavailable/)).toBeVisible();
    expect(screen.queryByLabelText("Explain the issue")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get help on Discord" }));
    expect(screen.getByRole("link", { name: "Open Discord support" })).toHaveAttribute("href", context.discordUrl);
    expect(screen.getByText(/click the ticket-creation button/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" })); await tick();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(context.room.reference);
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe("private assistance conversation", () => {
  it("clears only a matching accepted reply and never overwrites newer typing", async () => {
    let finish!: (value: unknown) => void;
    mocks.reply.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<AssistanceConversation requestId={REQUEST} tournamentId={TOUR} />); await tick();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "First reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    const input = mocks.reply.mock.calls[0][0];
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Newer unsent reply" } });
    await act(async () => finish({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: input.clientMessageId, duplicate: false } }));
    expect(screen.getByLabelText("Reply")).toHaveValue("Newer unsent reply");
    mocks.reply.mockResolvedValueOnce({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: OTHER, duplicate: false } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    expect(screen.getByLabelText("Reply")).toHaveValue("Newer unsent reply");
  });

  it("retries the same reply idempotency key and keeps drafts after status conflicts", async () => {
    history = { ...history, canSetStatus: true };
    mocks.reply.mockRejectedValueOnce(new Error("unconfirmed"));
    mocks.status.mockResolvedValue({ ok: false, code: "conflict" });
    render(<AssistanceConversation requestId={REQUEST} tournamentId={TOUR} />); await tick();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Retry me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    expect(mocks.reply.mock.calls[0]).toEqual(mocks.reply.mock.calls[1]);
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Unfinished admin reply" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Assistance status" }), { target: { value: "resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Update status" })); await tick();
    expect(mocks.status).toHaveBeenCalledWith({ requestId: REQUEST, tournamentId: TOUR, expectedVersion: 1, status: "resolved" });
    expect(screen.getByLabelText("Reply")).toHaveValue("Unfinished admin reply");
    expect(screen.getByText(/Another admin updated/)).toBeVisible();
  });

  it("loads forward pages then refreshes loaded bodies to honor redaction", async () => {
    history = { ...history, hasMore: true };
    mocks.read.mockImplementation(async (input) => ({ ok: true, data: input.afterSequence === 0 ? history : { ...history, messages: [{ ...history.messages[0], id: ROOM, sequence: 2, body: "Second private message", redactedAt: null }], hasMore: false, nextAfterSequence: 2 } }));
    render(<AssistanceConversation requestId={REQUEST} tournamentId={TOUR} />); await tick();
    fireEvent.click(screen.getByRole("button", { name: "Load more messages" })); await tick();
    expect(mocks.read).toHaveBeenLastCalledWith({ requestId: REQUEST, tournamentId: TOUR, afterSequence: 1, limit: 50 });
    expect(screen.getByText("Second private message")).toBeVisible();
    history = { ...history, messages: [{ ...history.messages[0], body: null, redactedAt: request.updatedAt }] };
    fireEvent.click(screen.getByRole("button", { name: "Refresh assistance" })); await tick();
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
    expect(screen.getByText("This message is no longer available.")).toBeVisible();
    expect(screen.getByText("Second private message")).toBeVisible();
  });

  it("pauses hidden polling and removes private transcript on denied refresh", async () => {
    render(<AssistanceConversation requestId={REQUEST} tournamentId={TOUR} />); await tick();
    const calls = mocks.read.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(mocks.read).toHaveBeenCalledTimes(calls);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    mocks.read.mockResolvedValue({ ok: false, code: "forbidden" });
    fireEvent.focus(window); await tick();
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reply")).not.toBeInTheDocument();
  });
});

describe("scoped administrator assistance", () => {
  it("uses server status capability and clears private queue state when admin identity is lost", async () => {
    mocks.auth.sessionClaims.metadata.role = "admin";
    const view = render(<AdminPrivateAssistance data={queue} tournamentTitle="Tournament A" />); await tick();
    expect(screen.getByText("Private original")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assistance status" })).not.toBeInTheDocument();
    mocks.auth.sessionClaims.metadata.role = "player";
    view.rerender(<AdminPrivateAssistance data={queue} tournamentTitle="Tournament A" />);
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
  });

  it("scopes filters to the tournament and preserves a reply draft across queue refresh", async () => {
    mocks.auth.sessionClaims.metadata.role = "admin";
    render(<AdminPrivateAssistance data={queue} tournamentTitle="Tournament A" />); await tick();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Admin draft" } });
    const queueSection = screen.getByRole("region", { name: "Private assistance" });
    fireEvent.click(within(queueSection).getAllByRole("button", { name: "Refresh assistance" })[0]); await tick();
    expect(mocks.queue).toHaveBeenCalledWith({ tournamentId: TOUR, filter: "all", page: 1, selectedId: REQUEST });
    expect(screen.getByLabelText("Reply")).toHaveValue("Admin draft");
    queue = { ...queue, selectedRequest: null, filter: "resolved", filteredCount: 0, requests: [] };
    fireEvent.click(screen.getByRole("button", { name: "Resolved (0)" })); await tick();
    expect(mocks.queue).toHaveBeenLastCalledWith({ tournamentId: TOUR, filter: "resolved", page: 1, selectedId: null });
    expect(screen.queryByText("Private original")).not.toBeInTheDocument();
  });

  it("retains the reply operation UUID across selection changes and a late accepted response", async () => {
    mocks.auth.sessionClaims.metadata.role = "admin";
    const second = { ...request, id: OTHER, requesterName: "Player B" };
    queue = { ...queue, requests: [request, second], counts: { all: 2, open: 2, in_progress: 0, resolved: 0 }, filteredCount: 2 };
    mocks.queue.mockImplementation(async (input) => ({ ok: true, data: { ...queue, selectedRequest: input.selectedId === REQUEST ? request : second } }));
    mocks.read.mockImplementation(async (input) => ({ ok: true, data: { ...history, request: input.requestId === REQUEST ? request : second, messages: [] } }));
    let finish!: (value: unknown) => void;
    mocks.reply.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<AdminPrivateAssistance data={queue} tournamentTitle="Tournament A" />); await tick();
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Only one intended admin reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    const input = mocks.reply.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: /Player B.*Open conversation/ })); await tick();
    fireEvent.click(screen.getByRole("button", { name: /Player A.*Open conversation/ })); await tick();
    await act(async () => finish({ ok: true, data: { request, message: history.messages[0], accepted: true, acceptedClientMessageId: input.clientMessageId, duplicate: false } }));
    expect(screen.getByLabelText("Reply")).toHaveValue("Only one intended admin reply");
    fireEvent.click(screen.getByRole("button", { name: "Send reply" })); await tick();
    expect(mocks.reply.mock.calls[0]).toEqual(mocks.reply.mock.calls[1]);
    expect(screen.getByLabelText("Reply")).toHaveValue("");
  });
});
