// Authorized synthetic Staging UAT through the real rendered app only.
// Service-role access below is read-only, scoped to the exact event and approved fixtures.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createHostedAuth } from "./hosted-auth.mjs";
import { createPreviewAccess } from "./preview-access.mjs";
import { runHostedResults } from "./hosted-results.mjs";
import { createHostedRoomChecks } from "./hosted-room.mjs";
import { FUTURE_FIXTURE_POOLS, getFixtureDefinition } from "../lib/staging-synthetic-uat.mjs";

const args = process.argv.slice(2);
const option = (name, fallback = null) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const phase = option("--phase");
assert(["create", "registration", "waitlist", "prepare", "launch", "results"].includes(phase), "Unknown UI UAT phase");
const selectedDivision = option("--division");
assert(!["prepare", "launch", "results"].includes(phase) || ["Main", "Pro"].includes(selectedDivision), "Competition phase requires one explicit future Division");
const origin = new URL(option("--url", "https://unconfigured.vercel.app")).origin;
assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
const title = "Four Division Main + Pro Staging UAT 2026-09-29";
const slug = "four-division-main-pro-staging-uat-2026-09-29";
const pools = { Main: FUTURE_FIXTURE_POOLS.main, Pro: FUTURE_FIXTURE_POOLS.pro };
assert(Object.values(pools).every((pool) => pool.length === 9), "Expected approved nine-player Main and Pro pools");
if (args.includes("--plan")) {
  console.log(JSON.stringify({ phase, title, slug, divisionModelVersion: "four_division_v1", fixtureCounts: { Main: 9, Pro: 9 }, mutations: "Normal admin or participant UI only; explicit --apply required" }));
  process.exit(0);
}
assert(args.includes("--apply"), "Live UAT requires explicit --apply");
assert.equal(option("--staging-project"), "zzbnneprhjicmajpjkdg");
assert.notEqual(origin, "https://unconfigured.vercel.app");
assert(option("--environment-dir"));
const width = Number(option("--width", "390"));
assert([375, 390, 768, 1440].includes(width));
const output = path.resolve("test-results/four-division-hosted", option("--run", `competition-${phase}`));
assert(output.startsWith(path.resolve("test-results/four-division-hosted") + path.sep));
mkdirSync(output, { recursive: true });
const results = [];
const authentication = await createHostedAuth({ environmentDirectory: option("--environment-dir"), origin });
const browser = await chromium.launch({ headless: true });
let cleanup;
let previewAccess;

const checked = (result) => { assert(!result.error, "Scoped Staging read failed"); return result.data; };
async function readEvent() {
  return checked(await authentication.admin.from("tournaments")
    .select("id,title,slug,division_model_version,status,registration_enabled")
    .eq("slug", slug).maybeSingle());
}
async function eventProof() {
  const event = await readEvent();
  assert(event && event.title === title && event.division_model_version === "four_division_v1", "Exact future event proof failed");
  const brackets = checked(await authentication.admin.from("tournament_brackets").select("id,name,elo_rules,max_players,launched_at,map_pool_published_at")
    .eq("tournament_id", event.id));
  for (const division of ["Academy", "Challenge", "Main", "Pro"]) {
    const bracket = brackets.find((row) => row.name === division);
    assert(bracket && bracket.max_players === 8, "Four independently configured eight-player Divisions required");
  }
  return { ...event, brackets };
}
async function registrations(event) {
  return checked(await authentication.admin.from("registrations")
    .select("id,profile_id,tournament_bracket_id,registration_status,elo_verified_elo,elo_verified_division,elo_calculation_version,elo_checked_at,created_at,waitlist_offer_status")
    .eq("tournament_id", event.id).order("created_at").order("id"));
}
function waitlistPosition(row, rows) {
  return rows.filter((candidate) => candidate.tournament_bracket_id === row.tournament_bracket_id &&
    candidate.registration_status === "waitlisted" && candidate.waitlist_offer_status === null)
    .findIndex((candidate) => candidate.id === row.id) + 1;
}
async function pageFor(identity) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await previewAccess.authorize(context);
  await context.addCookies([{ name: "ironclad_locale", value: "en", url: origin, secure: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    const foreignNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame() && target.origin !== origin;
    const foreignDatabase = target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co";
    const foreignClerk = target.hostname.endsWith(".clerk.accounts.dev") && target.hostname !== "guided-goshawk-34.clerk.accounts.dev";
    if (foreignNavigation || foreignDatabase || foreignClerk) await route.abort("blockedbyclient");
    else await route.continue();
  });
  await authentication.signIn(page, identity);
  return { page, context, identity };
}
async function capture(page, name) {
  const safe = await page.evaluate(() => !/(?:sk_(?:live|test)_|sb_secret_|service_role|storage\/v1\/object\/(?:sign|authenticated)\/match-proofs|user_[A-Za-z0-9]{20,})/.test(document.body.innerText));
  assert(safe, "Private data appeared in rendered UI; screenshot refused");
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: "disabled" });
}
function record(value) {
  results.push(value);
  writeFileSync(path.join(output, "summary.json"), JSON.stringify({ origin, title, slug, phase, results }, null, 2));
  console.log(JSON.stringify(value));
}
async function awaitRegistration(event, playerId, status) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const row = (await registrations(event)).find((registration) => registration.profile_id === playerId);
    if (row?.registration_status === status) return row;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.fail("Expected normal UI registration state did not persist");
}
function verifySnapshot(row, alias, division, bracket) {
  assert.equal(row.tournament_bracket_id, bracket.id, "Wrong Division persisted");
  assert.equal(Number(row.elo_verified_elo), getFixtureDefinition(alias).syntheticElo, "Wrong verified fixture ELO");
  assert.equal(row.elo_verified_division, division);
  assert.equal(row.elo_calculation_version, "staging-synthetic-v2");
  assert(row.elo_checked_at, "Frozen registration verification timestamp missing");
}

try {
  previewAccess = createPreviewAccess(origin);
  if (phase === "create") {
    const existing = await readEvent();
    if (existing) { await eventProof(); record({ phase, created: false, existingVerified: true }); }
    else {
      const identity = await authentication.existingAdmin(option("--admin-user-id"), option("--admin-name"));
      const { page, context } = await pageFor(identity);
      await page.goto(`${origin}/admin/tournaments/new`, { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator('input[name="divisionModelVersion"]').inputValue(), "four_division_v1");
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Description", { exact: true }).fill("Permanent approved synthetic Staging UAT for independent Main and Pro competition. No production players or live Relic claims.");
      await page.getByLabel("Status", { exact: true }).selectOption("registration_open");
      await page.getByLabel("Browse Images", { exact: true }).setInputFiles(path.resolve("public/images/tournaments/1v1-beta-blitz-tournament.png"));
      await page.waitForFunction(() => Boolean(document.querySelector('input[name="bannerImageUrl"]')?.value));
      for (const division of ["academy", "challenge", "main", "pro"]) await page.locator(`input[name="${division}Enabled"]`).check();
      await capture(page, "create-review");
      await page.getByRole("button", { name: "Create Tournament", exact: true }).click();
      await page.waitForURL(/\/admin\/tournaments\/[0-9a-f-]{36}/);
      const event = await eventProof();
      assert.equal(event.status, "registration_open");
      assert.equal(event.registration_enabled, true);
      await capture(page, "created");
      record({ phase, created: true, fourDivisionsVerified: true, capacityEach: 8 });
      await context.close();
    }
  } else {
    const event = await eventProof();
    assert(["registration_open", "in_progress"].includes(event.status), "UAT requires an active future event");
    if (["registration", "waitlist"].includes(phase)) assert.equal(event.registration_enabled, true);
    if (phase === "registration") {
      for (const [division, aliases] of Object.entries(pools)) {
        const bracket = event.brackets.find((row) => row.name === division);
        assert.equal(bracket.launched_at, null, "UAT Division has already launched");
        for (const [index, alias] of aliases.entries()) {
          const identity = await authentication.fixture(alias);
          const existing = (await registrations(event)).find((row) => row.profile_id === identity.playerId);
          if (existing) {
            verifySnapshot(existing, alias, division, bracket);
            record({ phase, division, alias, resumedExisting: true, status: existing.registration_status });
            continue;
          }
          assert(identity.profileCompleted && identity.steamId64, "Approved fixture has not been prepared for normal registration");
          const { page, context } = await pageFor(identity);
          await page.goto(`${origin}/tournaments?tournament=${slug}&register=1`, { waitUntil: "domcontentloaded" });
          const dialog = page.getByRole("dialog");
          await dialog.getByRole("button", { name: "Continue", exact: true }).click();
          await dialog.getByRole("heading", { name: width < 768 ? "Player Readiness" : "Player Profile Confirmation", exact: true }).waitFor();
          await dialog.getByRole("button", { name: "Continue", exact: true }).click();
          const agreements = dialog.locator("input[data-registration-field]");
          assert.equal(await agreements.count(), 6);
          for (const agreement of await agreements.all()) await agreement.check();
          const waitlisted = index === 8;
          await capture(page, `${alias}-agreements`);
          await dialog.getByRole("button", { name: waitlisted ? "Join Waitlist" : width < 768 ? "Register" : "Submit Registration", exact: true }).click();
          await dialog.getByRole("heading", { name: waitlisted ? "Waitlist joined" : "Registration submitted", exact: true }).waitFor({ timeout: 30_000 });
          const row = await awaitRegistration(event, identity.playerId, waitlisted ? "waitlisted" : "pending");
          verifySnapshot(row, alias, division, bracket);
          const position = waitlisted ? waitlistPosition(row, await registrations(event)) : null;
          if (waitlisted) assert.equal(position, 1);
          await capture(page, `${alias}-submitted`);
          record({ phase, division, alias, status: row.registration_status, snapshotVerified: true, waitlistPosition: position });
          await context.close();
        }
      }
    } else if (phase === "waitlist") {
      for (const [division, aliases] of Object.entries(pools)) {
        const leaving = await authentication.fixture(aliases[0]);
        const queued = await authentication.fixture(aliases[8]);
        const before = await registrations(event);
        const departing = before.find((row) => row.profile_id === leaving.playerId);
        const waiting = before.find((row) => row.profile_id === queued.playerId);
        assert(departing && waiting, "Waitlist UAT requires the previously registered cohort");
        if (departing.registration_status !== "withdrawn") {
          assert.equal(departing.registration_status, "pending");
          assert.equal(waiting.registration_status, "waitlisted");
          assert.equal(waitlistPosition(waiting, before), 1);
          const { page, context } = await pageFor(leaving);
          await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          page.once("dialog", (dialog) => dialog.accept());
          await page.locator(`#registration-${departing.id}`).getByRole("button", { name: "Withdraw Registration", exact: true }).click();
          await awaitRegistration(event, leaving.playerId, "withdrawn");
          await capture(page, `${division}-withdrawn`);
          await context.close();
        }
        let after = (await registrations(event)).find((row) => row.id === waiting.id);
        if (after.waitlist_offer_status !== "accepted") {
          assert.equal(after.waitlist_offer_status, "offered", "FIFO head did not receive the vacancy offer");
          const { page, context } = await pageFor(queued);
          await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
          await capture(page, `${division}-offer`);
          await page.locator(`#registration-${waiting.id}`).getByRole("button", { name: "Accept Spot", exact: true }).click();
          after = await awaitRegistration(event, queued.playerId, "pending");
          assert.equal(after.waitlist_offer_status, "accepted");
          await capture(page, `${division}-accepted`);
          await context.close();
        }
        assert.equal(after.elo_checked_at, waiting.elo_checked_at, "Waitlist acceptance changed the frozen ELO snapshot");
        const current = await registrations(event);
        const bracket = event.brackets.find((row) => row.name === division);
        assert.equal(current.filter((row) => row.tournament_bracket_id === bracket.id && ["pending", "manual_review", "approved"].includes(row.registration_status)).length, 8);
        record({ phase, division, fifoVerified: true, acceptedPlayer: aliases[8], activeCohort: 8, frozenSnapshotPreserved: true });
      }
    } else if (phase === "results") {
      const room = selectedDivision === "Pro" && args.includes("--check-room")
        ? createHostedRoomChecks({ authentication, pageFor, capture, record, origin }) : null;
      await runHostedResults({ authentication, pageFor, capture, record, origin, event,
        division: selectedDivision, aliases: pools[selectedDivision],
        outsiderAlias: pools[selectedDivision === "Main" ? "Pro" : "Main"][0],
        completeDivision: args.includes("--complete-division"), checkDuplicates: args.includes("--check-replays"),
        roomBefore: room?.before, roomAfter: room?.after });
    } else {
      const bracket = event.brackets.find((row) => row.name === selectedDivision);
      assert.equal(bracket.launched_at, null, "Selected Division has already launched");
      const expected = await Promise.all(pools[selectedDivision].slice(1).map((alias) => authentication.fixture(alias)));
      const before = await registrations(event);
      const roster = before.filter((row) => row.tournament_bracket_id === bracket.id && ["pending", "manual_review", "approved"].includes(row.registration_status));
      assert.equal(roster.length, 8);
      assert(roster.every((row) => expected.some((identity) => identity.playerId === row.profile_id)), "Roster contains an unexpected participant");
      const identity = await authentication.existingAdmin(option("--admin-user-id"), option("--admin-name"));
      const { page, context } = await pageFor(identity);
      if (phase === "prepare") {
        const pending = roster.filter((row) => row.registration_status !== "approved");
        if (pending.length) {
          await page.goto(`${origin}/admin/tournaments/${event.id}?section=registrations&filter=all`, { waitUntil: "domcontentloaded" });
          for (const row of pending) await page.locator(`input[type="checkbox"][name="registrationId"][value="${row.id}"]:visible`).check();
          await page.getByRole("button", { name: `Approve Selected (${pending.length})`, exact: true }).first().click();
          for (const row of pending) await awaitRegistration(event, row.profile_id, "approved");
        }
        await page.goto(`${origin}/admin/tournaments/${event.id}?section=map-pool`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: new RegExp(`^${selectedDivision}\\s`) }).click();
        if (!bracket.map_pool_published_at) {
          const maps = page.locator('input[type="checkbox"]:enabled');
          assert(await maps.count() >= 5, "Five eligible catalogue maps required");
          for (const map of await maps.all()) if (await map.isChecked()) await map.uncheck();
          for (let index = 0; index < 5; index += 1) await maps.nth(index).check();
          await capture(page, `${selectedDivision}-map-review`);
          await page.getByRole("button", { name: "Publish This Division", exact: true }).click();
          await page.waitForURL(/notice=map-pool-published/);
        }
        const mapped = (await eventProof()).brackets.find((row) => row.id === bracket.id);
        assert(mapped.map_pool_published_at, "Normal map publication did not persist");
        await page.goto(`${origin}/admin/tournaments/${event.id}?section=bracket`, { waitUntil: "domcontentloaded" });
        let generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id).maybeSingle());
        if (!generated) {
          await page.locator(`#workspace-generate-bracket-${bracket.id}`).getByRole("button", { name: "Generate Private Structure", exact: true }).click();
          await page.waitForURL(/notice=bracket-generated/);
          generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id).single());
        }
        await page.getByLabel("Bracket", { exact: true }).selectOption(bracket.id);
        await page.getByRole("button", { name: "Edit Private Seeding", exact: true }).click();
        const editor = page.getByRole("dialog", { name: `Private seeding for ${selectedDivision}`, exact: true });
        const slots = editor.locator("select");
        assert.equal(await slots.count(), 8);
        for (let index = 0; index < 8; index += 1) await slots.nth(index).selectOption("");
        const seeding = selectedDivision === "Main" ? expected : [...expected].reverse();
        for (const [index, player] of seeding.entries()) {
          const registration = roster.find((row) => row.profile_id === player.playerId);
          await slots.nth(index).selectOption(registration.id);
        }
        await capture(page, `${selectedDivision}-private-seeding`);
        await editor.getByRole("button", { name: "Save Private Bracket Assignments", exact: true }).click();
        await page.waitForURL(/bracketNotice=population-saved/);
        assert.equal((await eventProof()).brackets.find((row) => row.id === bracket.id).launched_at, null, "Private preparation unexpectedly launched a Division");
        const matches = checked(await authentication.admin.from("tournament_matches").select("id,player_one_registration_id,player_two_registration_id").eq("generated_bracket_id", generated.id));
        assert.equal(matches.length, 7);
        const assigned = new Set(matches.flatMap((match) => [match.player_one_registration_id, match.player_two_registration_id]).filter(Boolean));
        assert.equal(assigned.size, 8);
        assert(roster.every((row) => assigned.has(row.id)));
        record({ phase, division: selectedDivision, approved: 8, mapsPublished: true, privateMatches: 7, uniquelySeeded: 8, remainsUnlaunched: true });
      } else {
        await page.goto(`${origin}/admin/tournaments/${event.id}?section=bracket`, { waitUntil: "domcontentloaded" });
        await page.getByLabel("Bracket", { exact: true }).selectOption(bracket.id);
        await capture(page, `${selectedDivision}-launch-review`);
        await page.getByRole("button", { name: "Launch Division", exact: true }).click();
        await page.waitForURL(/bracketNotice=division-launched/);
        const after = await eventProof();
        assert(after.brackets.find((row) => row.id === bracket.id).launched_at, "Selected Division did not launch");
        for (const other of event.brackets.filter((row) => row.id !== bracket.id)) {
          assert.equal(after.brackets.find((row) => row.id === other.id).launched_at, other.launched_at, "Another Division was changed by launch");
        }
        await capture(page, `${selectedDivision}-launched`);
        record({ phase, division: selectedDivision, launched: true, otherDivisionsPreserved: true });
      }
      await context.close();
    }
  }
} catch (error) {
  record({ phase, passed: false, failure: error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Hosted UI operation failed; private details suppressed" });
  process.exitCode = 1;
} finally {
  try { await browser.close(); } catch { process.exitCode = 1; console.error("Browser cleanup failed; details suppressed"); }
  try { cleanup = await authentication.close(); } catch { process.exitCode = 1; console.error("Temporary session cleanup failed; details suppressed"); }
  try { if (previewAccess) previewAccess.revoke(); } catch { process.exitCode = 1; console.error("Temporary Preview grant revocation failed; details suppressed"); }
  writeFileSync(path.join(output, "summary.json"), JSON.stringify({ origin, title, slug, phase, cleanup, results }, null, 2));
  console.log(JSON.stringify(cleanup));
}
