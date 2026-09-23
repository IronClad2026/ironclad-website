import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  closeViewers, createViewer, findOnePlayerFixture, fixture, getValidationPhase, gotoBracket,
  matchFacts, stagingRead, verifyCompetitionUnchanged, verifyLegalOrigins, verifyPairing, verifyPreviewReachability,
} from "./runtime";
import { loadTarget } from "./target";

test.afterEach(async () => { await closeViewers(); });

const room = (page: Page) => page.locator('section[aria-label="Match Room"]:visible').first();
const card = (page: Page, id = fixture.currentMatchId) => page.locator(`[data-match-room-card="${id}"]:visible`).first();
function communicationAuthorized() {
  if (process.env.P03_ALLOW_FIXTURE_COMMUNICATION !== loadTarget().candidateSha) {
    throw new Error("BLOCKED: exact-candidate fixture communication authorization is missing.");
  }
}
function hostedCase(id: string, check: (browser: Browser) => Promise<void>) {
  test(`[p03:${id}] hosted candidate verification`, async ({ browser }) => {
    let failed = false;
    let blocked = "";
    try {
      // Viewing a current room can itself resolve a room or acknowledge reads.
      await verifyPreviewReachability(browser);
      communicationAuthorized();
      await verifyLegalOrigins();
      await verifyPairing();
      await check(browser);
    } catch (error) {
      failed = true;
      if (error instanceof Error && error.message.startsWith("BLOCKED:")) blocked = error.message;
    } finally {
      try { await verifyCompetitionUnchanged(); } catch {
        failed = true;
        blocked = "BLOCKED: competition facts changed or could not be rechecked; STOP.";
      }
      // Close before reporting any failure: no DOM snapshots, credentials,
      // session cookies, message text or private proof links may reach artifacts.
      await closeViewers();
    }
    if (failed) throw new Error(blocked || `Hosted P03 ${id} verification failed at ${getValidationPhase()}. Inspect interactively without exporting private session data.`);
  });
}

async function currentViewer(browser: Browser, alias = fixture.firstAlias, width = 1280) {
  const page = await createViewer(browser, alias, width);
  await gotoBracket(page, fixture.currentMatchId);
  await expect(room(page).getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  return page;
}

async function sendForUnread(browser: Browser) {
  const sender = await currentViewer(browser);
  const recipient = await createViewer(browser, fixture.secondAlias);
  await gotoBracket(recipient);
  await expect(card(recipient)).toBeVisible();
  const body = `P03 isolated Preview validation ${randomUUID()}`;
  await room(sender).getByRole("textbox", { name: "Message", exact: true }).fill(body);
  await room(sender).getByRole("button", { name: "Send", exact: true }).click();
  await expect(room(sender).getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  await expect(card(recipient)).toHaveAttribute("data-match-room-unread", "opponent", { timeout: 30_000 });
  return { sender, recipient, body };
}

hostedCase("login", async (browser) => {
  const page = await createViewer(browser, fixture.firstAlias);
  await page.goto(`${loadTarget().previewUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByRole("main")).toBeVisible();
});

hostedCase("bracket", async (browser) => {
  const page = await createViewer(browser, fixture.firstAlias);
  await gotoBracket(page);
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText(fixture.firstAlias);
  await expect(card(page)).toContainText(fixture.secondAlias);
});

hostedCase("completed-match", async (browser) => {
  const before = await matchFacts(fixture.completedMatchId);
  expect(before.status).toBe("completed");
  const page = await createViewer(browser, fixture.firstAlias);
  await gotoBracket(page, fixture.completedMatchId, fixture.completedTournamentId);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  expect(await matchFacts(fixture.completedMatchId)).toEqual(before);
  expect(await stagingRead("match_rooms", `match_id=eq.${fixture.completedMatchId}&select=id&limit=10`)).toHaveLength(0);
});

hostedCase("current-match", async (browser) => {
  const facts = await verifyPairing();
  expect(facts.status).toBe("in_progress");
  expect(facts.player_one_registration_id).toBeTruthy();
  expect(facts.player_two_registration_id).toBeTruthy();
  const page = await currentViewer(browser);
  await expect(page.getByRole("dialog")).toBeVisible();
});

hostedCase("one-player-tbd", async (browser) => {
  const matchId = await findOnePlayerFixture();
  const page = await createViewer(browser, fixture.firstAlias);
  await gotoBracket(page);
  await expect(card(page, matchId)).toBeVisible();
  await expect(card(page, matchId)).toContainText(/TBD|to be determined/i);
  expect(await stagingRead("match_rooms", `match_id=eq.${matchId}&select=id&limit=10`)).toHaveLength(0);
});

hostedCase("match-room", async (browser) => {
  const page = await currentViewer(browser);
  await expect(room(page).getByRole("log")).toBeVisible();
  await expect(room(page).getByText(/visible to its two participants/)).toBeVisible();
});

hostedCase("unread-card", async (browser) => {
  const { recipient } = await sendForUnread(browser);
  await expect(card(recipient)).toHaveClass(/outline-amber/);
  await expect(card(recipient).locator("[data-match-room-action]")).toContainText(/opponent/i);
});

hostedCase("send-read", async (browser) => {
  const { recipient, body } = await sendForUnread(browser);
  await card(recipient).locator("[data-match-room-action]").click();
  await expect(room(recipient).getByText(body, { exact: true })).toBeVisible();
  await room(recipient).locator("[data-match-room-tail]").scrollIntoViewIfNeeded();
  await recipient.getByRole("button", { name: "Close Match result workspace", exact: true }).last().click();
  await expect(card(recipient)).not.toHaveAttribute("data-match-room-unread", /.+/, { timeout: 30_000 });
});

hostedCase("notification", async (browser) => {
  const { recipient, body } = await sendForUnread(browser);
  await recipient.goto(`${loadTarget().previewUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  // Player notifications navigate through a button to the resolved room.
  const notification = recipient.getByRole("button", { name: /New Match Room message/ }).first();
  await expect(notification).toBeVisible();
  await notification.click();
  await expect(recipient).toHaveURL((url) => url.searchParams.get("match") === fixture.currentMatchId && Boolean(url.searchParams.get("room")));
  await expect(room(recipient).getByText(body, { exact: true })).toBeVisible();
});

hostedCase("assistance", async (browser) => {
  // Verify admin access before creating an assistance request that needs cleanup.
  const admin = await createViewer(browser, "admin");
  const participant = await currentViewer(browser);
  const existing = await stagingRead("match_rooms", `match_id=eq.${fixture.currentMatchId}&closed_at=is.null&select=id&limit=2`);
  expect(existing).toHaveLength(1);
  const state = await stagingRead("match_room_assistance", `room_id=eq.${existing[0].id}&select=status&limit=1`);
  if (state[0]?.status === "requested") throw new Error("BLOCKED: an existing fixture assistance request must be preserved.");
  await room(participant).getByRole("button", { name: /^(Request Admin Assistance|Request assistance again)$/ }).click();
  await expect(room(participant).getByText("Assistance requested", { exact: true })).toBeVisible();
  await gotoBracket(admin, fixture.currentMatchId);
  await room(admin).getByRole("button", { name: "Resolve assistance", exact: true }).click();
  await expect(room(admin).getByText("Assistance resolved", { exact: true })).toBeVisible();
  await room(admin).getByRole("button", { name: "Reopen assistance", exact: true }).click();
  await expect(room(admin).getByText("Assistance requested", { exact: true })).toBeVisible();
  await room(admin).getByRole("button", { name: "Resolve assistance", exact: true }).click();
  await expect(room(admin).getByText("Assistance resolved", { exact: true })).toBeVisible();
});

hostedCase("result-replay", async (browser) => {
  const facts = await verifyPairing();
  const page = await currentViewer(browser);
  const dialog = page.getByRole("dialog");
  if (!facts.deadline_at || Date.parse(String(facts.deadline_at)) <= Date.now()) {
    await expect(dialog.getByRole("button", { name: "Won", exact: true })).toHaveCount(0);
    throw new Error("BLOCKED: reserved fixture result deadline is expired; result/replay draft coverage requires an approved open-deadline fixture.");
  }
  if (facts.hold_started_at && !facts.hold_released_at) {
    throw new Error("BLOCKED: reserved fixture is on hold; result/replay draft coverage is unavailable.");
  }
  await dialog.getByRole("button", { name: "Won", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Score", exact: true }).selectOption("2-1");
  await expect(dialog.getByLabel("Game 1 replay", { exact: true })).toBeAttached();
  await dialog.getByLabel("Game 1 replay", { exact: true }).setInputFiles({
    name: "p03-preview-draft.rec", mimeType: "application/octet-stream", buffer: Buffer.from("P03 local draft only"),
  });
  await room(page).getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Score", exact: true })).toHaveValue("2-1");
  await expect(dialog.getByText("p03-preview-draft.rec", { exact: true })).toBeVisible();
  // Do not submit results, upload replays, confirm/dispute, roll dice or change deadlines.
});

hostedCase("admin-workspace", async (browser) => {
  const page = await createViewer(browser, "admin");
  await page.goto(`${loadTarget().previewUrl}/admin/tournaments/${fixture.tournamentId}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/admin/tournaments/${fixture.tournamentId}`));
  await expect(page.getByRole("main")).toBeVisible();
  await gotoBracket(page, fixture.currentMatchId);
  await expect(room(page).getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
});

for (const width of [375, 390]) {
  hostedCase(`mobile-${width}`, async (browser) => {
    const page = await currentViewer(browser, fixture.firstAlias, width);
    await room(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const send = room(page).getByRole("button", { name: "Send", exact: true });
    expect((await send.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(room(page).getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  });
}
