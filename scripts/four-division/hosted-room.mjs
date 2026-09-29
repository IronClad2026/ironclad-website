// Pro participant browser messages with actual authenticated RPC / Realtime evidence.
// The fallback test closes only the isolated test context's Staging websocket.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const checked = (result) => { assert(!result.error, "Authenticated Match Room read failed"); return result.data; };
async function eventually(read, matches, message) {
  for (let index = 0; index < 60; index += 1) {
    const value = await read();
    if (matches(value)) return value;
    await pause(250);
  }
  assert.fail(message);
}
async function subscription(client, topic, signal) {
  const channel = client.channel(topic, { config: { private: true } });
  if (signal) channel.on("broadcast", { event: "invalidate" }, signal);
  const status = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve("TIMEOUT"), 12_000);
    channel.subscribe((value) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(value)) { clearTimeout(timeout); resolve(value); }
    });
  });
  return { channel, status };
}

export function createHostedRoomChecks({ authentication, pageFor, capture, record, origin }) {
  async function before({ match, matchUrl, reporter, responder, outsiderAlias }) {
    const reporterClient = authentication.clientForPage(reporter.page);
    const responderClient = authentication.clientForPage(responder.page);
    const resolved = checked(await reporterClient.rpc("resolve_match_room", { p_match_id: match.id }));
    assert(resolved.room?.writable, "Pro room is not writable for the actual participant");
    const room = resolved.room;
    assert.equal(room.matchId, match.id);
    const history = (client) => client.rpc("get_match_room_history", { p_room_id: room.id, p_after_sequence: 0, p_limit: 50 }).then(checked);
    const unread = () => responderClient.rpc("get_match_room_unread_summary", { p_match_ids: [match.id] }).then(checked);
    const initial = await history(responderClient);
    const staleBody = `SYNTHETIC STAGING UAT — wrong expected room rejection for ${match.id}.`;
    let staleIntercepted = false;
    const roomActionTarget = (url) => url.origin === origin && url.pathname === "/tournaments";
    const staleHandler = async (route) => {
      let payload;
      try { payload = route.request().postDataJSON(); } catch { /* Other navigation. */ }
      if (route.request().method() === "POST" && Array.isArray(payload) && payload[0]?.body === staleBody && payload[0]?.expectedRoomId === room.id) {
        staleIntercepted = true;
        payload[0].expectedRoomId = randomUUID();
        await route.continue({ postData: JSON.stringify(payload) });
      } else await route.fallback();
    };
    await reporter.page.route(roomActionTarget, staleHandler);
    try {
      await reporter.page.getByLabel("Message", { exact: true }).fill(staleBody);
      const responsePromise = reporter.page.waitForResponse((response) => {
        try { return response.request().method() === "POST" && response.request().postDataJSON()?.[0]?.body === staleBody; }
        catch { return false; }
      });
      await reporter.page.getByRole("button", { name: "Send", exact: true }).click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      assert((await response.text()).includes('"code":"forbidden"'), "Real message authority did not reject the unavailable expected room");
      assert(staleIntercepted && !(await history(reporterClient)).messages.some((message) => message.body === staleBody), "Wrong expected room message was persisted");
    } finally { await reporter.page.unroute(roomActionTarget, staleHandler); }
    await reporter.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
    const topic = `match-room:${room.id}:${room.communicationGeneration}`;
    let validSignals = 0;
    const joined = await subscription(responderClient, topic, ({ payload }) => {
      if (payload.roomId === room.id && payload.communicationGeneration === room.communicationGeneration) validSignals += 1;
    });
    assert.equal(joined.status, "SUBSCRIBED", "Participant private Realtime subscription failed");
    const staleGeneration = await subscription(responderClient, `match-room:${room.id}:${room.communicationGeneration + 1}`);
    assert.equal(staleGeneration.status, "CHANNEL_ERROR", "Participant joined a different communication generation");
    await responderClient.removeChannel(staleGeneration.channel);
    const outsider = await pageFor(await authentication.fixture(outsiderAlias));
    try {
      const outsiderClient = authentication.clientForPage(outsider.page);
      const deniedRead = await outsiderClient.rpc("get_match_room_history", { p_room_id: room.id, p_after_sequence: 0, p_limit: 50 });
      assert(deniedRead.error || !deniedRead.data?.room, "Unrelated fixture could read private Pro room history");
      const denied = await subscription(outsiderClient, topic);
      assert.equal(denied.status, "CHANNEL_ERROR", "Unrelated fixture joined private Pro room Realtime");
      await outsiderClient.removeChannel(denied.channel);
    } finally { await outsider.context.close(); }

    const messages = ["Unread and delivery", "Realtime refresh", "HTTP fallback"].map((purpose) => `SYNTHETIC STAGING UAT — ${purpose}. Pro match ${match.id}.`);
    const send = async (body) => {
      await reporter.page.bringToFront();
      await reporter.page.getByLabel("Message", { exact: true }).fill(body);
      await reporter.page.getByRole("button", { name: "Send", exact: true }).click();
      await reporter.page.getByRole("log", { name: "Match Room", exact: true }).getByText(body, { exact: true }).waitFor({ timeout: 30_000 });
    };
    await send(messages[0]);
    const first = await eventually(() => history(responderClient), (value) => value.messages.some((message) => message.body === messages[0]), "Normal UI room message was not persisted");
    assert.equal(first.room.lastReadSequence, initial.room.lastReadSequence, "Read-only SDK history advanced the read cursor");
    assert((await unread()).items.some((item) => item.matchId === match.id && item.unreadSource === "opponent"), "Opponent unread summary missing");
    await responder.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
    await responder.page.bringToFront();
    await responder.page.getByRole("log", { name: "Match Room", exact: true }).getByText(messages[0], { exact: true }).waitFor();
    await eventually(unread, (value) => !value.items.some((item) => item.matchId === match.id), "Visible browser catch-up did not acknowledge unread state");
    await capture(responder.page, "Pro-room-unread-cleared");

    const priorSignals = validSignals;
    await send(messages[1]);
    await responder.page.bringToFront();
    await responder.page.getByRole("log", { name: "Match Room", exact: true }).getByText(messages[1], { exact: true }).waitFor({ timeout: 20_000 });
    await eventually(async () => validSignals, (count) => count > priorSignals, "Server message did not deliver a private Realtime invalidation");
    await responderClient.removeChannel(joined.channel);

    // Real authenticated fallback reads continue while only this browser context's
    // websocket is intentionally unavailable; HTTP responses are never mocked.
    const fallback = await pageFor(await authentication.fixture(responder.identity.alias));
    try {
      await fallback.context.routeWebSocket((url) => url.hostname === "zzbnneprhjicmajpjkdg.supabase.co" && url.pathname.startsWith("/realtime/"), (socket) => socket.close());
      await fallback.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
      await fallback.page.getByRole("log", { name: "Match Room", exact: true }).waitFor();
      await send(messages[2]);
      await fallback.page.bringToFront();
      await fallback.page.getByRole("log", { name: "Match Room", exact: true }).getByText(messages[2], { exact: true }).waitFor({ timeout: 30_000 });
      await capture(fallback.page, "Pro-room-real-http-fallback");
    } finally { await fallback.context.close(); }
    record({ phase: "pro-room", normalUiMessages: 3, authenticatedHistory: true, wrongExpectedRoomSendRejected: true, outsiderReadDenied: true, privateRealtime: true, outsiderSubscriptionDenied: true, wrongGenerationSubscriptionDenied: true, unreadClearedByBrowser: true, realHttpFallback: true });
    return { roomId: room.id, messages, responderClient };
  }

  async function after({ match, matchUrl, responder, roomState }) {
    const result = checked(await roomState.responderClient.rpc("get_match_room_history", { p_room_id: roomState.roomId, p_after_sequence: 0, p_limit: 50 }));
    assert.equal(result.room.writable, false, "Completed Pro Match Room remained writable");
    assert(roomState.messages.every((body) => result.messages.some((message) => message.body === body)), "Completion lost existing Pro room messages");
    await responder.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
    await responder.page.getByRole("log", { name: "Match Room", exact: true }).waitFor();
    assert.equal(await responder.page.getByLabel("Message", { exact: true }).count(), 0, "Completed room still exposes a message composer");
    await capture(responder.page, "Pro-room-completed-read-only");
    record({ phase: "pro-room", completed: true, readOnly: true, messagesRetained: roomState.messages.length, sameMatch: result.room.matchId === match.id, sameOrigin: new URL(responder.page.url()).origin === origin });
  }
  return { before, after };
}
