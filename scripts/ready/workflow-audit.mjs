import assert from "node:assert/strict";
import { openQuickAction } from "./menu-journey.mjs";

const ticketUrl = "https://discord.com/channels/1440092095619662105/1440201093110960137";
const inviteUrl = "https://discord.gg/ZQSQjBNRm3";

function eventPath(event, values = {}) {
  return "/tournaments?" + new URLSearchParams({ tournament: event.eventSlug, ...values }).toString();
}

/** Exercises real links through Ready. All non-read requests are gated by the caller's test context. */
export async function verifyReadyNativeDestinations({ page, origin, mobile, allowAssistanceRead, fixture, expect }) {
  assert.equal(origin, "https://ironclad-website-git-staging-ironclad-tournaments.vercel.app");
  const failures = [];
  const coverage = [];
  const mode = mobile ? "390px touch emulation" : "desktop Chrome";
  const selected = process.env.READY_WORKFLOW_CASES?.split(",").filter(Boolean);
  const panel = page.locator("[data-mascot-dialogue]:visible");
  const dock = page.locator("[data-ready-dock]:visible");
  const surface = page.locator("[data-mode][data-asset-status]");
  const historyMatch = eventPath(fixture.own, { tab: "brackets", match: fixture.own.matchId });
  const historicalRoom = eventPath(fixture.own, { tab: "brackets", match: fixture.own.matchId, room: fixture.ownRoomId });
  const select = (locator) => mobile ? locator.tap({ timeout: 20_000 }) : locator.click({ timeout: 20_000 });
  let requestMinute = Math.floor(Date.now() / 60_000);
  let requests = 0;
  // Ready allows ten requests per Clerk session each minute. Leave headroom
  // for the boundaries of a minute and avoid testing against throttled replies.
  async function reserveRequests(count) {
    let minute = Math.floor(Date.now() / 60_000);
    if (minute === requestMinute && requests + count > 9) {
      await new Promise((resolve) => setTimeout(resolve, (minute + 1) * 60_000 - Date.now() + 500));
      minute = Math.floor(Date.now() / 60_000);
    }
    if (minute !== requestMinute) {
      requestMinute = minute;
      requests = 0;
    }
    requests += count;
  }

  async function verify(label, work) {
    if (selected?.length && !selected.some((phrase) => label.toLowerCase().includes(phrase.toLowerCase()))) return;
    try {
      await work();
      coverage.push(label);
      console.log(JSON.stringify({ workflow: label, viewport: mode, verified: true }));
    } catch (error) {
      failures.push(label);
      // Redact fixture identifiers from assertion output.
      console.error(JSON.stringify({
        workflow: label, viewport: mode, verified: false,
        error: (error.message ?? "").split("\n").slice(0, 5).join(" ").replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/ig, "[fixture]"),
      }));
    }
  }

  async function ask(choices) {
    await expect(dock).toHaveCount(1, { timeout: 25_000 });
    if (new URL(page.url()).pathname === "/dashboard") {
      const badge = page.locator('[role="dialog"][aria-labelledby^="badge-reveal-"]');
      if (await badge.isVisible()) await select(badge.getByRole("button", { name: "Not now", exact: true }));
    }
    await expect(surface).toHaveAttribute("data-asset-status", "ready", { timeout: 70_000 });
    if (await surface.getAttribute("data-mode") === "dock") await select(dock);
    await expect(panel).toHaveCount(1);
    await openQuickAction(page, "Help", mobile);
    const startUrl = page.url();
    for (const name of choices.slice(0, -1)) await select(panel.getByRole("button", { name, exact: true }));
    await reserveRequests(1);
    await select(panel.getByRole("button", { name: choices.at(-1), exact: true }));
    await expect(panel).toHaveAttribute("data-ready-view", "reply", { timeout: 25_000 });
    const skip = panel.getByRole("button", { name: "Show full message", exact: true });
    if (await skip.isVisible()) await select(skip);
    await expect(page).toHaveURL(startUrl);
  }

  async function open(path, choices) {
    await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded" });
    await ask(choices);
  }

  async function follow(label, href) {
    const link = panel.getByRole("link", { name: label, exact: true });
    if (href) await expect(link).toHaveAttribute("href", href);
    const destination = new URL(await link.getAttribute("href"), origin);
    assert.equal(destination.origin, origin);
    await select(link);
    await expect(page).toHaveURL(destination.href, { timeout: 20_000 });
    return destination;
  }

  const matchWorkspace = () => page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /Match Workspace/i }) });
  const ownBrackets = eventPath(fixture.own, { tab: "brackets" });
  const matchMenu = ["My match"];
  const eventMenu = ["Tournaments & registration"];
  const governance = [...eventMenu, "Event rules, prizes & decisions"];

  await verify("Honest active-assignment guidance and deliberate archived-match selection", async () => {
    await open("/", [...matchMenu, "Open my match"]);
    const current = panel.getByRole("link", { name: "Open my match", exact: true });
    if (await current.isVisible()) {
      assert(new URL(await current.getAttribute("href"), origin).searchParams.has("match"));
    } else {
      await expect(panel).toContainText(/no active match|more than one match/i);
      if (/no active match/i.test(await panel.textContent())) {
        coverage.push("No active match state");
        console.log(JSON.stringify({ workflow: "No active match state", viewport: mode, verified: true }));
      }
    }
    await open(ownBrackets, [...matchMenu, "Open my match"]);
    await follow("Open my match", historyMatch);
    await expect(matchWorkspace()).toBeVisible({ timeout: 20_000 });
    await open(ownBrackets, [...matchMenu, "Find a past match"]);
    await follow("Open my match", historyMatch);
    await expect(matchWorkspace()).toBeVisible({ timeout: 20_000 });
  });

  await verify("Recorded opponent and historical deadline do not navigate automatically", async () => {
    await open(ownBrackets, [...matchMenu, "My opponent"]);
    await expect(panel).toContainText(/recorded opponent was/i);
    await expect(panel.getByRole("link", { name: "Open my match", exact: true })).toHaveAttribute("href", historyMatch);
    await open(ownBrackets, [...matchMenu, "Deadline & match status"]);
    await expect(panel).toContainText(/recorded deadline|no confirmed match deadline/i);
    await expect(panel.getByRole("link", { name: "Open my match", exact: true })).toHaveAttribute("href", historyMatch);
  });

  await verify("Past match opens the native read-only historical Match Room", async () => {
    await open(ownBrackets, [...matchMenu, "Open opponent chat"]);
    await follow("Open earlier Match Room", historicalRoom);
    const room = page.getByRole("region", { name: "Match Room", exact: true });
    await expect(room).toBeVisible({ timeout: 20_000 });
    await expect(room.getByText(/historical|read.only/i).first()).toBeVisible();
    await expect(room.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(matchWorkspace()).toHaveCount(0);
  });

  await verify("Bracket opens the selected event’s native Brackets tab", async () => {
    await open(eventPath(fixture.own), [...matchMenu, "View my bracket"]);
    await follow("Open my bracket", ownBrackets);
    await expect(page.getByRole("heading", { name: /Brackets/i }).first()).toBeVisible();
  });

  for (const name of ["Submit my result", "Upload replays"]) {
    await verify(`${name} opens the exact archived workspace and offers no write`, async () => {
      await open(ownBrackets, ["Results & replays", name]);
      await expect(panel).toContainText(/no longer active/i);
      await follow("Open my match", historyMatch);
      const workspace = matchWorkspace();
      await expect(workspace).toBeVisible({ timeout: 20_000 });
      await expect(workspace.getByRole("button", { name: /submit match result/i })).toHaveCount(0);
      await expect(workspace.locator('input[type="file"]')).toHaveCount(0);
    });
  }

  await verify("Existing in-site Admin Assistance opens the requester’s conversation", async () => {
    await open(ownBrackets, ["Contact an admin", "In-site Admin Assistance"]);
    const assist = panel.getByRole("link", { name: "Open your Admin Assistance conversation", exact: true });
    const href = await assist.getAttribute("href");
    allowAssistanceRead(href);
    await follow("Open your Admin Assistance conversation");
    await expect(page.getByRole("log")).toBeVisible({ timeout: 20_000 });
  });

  await verify("Copied match reference identifies the exact owned match", async () => {
    // Observe the Clipboard API call without altering the computer's clipboard.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (value) => { globalThis.readyCopiedReference = value; } },
      });
    });
    await open(ownBrackets, ["Contact an admin", "Copy my match reference"]);
    await select(panel.getByRole("button", { name: "Copy match reference", exact: true }));
    await expect(panel).toContainText(/copied/i);
    assert((await page.evaluate(() => globalThis.readyCopiedReference)).includes(fixture.own.matchId));
  });

  await verify("Discord support and server invitation expose separate user-selected destinations", async () => {
    await open("/", ["Contact an admin", "Open Discord ticket channel"]);
    const ticket = panel.getByRole("link", { name: "Open Discord ticket channel", exact: true });
    await expect(ticket).toHaveAttribute("href", ticketUrl);
    await expect(panel.getByRole("link", { name: "Join the IronClad Discord server", exact: true })).toHaveAttribute("href", inviteUrl);
    await expect(ticket).toHaveAttribute("target", "_blank");
  });

  await verify("Event scope opens details and the visible Rules panel", async () => {
    await open(eventPath(fixture.own), [...governance, "Open event rules"]);
    await follow("Open event rules", eventPath(fixture.own, { panel: "rules" }));
    await expect(page.getByRole("tab", { name: "Rules", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Rules", exact: true })).toBeVisible();
    await open(eventPath(fixture.own), [...eventMenu, "Find or join a tournament", "Browse tournaments"]);
    await follow("Open tournament", eventPath(fixture.own));
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });

  await verify("Several event candidates require a deliberate selection before navigation", async () => {
    await open("/", [...eventMenu, "Find or join a tournament", "Browse tournaments"]);
    await expect(panel).toContainText(/which event/i);
    const choice = panel.getByRole("button", { name: "Test 1", exact: true });
    await expect(choice).toBeVisible();
    await reserveRequests(1);
    await select(choice);
    const skip = panel.getByRole("button", { name: "Show full message", exact: true });
    if (await skip.isVisible()) await select(skip);
    await expect(page).toHaveURL(origin + "/");
    await follow("Open tournament", eventPath({ eventSlug: "test-1" }));
    await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  });

  await verify("Archived event registration shows closure and offers no register action", async () => {
    await open(eventPath(fixture.own), [...eventMenu, "Find or join a tournament", "Open registration"]);
    await expect(panel).toContainText(/isn’t taking registrations/i);
    await expect(panel.getByRole("link", { name: "Open registration", exact: true })).toHaveCount(0);
    await follow("Open tournament", eventPath(fixture.own));
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });

  await verify("Open-event registration opens the native form twice without submitting", async () => {
    const current = eventPath({ eventSlug: "test-1" });
    const choices = [...eventMenu, "Find or join a tournament", "Open registration"];
    await open(current, choices);
    for (let attempt = 0; attempt < 2; attempt++) {
      const register = panel.getByRole("link", { name: "Open registration", exact: true });
      await expect(register).toHaveAttribute("href", current + "&register=1");
      await select(register);
      const registration = page.getByRole("dialog").filter({ has: page.locator("[data-registration-action-footer]") });
      try {
        await expect(registration).toBeVisible({ timeout: 20_000 });
      } catch (error) {
        const dialogHeadings = await page.getByRole("dialog").getByRole("heading").allTextContents();
        const path = new URL(page.url());
        throw new Error(`Registration attempt ${attempt + 1}: ${dialogHeadings.join(" | ") || "no visible dialog"}; register parameter present: ${path.searchParams.has("register")}`, { cause: error });
      }
      await expect(page).toHaveURL(origin + current);
      await page.keyboard.press("Escape");
      await expect(registration).toHaveCount(0);
      if (attempt === 0) await ask(choices);
    }
  });

  await verify("Archived event registration status belongs to the fixture owner", async () => {
    await open(eventPath(fixture.own), [...eventMenu, "My registration & waitlist", "Check my registration status"]);
    await expect(panel).toContainText(/your registration for/i);
    await follow("Open dashboard", "/dashboard");
    await expect(page.locator("[data-dashboard-section=registrations]")).toBeVisible();
  });

  await verify("No registration state does not offer a private record", async () => {
    await open(eventPath({ eventSlug: "test-1" }), [...eventMenu, "My registration & waitlist", "Check my registration status"]);
    await expect(panel).toContainText(/couldn’t find a registration/i);
    await expect(panel.getByRole("link", { name: "Open dashboard", exact: true })).toHaveAttribute("href", "/dashboard");
  });

  await verify("No prize pool yields event details instead of a missing Prizes panel", async () => {
    await open(eventPath(fixture.own), [...governance, "View published event prize terms"]);
    await expect(panel).toContainText(/does not list a prize pool|couldn’t verify a listed prize pool/i);
    await follow("Open tournament", eventPath(fixture.own));
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });

  await verify("Published prize terms open the visible Prizes panel", async () => {
    const completed = { eventSlug: "test-2-2" };
    await open(eventPath(completed), [...governance, "View published event prize terms"]);
    await follow("Open event prize terms", eventPath(completed, { panel: "prizes" }));
    await expect(page.getByRole("tab", { name: "Prizes", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Prizes", exact: true })).toBeVisible();
  });

  await verify("Event decisions action opens the native Decisions tab", async () => {
    await open(eventPath(fixture.own), [...governance, "View published event decisions"]);
    await follow("Open event decisions", eventPath(fixture.own, { tab: "decisions" }));
    await expect(page.getByRole("navigation", { name: "Tournament navigation" })
      .getByRole("button", { name: /decisions/i })).toHaveAttribute("aria-pressed", "true");
  });

  await verify("Published final decision opens the exact visible decision card", async () => {
    const published = { eventSlug: "pr124-staging-poll-validation-20260908" };
    await open(eventPath(published), [...governance, "View published event decisions"]);
    await expect(panel).toContainText(/a final decision is published/i);
    const target = await follow("Open event decisions");
    assert.equal(target.searchParams.get("tournament"), published.eventSlug);
    assert.match(target.searchParams.get("poll") ?? "", /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
    await expect(page.getByRole("article").filter({ hasText: /Admin final decision|Authoritative decision/i }).first()).toBeVisible();
  });

  for (const [label, destination, href, native] of [
    ["Profile & Steam", "Open Profile & Steam", "/profile", (p) => p.getByRole("heading", { name: /profile/i }).first()],
    ["Notifications", "Open my notifications", "/dashboard#player-notifications", (p) => p.locator("#player-notifications")],
    ["My history & statistics", "Open my history", "/dashboard#dashboard-history", (p) => p.locator("#dashboard-history")],
    ["My history & statistics", "Open my statistics", "/dashboard#dashboard-statistics", (p) => p.locator("#dashboard-statistics")],
    ["Rankings & points", "Open rankings", "/rankings", (p) => p.getByRole("heading", { name: /rankings/i }).first()],
  ]) {
    await verify(destination + " reaches the labelled native destination", async () => {
      await open("/", ["My profile & progress", label]);
      await follow(destination, href);
      await expect(native(page)).toBeVisible();
    });
  }

  await verify("Manipulated match and support requests reveal no foreign records", async () => {
    await reserveRequests(4);
    const responses = await page.evaluate(async (context) => {
      const results = [];
      for (const id of ["my-match", "opponent-chat", "admin-assistance", "copy-match-reference"]) {
        const response = await fetch("/api/ready", {
          method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ kind: "action", id, context }),
        });
        results.push({ status: response.status, body: await response.json() });
      }
      return results;
    }, fixture.foreign);
    for (const { status, body } of responses) {
      assert.equal(status, 200);
      assert(!JSON.stringify(body).includes(fixture.foreign.matchId));
      assert(!body.actions?.some(({ href, copyText }) => copyText || href?.includes("/assistance/")));
    }
  });

  assert.deepEqual(failures, [], "Native destination audit failures");
  assert(coverage.length, "No named native destination checks ran");
  return coverage;
}
