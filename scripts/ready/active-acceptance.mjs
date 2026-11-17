import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { openQuickAction } from "./menu-journey.mjs";

const runTags = new Set(["ready-active-20261116-v1", "ready-active-20261117-audit"]);
const projectRef = "zzbnneprhjicmajpjkdg";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const ticketUrl = "https://discord.com/channels/1440092095619662105/1440201093110960137";
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export async function readActiveFixtures(path, verify) {
  const manifest = JSON.parse(await readFile(resolve(path), "utf8"));
  verify(runTags.has(manifest?.runTag) && manifest.projectRef === projectRef &&
    manifest.committed === true && manifest.tournaments?.length === 2, "exact committed Ready fixture manifest");
  const [a, b] = manifest.tournaments;
  for (const [fixture, label, opponent] of [[a, "A", "TestAcademy2"], [b, "B", "TestAcademy3"]]) {
    verify(fixture?.label === label && fixture.tag === `${manifest.runTag}-${label.toLowerCase()}` &&
      [fixture.tournamentId, fixture.bracketId, fixture.matchId, fixture.roomId].every((id) => typeof id === "string" && uuid.test(id)) &&
      fixture.requesterAlias === "TestAcademy1" && fixture.opponentAlias === opponent &&
      Date.parse(fixture.deadline) > Date.now(), `validated temporary fixture ${label}`);
  }
  verify(a.tournamentId !== b.tournamentId && a.matchId !== b.matchId && a.roomId !== b.roomId, "distinct synthetic match scopes");
  return { a, b };
}

function data(result, label, verify) {
  verify(!result.error && result.data != null, label);
  return result.data;
}

function contextFor(fixture) {
  return { eventSlug: fixture.tag, matchId: fixture.matchId };
}

function isFixtureDestination(href, fixture, origin) {
  if (typeof href !== "string" || !href.startsWith("/tournaments?")) return false;
  const destination = new URL(href, origin);
  return destination.origin === origin && destination.pathname === "/tournaments" &&
    destination.searchParams.get("tournament") === fixture.tag &&
    destination.searchParams.get("tab") === "brackets" && destination.searchParams.get("match") === fixture.matchId;
}

// Next's read actions POST. Only the native resolve, empty history and assistance
// context parameter shapes for the exact isolated room are let through.
export function isActiveFixtureRead(request, fixture, origin) {
  if (request.method() !== "POST" || !/^[a-f0-9]{36,64}$/i.test(request.headers()["next-action"] ?? "") ||
    !isFixtureDestination(request.url().slice(origin.length), fixture, origin) || new URL(request.url()).origin !== origin) return false;
  try {
    const args = request.postDataJSON();
    if (!Array.isArray(args) || args.length !== 1 || !args[0] || typeof args[0] !== "object") return false;
    const input = args[0];
    const keys = Object.keys(input).sort().join(",");
    return (keys === "matchId" && input.matchId === fixture.matchId) ||
      (keys === "roomId" && input.roomId === fixture.roomId) ||
      (keys === "afterSequence,limit,roomId" && input.roomId === fixture.roomId && input.afterSequence === 0 && input.limit === 50);
  } catch {
    return false;
  }
}

function roomHistory(client, fixture) {
  return client.rpc("get_match_room_history", { p_room_id: fixture.roomId, p_after_sequence: 0, p_limit: 1 });
}

async function assistanceContext(admin, actor, fixture) {
  // loadActor validates the issuer, fixture identity and nonstaff role before supplying this token.
  const token = await actor();
  const identity = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  return admin.rpc("call_patch2_private_assistance", {
    p_operation: "get_private_assistance_context", p_arguments: { p_room_id: fixture.roomId },
    p_actor_clerk_user_id: identity.sub, p_actor_is_admin: false,
  });
}

async function verifyNoWrites(admin, participant, fixtures, verify) {
  const tournamentIds = fixtures.map(({ tournamentId }) => tournamentId);
  const [histories, assistanceRows, notices] = await Promise.all([
    Promise.all(fixtures.map((fixture) => roomHistory(participant, fixture))),
    admin.from("assistance_requests").select("id", { count: "exact", head: true }).in("tournament_id", tournamentIds),
    admin.from("notifications").select("id", { count: "exact", head: true }).in("tournament_id", tournamentIds)
      .or("push_delivery_status.in.(pending,retryable_failure,processing),email_delivery_status.in.(pending,retryable_failure,processing)"),
  ]);
  verify(histories.every(({ data, error }, index) => !error && data?.room?.id === fixtures[index].roomId &&
    data.room.lastSequence === 0 && data.room.writable && data.messages.length === 0),
  "both owner-scoped match transcripts remain empty and writable");
  verify(!assistanceRows.error && assistanceRows.count === 0 && !notices.error && notices.count === 0,
    "no created assistance requests and no deliverable fixture notices");
}

export async function verifyActiveApi({ fixtures, admin, environment, actors, origin, answer, verify }) {
  const { a, b } = fixtures;
  const events = data(await admin.from("tournaments").select("id,slug,status,terminal_at")
    .in("id", [a.tournamentId, b.tournamentId]), "active fixtures exist in Staging", verify);
  verify(events.length === 2 && [a, b].every((fixture) => events.some((event) => event.id === fixture.tournamentId &&
    event.slug === fixture.tag && event.status === "in_progress" && event.terminal_at === null)),
  "exact synthetic events are active");

  const regs = data(await admin.from("registrations").select("tournament_id,registration_provenance,fixture_contract_version")
    .in("tournament_id", [a.tournamentId, b.tournamentId]), "read the committed synthetic rosters", verify);
  verify(regs.length === 16 && regs.every((row) => row.registration_provenance === "staging_synthetic_uat" &&
    row.fixture_contract_version === "staging-synthetic-v2"), "all fixture registrants use the synthetic contract");
  const matches = data(await admin.from("tournament_matches").select("id,status,deadline_at,activation_version")
    .in("id", [a.matchId, b.matchId]), "read the canonical synthetic match deadlines", verify);
  verify(matches.length === 2 && [a, b].every((fixture) => matches.some((match) => match.id === fixture.matchId &&
    match.status === "in_progress" && match.activation_version > 0 && Date.parse(match.deadline_at) === Date.parse(fixture.deadline))),
  "fixture deadline originates from the live active match");
  const publicKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  verify(typeof publicKey === "string" && publicKey.length > 20, "Staging publishable RPC key available");
  if (publicKey.split(".").length === 3) {
    verify(JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url")).ref === projectRef, "Staging public key project binding");
  }
  const playerClient = (accessToken) => createClient(supabaseUrl, publicKey,
    { accessToken, auth: { persistSession: false, autoRefreshToken: false } });
  const [a1, a2, a3] = actors;
  const owner = playerClient(a1);
  await verifyNoWrites(admin, owner, [a, b], verify);
  for (const [actor, opponent, label] of [[a1, "TestAcademy2", "participant 1"], [a2, "TestAcademy1", "participant 2"]]) {
    const opponentReply = await answer(actor, `${label} current opponent`, { kind: "action", id: "opponent", context: contextFor(a) });
    const deadlineReply = await answer(actor, `${label} current deadline`, { kind: "action", id: "deadline", context: contextFor(a) });
    const deadline = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
      .format(new Date(a.deadline));
    verify(opponentReply.text.startsWith(`Your opponent is ${opponent}.`) &&
      opponentReply.actions?.some(({ href }) => isFixtureDestination(href, a, origin)) &&
      deadlineReply.text.startsWith(`The current deadline is ${deadline} UTC.`), `${label} sees the correct opponent and deadline`);
    const client = playerClient(actor);
    const history = data(await roomHistory(client, a), `${label} signed-in room query`, verify);
    const assistance = await client.rpc("get_private_assistance_context", { p_room_id: a.roomId });
    verify(history.room.id === a.roomId && history.room.matchId === a.matchId && history.room.writable === true &&
      history.room.lastSequence === 0 && history.messages.length === 0, `${label} has permission in the exact empty active room`);
    verify(assistance.error?.code === "42501", `${label} must use the existing server-mediated Admin Assistance path`);
    const serverContext = data(await assistanceContext(admin, actor, a), `${label} authorized support context through the app's SQL boundary`, verify);
    verify(serverContext.room.roomId === a.roomId && serverContext.room.matchId === a.matchId &&
      serverContext.canCreate && serverContext.request === null, `${label} can reach in-site assistance without creating a request`);
  }
  const outsider = playerClient(a3);
  const [history, assistance] = await Promise.all([
    roomHistory(outsider, a),
    outsider.rpc("get_private_assistance_context", { p_room_id: a.roomId }),
  ]);
  verify(history.error?.code === "42501" && assistance.error?.code === "42501",
    "signed-in player at a different seat is denied the room and its support context");
  verify((await assistanceContext(admin, a3, a)).error?.code === "42501",
    "server-mediated support lookup also denies the wrong seat");
  const unrelated = await answer(a3, "ordinary player requests an unowned match", { kind: "action", id: "opponent", context: contextFor(a) });
  verify(!unrelated.context?.matchId && !unrelated.actions?.some(({ href }) => isFixtureDestination(href, a, origin)),
    "ordinary player can use Ready but cannot access another match");
  const forged = await answer(a2, "reviewer claims another active match", { kind: "action", id: "opponent", context: contextFor(b) });
  verify(/couldn.t find that match under your current account/.test(forged.text) && !forged.context?.matchId &&
    !forged.actions?.some(({ href }) => isFixtureDestination(href, b, origin)), "reviewer at a different seat receives no opponent, deadline or link");

  const multiple = await answer(a1, "multiple active matches", { kind: "action", id: "my-match" });
  verify(/more than one match/.test(multiple.text) && !multiple.actions?.some(({ href }) => href?.includes("&match=")) &&
    [a, b].every((fixture) => multiple.actions?.some(({ context }) => context?.matchId === fixture.matchId && context.eventSlug === fixture.tag)),
  "multiple active matches require selection rather than guessing");
  const chosen = await answer(a1, "selected active assignment", { kind: "action", id: "my-match", context: contextFor(a) });
  verify(chosen.actions?.some(({ href }) => isFixtureDestination(href, a, origin)), "choosing A opens only the selected active match");
  const chat = await answer(a1, "authorized active opponent chat", { kind: "action", id: "opponent-chat", context: contextFor(a) });
  verify(chat.actions?.some(({ label, href }) => label === "Open opponent chat" && isFixtureDestination(href, a, origin)),
    "Ready offers the existing active opponent chat");
  const help = await answer(a1, "authorized active administrative help", { kind: "action", id: "admin-assistance", context: contextFor(a) });
  verify(help.actions?.some(({ href }) => href === ticketUrl), "verified Discord ticket destination is offered");
  verify(help.actions?.some(({ label, href }) => label === "Open Match Room for Admin Assistance" && isFixtureDestination(href, a, origin)),
    "active in-site support links to the exact owned Match Room");
  verify(help.actions?.some(({ copyText }) => copyText?.includes(a.matchId)), "support offers the exact owned match reference to copy");
  return () => verifyNoWrites(admin, owner, [a, b], verify);
}

export async function browserActiveMatch({ page, expect, origin, fixture, mobile, verify }) {
  const eventUrl = new URL("/tournaments", origin);
  eventUrl.searchParams.set("tournament", fixture.tag);
  eventUrl.searchParams.set("tab", "brackets");
  await page.goto(eventUrl.href, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-mode='floating']")).toHaveCount(1, { timeout: 15_000 });
  await openQuickAction(page, "Help", mobile);
  const choose = (name) => {
    const button = page.getByRole("button", { name, exact: true });
    return mobile ? button.tap() : button.click();
  };
  const message = page.locator("[data-mascot-message]");
  if (!mobile) {
    await choose("Contact an admin");
    await choose("In-site Admin Assistance");
    await expect(message).toContainText("Discord support channel", { timeout: 15_000 });
    const showFull = page.getByRole("button", { name: "Show full message" });
    if (await showFull.isVisible()) await showFull.click();
    const discord = page.getByRole("link", { name: "Open Discord ticket channel" });
    await expect(discord).toHaveAttribute("href", ticketUrl);
  } else {
    await choose("My match");
    await choose("Open opponent chat");
    await expect(message).toContainText("Open the Match Room", { timeout: 15_000 });
    const showFull = page.getByRole("button", { name: "Show full message" });
    if (await showFull.isVisible()) await showFull.tap();
  }
  const link = page.getByRole("link", { name: mobile ? "Open opponent chat" : "Open Match Room for Admin Assistance", exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  verify(isFixtureDestination(href, fixture, origin), "visible Ready action points to the exact active match");
  if (mobile) await link.tap();
  else await link.click();
  await expect(page).toHaveURL(new URL(href, origin).href, { timeout: 15_000 });
  verify(true, "active match link navigates to the exact owned matchup");
  const room = page.getByRole("region", { name: "Match Room", exact: true });
  await expect(room).toBeVisible({ timeout: 15_000 });
  verify(true, "native Match Room section opens");
  await expect(room.getByRole("textbox", { name: "Message" })).toBeEditable({ timeout: 15_000 });
  verify(true, "native Match Room composer is available and untouched");
  await room.getByRole("textbox", { name: "Message" }).scrollIntoViewIfNeeded();
  verify(true, mobile ? "touch emulation opens active writable opponent chat" : "desktop Ready assistance link opens the correct active writable room");

  const category = mobile ? "Upload replays" : "Submit my result";
  const label = mobile ? "Open replay workspace" : "Open result workspace";
  await page.goto(eventUrl.href, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-mode='floating']")).toHaveCount(1, { timeout: 15_000 });
  await openQuickAction(page, "Help", mobile);
  await choose("Results & replays");
  await choose(category);
  await expect(message).toContainText(mobile ? "replay upload fields" : "use its result form", { timeout: 15_000 });
  const skip = page.getByRole("button", { name: "Show full message" });
  if (await skip.isVisible()) {
    if (mobile) await skip.tap();
    else await skip.click();
  }
  const result = page.getByRole("link", { name: label, exact: true });
  const resultHref = await result.getAttribute("href");
  verify(isFixtureDestination(resultHref, fixture, origin), "result or replay link targets the same isolated match");
  if (mobile) await result.tap();
  else await result.click();
  await expect(page).toHaveURL(new URL(resultHref, origin).href, { timeout: 15_000 });
  const workspace = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /Match Workspace/i }) });
  const outcome = workspace.getByRole("button", { name: /^(I )?won$/i }).first();
  await expect(outcome).toBeEnabled();
  if (mobile) await outcome.tap();
  else await outcome.click();
  await workspace.getByRole("combobox", { name: "Score", exact: true }).selectOption({ index: 1 });
  await expect(workspace.locator('input[type="file"][accept=".rec"]').first()).toBeVisible();
  verify(true, `${mobile ? "touch replay" : "desktop result"} link opens the native score and replay fields without upload or submit`);
}
