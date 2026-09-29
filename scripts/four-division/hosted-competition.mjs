// Authorized synthetic Staging UAT through the real rendered app only.
// Service-role access below is read-only, scoped to the exact event and approved fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
assert(["create", "registration", "waitlist", "prepare", "launch", "results", "not-held"].includes(phase), "Unknown UI UAT phase");
const notHeldEvent = args.includes("--not-held-event");
assert(!notHeldEvent || ["create", "not-held"].includes(phase));
assert(phase !== "not-held" || notHeldEvent, "Not Held applies only to its separate zero-player synthetic event");
const selectedDivision = option("--division");
assert(!["prepare", "launch", "results"].includes(phase) || ["Main", "Pro"].includes(selectedDivision), "Competition phase requires one explicit future Division");
const origin = new URL(option("--url", "https://unconfigured.vercel.app")).origin;
assert.match(origin, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
const title = notHeldEvent ? "Four Division Pro Not Held Staging UAT 2026-09-29" : "Four Division Main + Pro Staging UAT 2026-09-29";
const slug = notHeldEvent ? "four-division-pro-not-held-staging-uat-2026-09-29" : "four-division-main-pro-staging-uat-2026-09-29";
const configuredDivisions = notHeldEvent ? ["Pro"] : ["Main", "Pro"];
const pools = { Main: FUTURE_FIXTURE_POOLS.main, Pro: FUTURE_FIXTURE_POOLS.pro };
assert(Object.values(pools).every((pool) => pool.length === 9), "Expected approved nine-player Main and Pro pools");
if (args.includes("--plan")) {
  console.log(JSON.stringify({ phase, title, slug, divisionModelVersion: "four_division_v1", configuredDivisions, fixtureCounts: notHeldEvent ? { Pro: 0 } : { Main: 9, Pro: 9 }, mutations: "Normal admin or participant UI only; explicit --apply required" }));
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
let currentPage;
let stage = "setup";
const actionResponses = [];

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
  assert.equal(brackets.length, configuredDivisions.length, "Configured synthetic Divisions differ from this exact scenario");
  for (const division of configuredDivisions) {
    const bracket = brackets.find((row) => row.name === division);
    assert(bracket && bracket.max_players === 8, "Two independently configured eight-player upper Divisions required");
  }
  return { ...event, brackets };
}
async function registrations(event) {
  return checked(await authentication.admin.from("registrations")
    .select("id,profile_id,tournament_bracket_id,registration_status,elo_verified_elo,elo_verified_division,elo_calculation_version,elo_checked_at,created_at,waitlist_offer_status,registration_provenance,fixture_contract_version")
    .eq("tournament_id", event.id).order("created_at").order("id"));
}
function waitlistPosition(row, rows) {
  return rows.filter((candidate) => candidate.tournament_bracket_id === row.tournament_bracket_id &&
    candidate.registration_status === "waitlisted" && candidate.waitlist_offer_status === null)
    .findIndex((candidate) => candidate.id === row.id) + 1;
}
async function pageFor(identity) {
  stage = "authorize-preview";
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  await previewAccess.authorize(context);
  await context.addCookies([{ name: "ironclad_locale", value: "en", url: origin, secure: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  currentPage = page;
  page.on("response", async (response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return;
    const body = await response.text().catch(() => "");
    const codes = [...body.matchAll(/"code":"([A-Z_]{3,45})"/g)].map((match) => match[1]);
    actionResponses.push({ status: response.status(), codes: [...new Set(codes)], success: body.includes('"success":true') });
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    const foreignNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame() && target.origin !== origin;
    const foreignDatabase = target.hostname.endsWith(".supabase.co") && target.hostname !== "zzbnneprhjicmajpjkdg.supabase.co";
    const foreignClerk = target.hostname.endsWith(".clerk.accounts.dev") && target.hostname !== "guided-goshawk-34.clerk.accounts.dev";
    if (foreignNavigation || foreignDatabase || foreignClerk) await route.abort("blockedbyclient");
    else await route.continue();
  });
  stage = "sign-in-development";
  await authentication.signIn(page, identity);
  return { page, context, identity };
}
async function capture(page, name) {
  const safe = await page.evaluate(() => !/(?:sk_(?:live|test)_|sb_secret_|service_role|storage\/v1\/object\/(?:sign|authenticated)\/match-proofs|user_[A-Za-z0-9]{20,})/.test(document.body.innerText));
  assert(safe, "Private data appeared in rendered UI; screenshot refused");
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: "disabled" });
}
async function settleDashboard(page) {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk?.session));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(350);
  const reveal = page.locator('[role="dialog"][aria-labelledby^="badge-reveal-"]');
  if (await reveal.isVisible()) {
    // This dismisses only the mounted overlay; it does not acknowledge an award.
    await reveal.getByRole("button", { name: "Not now", exact: true }).click();
    await reveal.waitFor({ state: "hidden" });
  }
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
  assert.equal(row.registration_provenance, "staging_synthetic_uat");
  assert.equal(row.fixture_contract_version, "staging-synthetic-v2");
  assert(row.elo_checked_at, "Frozen registration verification timestamp missing");
}

async function verifyLegalAcceptance(row) {
  const acceptance = checked(await authentication.admin.from("registration_acceptances")
    .select("rulebook_document_id,rulebook_version,rulebook_sha256,ppa_document_id,ppa_version,ppa_sha256,terms_document_id,terms_version,terms_sha256,privacy_document_id,privacy_version,privacy_sha256,accepted_at,own_ironclad_account_confirmed,linked_steam_account_confirmed")
    .eq("registration_id", row.id).single());
  const effective = checked(await authentication.admin.from("legal_documents")
    .select("id,document_kind,version,sha256").eq("status", "effective"));
  for (const kind of ["rulebook", "ppa", "terms", "privacy"]) {
    const authority = effective.find((document) => document.document_kind === kind);
    assert(authority && acceptance[`${kind}_document_id`] === authority.id, "Acceptance references the wrong governing document");
    assert.equal(acceptance[`${kind}_version`], authority.version);
    assert.equal(acceptance[`${kind}_sha256`], authority.sha256);
    if (["rulebook", "ppa"].includes(kind)) assert.equal(authority.version, "3.2");
  }
  assert(acceptance.accepted_at, "Versioned legal acceptance timestamp missing");
  assert.equal(acceptance.own_ironclad_account_confirmed, true);
  assert.equal(acceptance.linked_steam_account_confirmed, false, "Synthetic fixture must not create a real Steam ownership claim");
}

async function rejectWrongDivision(page, dialog, event, identity, division, submit) {
  const wrong = event.brackets.find((bracket) => bracket.name === (division === "Main" ? "Pro" : "Main"));
  let intercepted = false;
  const target = (url) => url.origin === origin && url.pathname === "/tournaments";
  const handler = async (route) => {
    const request = route.request();
    let payload;
    try { payload = request.postDataJSON(); } catch { /* Non-action navigation. */ }
    if (!intercepted && request.method() === "POST" && request.headers()["next-action"] &&
      Array.isArray(payload) && payload[0]?.tournamentId === event.id && payload[0]?.bracketId) {
      intercepted = true;
      const input = payload[0];
      record({ phase, division, registrationInput: {
        rulebookDocumentId: input.rulebookDocumentId, ppaDocumentId: input.ppaDocumentId,
        termsDocumentId: input.termsDocumentId, privacyDocumentId: input.privacyDocumentId,
        rulebookAgreement: input.rulebookAgreement, playerParticipationAgreement: input.playerParticipationAgreement,
        termsAgreement: input.termsAgreement, privacyAcknowledgement: input.privacyAcknowledgement,
        age18Confirmation: input.age18Confirmation, accountAndSteamOwnershipConfirmation: input.accountAndSteamOwnershipConfirmation,
        waitlistConfirmed: input.waitlistConfirmed,
      } });
      // Send an actual forged browser action to the real server, without changing
      // its identity, ELO evidence or agreements. No response is mocked.
      payload[0].bracketId = wrong.id;
      payload[0].bracketName = wrong.name;
      await route.continue({ postData: JSON.stringify(payload) });
    } else await route.fallback();
  };
  await page.route(target, handler);
  try {
    await submit.click();
    await dialog.getByRole("alert").filter({ hasText: "Your ELO Division has changed." }).waitFor({ timeout: 30_000 });
    assert(intercepted, "Wrong-Division negative request was not exercised");
    assert(!(await registrations(event)).some((row) => row.profile_id === identity.playerId), "Cross-Division request created a registration");
    record({ phase, division, wrongDivisionRejected: wrong.name, authority: "real authenticated browser action", persistedRegistrations: 0 });
  } finally { await page.unroute(target, handler); }
}

async function registrationAgreements(page, alias, verifySyntheticPresentation = false) {
  stage = "open-registration";
  await page.goto(`${origin}/tournaments?tournament=${slug}&register=1`, { waitUntil: "domcontentloaded" });
  const legalGate = page.locator("#account-legal-update-title");
  if (await legalGate.count()) {
    assert(/^(?:TestMain1[1-4]|TestPro[1-4])$/.test(alias), "Only the approved eight new fixtures may receive initial account legal acceptance here");
    stage = "accept-new-fixture-account-legal";
    const documents = checked(await authentication.admin.from("legal_documents")
      .select("id,document_kind,version").eq("status", "effective").in("document_kind", ["terms", "privacy"]));
    for (const [kind, version] of [["terms", "1.1"], ["privacy", "1.2"]]) {
      const document = documents.find((row) => row.document_kind === kind);
      assert(document && document.version === version, "Unexpected current account legal version");
      assert.equal(await page.locator(`input[name="${kind}DocumentId"]`).inputValue(), document.id);
    }
    await page.getByRole("link", { name: "Read Terms of Service v1.1", exact: true }).waitFor();
    await page.getByRole("link", { name: "Read Privacy Policy v1.2", exact: true }).waitFor();
    await page.locator('input[name="termsAccepted"]').check();
    await page.locator('input[name="privacyAcknowledged"]').check();
    await capture(page, `${alias}-account-legal-review`);
    await page.getByRole("button", { name: "Accept and continue", exact: true }).click();
    await legalGate.waitFor({ state: "hidden", timeout: 30_000 });
    record({ phase: "account-legal", alias, termsVersion: "1.1", privacyVersion: "1.2", normalInitialAcceptance: true });
  }
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("heading", { name: width < 768 ? "Player Readiness" : "Player Profile Confirmation", exact: true }).waitFor();
  if (verifySyntheticPresentation) {
    assert(width < 768, "This targeted disclosure check requires the phone wizard");
    await dialog.getByText("Synthetic test identity ready", { exact: true }).waitFor();
    await dialog.getByText("This approved Staging fixture uses a synthetic ELO and Division. The server checks fixture eligibility when you submit; it does not verify live Relic data or real Steam ownership.", { exact: true }).waitFor();
    assert(!/Steam connected|Relic verified|fresh Relic/i.test(await dialog.innerText()), "Synthetic readiness made a real-provider claim");
    await capture(page, "Pro-synthetic-readiness-disclosure");
  }
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  stage = "accept-registration-agreements";
  const agreements = dialog.locator("input[data-registration-field]");
  assert.equal(await agreements.count(), 6);
  if (verifySyntheticPresentation) {
    await dialog.getByText("I confirm that I control this synthetic Staging account. This test does not claim ownership of a real Steam account.", { exact: true }).waitFor();
    const documents = checked(await authentication.admin.from("legal_documents").select("document_kind,version,sha256").eq("status", "effective"));
    for (const [kind, field] of [["rulebook", "rulebookAgreement"], ["ppa", "playerParticipationAgreement"], ["terms", "termsAgreement"], ["privacy", "privacyAcknowledgement"]]) {
      const document = documents.find((row) => row.document_kind === kind);
      assert(document && document.version === ({ rulebook: "3.2", ppa: "3.2", terms: "1.1", privacy: "1.2" })[kind]);
      const anchor = dialog.locator(`label:has(input[data-registration-field="${field}"])`).getByRole("link");
      assert((await anchor.getAttribute("aria-label")).includes(document.version), "Wizard legal link version differs from current authority");
      const url = new URL(await anchor.getAttribute("href"), origin);
      assert.equal(url.origin, origin, "Reviewed bundled legal download must stay on this Preview");
      const response = await page.context().request.get(url.href);
      assert.equal(response.status(), 200);
      assert.equal(createHash("sha256").update(await response.body()).digest("hex"), document.sha256, "Wizard legal bytes differ from current governing authority");
    }
  }
  for (const agreement of await agreements.all()) await agreement.check();
  return dialog;
}

try {
  previewAccess = createPreviewAccess(origin);
  if (phase === "create") {
    const existing = await readEvent();
    if (existing) { await eventProof(); record({ phase, eventId: existing.id, created: false, existingVerified: true }); }
    else {
      const identity = await authentication.existingAdmin(option("--admin-user-id"), option("--admin-name"));
      const { page, context } = await pageFor(identity);
      stage = "open-admin-editor";
      await page.goto(`${origin}/admin/tournaments/new`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator('input[name="divisionModelVersion"]').inputValue(), "four_division_v1");
      stage = "fill-admin-editor";
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Description", { exact: true }).fill(notHeldEvent
        ? "Synthetic Staging UAT for an empty future Pro Division's Not Held closure. No played competition or production players."
        : "Permanent approved synthetic Staging UAT for independent Main and Pro competition. No production players or live Relic claims.");
      await page.locator('select[name="status"]').selectOption("registration_open");
      stage = "upload-tournament-banner";
      await page.getByLabel("Browse Images", { exact: true }).setInputFiles(path.resolve("public/images/tournaments/1v1-beta-blitz-tournament.png"));
      await page.waitForFunction(() => Boolean(document.querySelector('input[name="bannerImageUrl"]')?.value));
      for (const division of ["academy", "challenge", "main", "pro"]) {
        await page.locator(`input[name="${division}Enabled"]`).setChecked(configuredDivisions.some((name) => name.toLowerCase() === division));
      }
      await capture(page, "create-review");
      stage = "save-four-division-tournament";
      await page.getByRole("button", { name: "Create Tournament", exact: true }).click();
      await page.waitForURL(/\/admin\/tournaments\/[0-9a-f-]{36}/);
      const event = await eventProof();
      assert.equal(event.status, "registration_open");
      assert.equal(event.registration_enabled, true);
      await capture(page, "created");
      record({ phase, eventId: event.id, created: true, fourDivisionModelVerified: true, configuredDivisions, unrelatedLegacyCyclesPreserved: ["Academy", "Challenge"], capacityEach: 8 });
      await context.close();
    }
  } else {
    const event = await eventProof();
    assert(["registration_open", "in_progress", ...(phase === "not-held" ? ["completed"] : [])].includes(event.status), "UAT requires an active future event");
    if (["registration", "waitlist"].includes(phase)) assert.equal(event.registration_enabled, true);
    if (phase === "not-held") {
      const bracket = event.brackets[0];
      assert.equal(bracket.name, "Pro");
      assert.equal(bracket.launched_at, null);
      assert.equal((await registrations(event)).length, 0, "Not Held scenario must remain empty");
      const season = async () => checked(await authentication.admin.from("leaderboard_current_season").select("id,valid_qualifying_event_count").single());
      const before = await season();
      const closure = async () => checked(await authentication.admin.from("tournament_division_not_held_closures")
        .select("reason_code,closed_at,active_registration_count,waitlist_registration_count").eq("tournament_bracket_id", bracket.id).maybeSingle());
      if (!await closure()) {
        const participant = await pageFor(await authentication.fixture("TestMain6"));
        try {
          const dialog = await registrationAgreements(participant.page, "TestMain6", true);
          await capture(participant.page, "Pro-synthetic-legal-disclosure");
          await dialog.getByRole("button", { name: "Close registration", exact: true }).click();
          assert.equal((await registrations(event)).length, 0, "Read-only wizard review created a registration");
          record({ phase: "synthetic-wizard", division: "Pro", phoneReadinessTruthful: true, syntheticOwnershipDisclosure: true, currentLegalDownloadHashes: 4, submitted: false, zeroRegistrations: true });
        } finally { await participant.context.close(); }
      }
      const identity = await authentication.existingAdmin(option("--admin-user-id"), option("--admin-name"));
      const { page, context } = await pageFor(identity);
      stage = "close-empty-pro-not-held";
      await page.goto(`${origin}/admin/tournaments/${event.id}?section=bracket`, { waitUntil: "domcontentloaded" });
      if (!await closure()) {
        const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Confirm Not Held Closure", exact: true }) });
        await form.locator('textarea[name="detail"]').fill("SYNTHETIC STAGING UAT: empty future Pro Division closed through normal Admin UI to verify no official event slot or points.");
        await form.locator('input[name="confirmation"]').fill("NOT HELD");
        await capture(page, "Pro-not-held-review");
        await form.getByRole("button", { name: "Confirm Not Held Closure", exact: true }).click();
        await page.waitForURL(/bracketNotice=division-not-held/);
      }
      const receipt = await closure();
      assert(receipt?.closed_at && receipt.reason_code === "minimum_roster_not_reached");
      assert.equal(receipt.active_registration_count, 0);
      assert.equal(receipt.waitlist_registration_count, 0);
      assert.deepEqual(await season(), before, "Unplayed Not Held Pro consumed an official slot");
      const points = checked(await authentication.admin.from("leaderboard_point_events").select("id").eq("tournament_bracket_id", bracket.id));
      assert.equal(points.length, 0);
      const generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id));
      assert.equal(generated.length, 0, "Unplayed Not Held scenario generated a competitive bracket");
      await page.goto(`${origin}/tournaments?tournament=${slug}`, { waitUntil: "domcontentloaded" });
      await page.getByText("Not Held", { exact: true }).first().waitFor();
      await capture(page, "Pro-not-held-terminal");
      const final = await eventProof();
      // An unplayed closure preserves the event's raw status. The existing
      // lifecycle authority disables registration and derives Not Held in the UI.
      assert.equal(final.status, event.status);
      assert.equal(final.registration_enabled, false);
      record({ phase, eventId: event.id, reason: receipt.reason_code, zeroRegistrations: true, zeroGeneratedBrackets: true, zeroPoints: true, officialSlotEffect: 0, terminalStatus: "not_held", registrationDisabled: true, storedEventStatus: final.status, storedEventStatusPreserved: true });
      await context.close();
    } else if (phase === "registration") {
      for (const [division, aliases] of Object.entries(pools)) {
        const bracket = event.brackets.find((row) => row.name === division);
        assert.equal(bracket.launched_at, null, "UAT Division has already launched");
        for (const [index, alias] of aliases.entries()) {
          const identity = await authentication.fixture(alias);
          const existing = (await registrations(event)).find((row) => row.profile_id === identity.playerId);
          if (existing) {
            verifySnapshot(existing, alias, division, bracket);
            await verifyLegalAcceptance(existing);
            record({ phase, division, alias, resumedExisting: true, status: existing.registration_status });
            continue;
          }
          assert(identity.profileCompleted && identity.steamId64, "Approved fixture has not been prepared for normal registration");
          const { page, context } = await pageFor(identity);
          const dialog = await registrationAgreements(page, alias);
          const waitlisted = index === 8;
          await capture(page, `${alias}-agreements`);
          const submit = dialog.getByRole("button", { name: waitlisted ? "Join Waitlist" : width < 768 ? "Register" : "Submit Registration", exact: true });
          if (index === 0) {
            await rejectWrongDivision(page, dialog, event, identity, division, submit);
            await registrationAgreements(page, alias);
          }
          stage = "submit-normal-registration";
          await submit.click();
          await dialog.getByRole("heading", { name: waitlisted ? "Waitlist joined" : "Registration submitted", exact: true }).waitFor({ timeout: 30_000 });
          const row = await awaitRegistration(event, identity.playerId, waitlisted ? "waitlisted" : "pending");
          verifySnapshot(row, alias, division, bracket);
          await verifyLegalAcceptance(row);
          const position = waitlisted ? waitlistPosition(row, await registrations(event)) : null;
          if (waitlisted) assert.equal(position, 1);
          await capture(page, `${alias}-submitted`);
          record({ phase, division, alias, status: row.registration_status, snapshotVerified: true, currentLegalIdsAndHashes: true, rulebookVersion: "3.2", ppaVersion: "3.2", waitlistPosition: position });
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
          await settleDashboard(page);
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
          await settleDashboard(page);
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
        stage = "approve-selected-cohort";
        const pending = roster.filter((row) => row.registration_status !== "approved");
        if (pending.length) {
          await page.goto(`${origin}/admin/tournaments/${event.id}?section=registrations&filter=all`, { waitUntil: "domcontentloaded" });
          for (const row of pending) await page.locator(`input[type="checkbox"][name="registrationId"][value="${row.id}"]:visible`).check();
          await page.getByRole("button", { name: `Approve Selected (${pending.length})`, exact: true }).first().click();
          for (const row of pending) await awaitRegistration(event, row.profile_id, "approved");
        }
        stage = "publish-selected-map-pool";
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
        stage = "generate-private-structure";
        await page.goto(`${origin}/admin/tournaments/${event.id}?section=bracket`, { waitUntil: "domcontentloaded" });
        let generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id).maybeSingle());
        if (!generated) {
          await page.locator(`#workspace-generate-bracket-${bracket.id}`).getByRole("button", { name: "Generate Private Structure", exact: true }).click();
          await page.waitForURL(/notice=bracket-generated/);
          generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id).single());
        }
        await page.locator(`select:has(option[value="${bracket.id}"])`).selectOption(bracket.id);
        await page.getByRole("button", { name: "Edit Private Seeding", exact: true }).click();
        stage = "assign-private-seeding";
        const editor = page.getByRole("dialog", { name: `Private seeding for ${selectedDivision} Bracket`, exact: true });
        await editor.waitFor({ state: "visible" });
        await page.waitForFunction(() => {
          const panel = document.querySelector('[role="dialog"][aria-labelledby="bracket-workspace-title"]');
          return panel && Math.abs(panel.getBoundingClientRect().left) < 1;
        });
        const slots = editor.locator("select");
        await slots.first().waitFor({ state: "visible" });
        assert.equal(await slots.count(), 8);
        const panelBounds = await editor.boundingBox();
        assert(panelBounds && Math.abs(panelBounds.x) < 1 && panelBounds.width <= width + 1, "Private seeding panel clips outside the viewport");
        for (let index = 0; index < 8; index += 1) {
          assert.equal(await slots.nth(index).getAttribute("aria-label"), `Assign participant to slot ${index + 1}: Opening Match ${Math.ceil((index + 1) / 2)} - Player ${index % 2 === 0 ? "1" : "2"}`);
        }
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
        record({ phase, division: selectedDivision, approved: 8, mapsPublished: true, privateMatches: 7, uniquelySeeded: 8, namedSeedingControls: 8, mobilePanelWithinViewport: true, remainsUnlaunched: true });
      } else {
        await page.goto(`${origin}/admin/tournaments/${event.id}?section=bracket`, { waitUntil: "domcontentloaded" });
        await page.locator(`select:has(option[value="${bracket.id}"])`).selectOption(bracket.id);
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
  let pageDiagnostic;
  if (currentPage && !currentPage.isClosed()) {
    await capture(currentPage, "failure-state").catch(() => {});
    pageDiagnostic = await currentPage.evaluate(() => ({ path: location.pathname, h1Count: document.querySelectorAll("h1").length, legalGate: Boolean(document.querySelector("#account-legal-update-title")), editorModelPresent: Boolean(document.querySelector('input[name="divisionModelVersion"]')) })).catch(() => undefined);
  }
  record({ phase, stage, pageDiagnostic, actionResponses, passed: false, failure: error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Hosted UI operation failed; private details suppressed" });
  process.exitCode = 1;
} finally {
  try { await browser.close(); } catch { process.exitCode = 1; console.error("Browser cleanup failed; details suppressed"); }
  try { cleanup = await authentication.close(); } catch { process.exitCode = 1; console.error("Temporary session cleanup failed; details suppressed"); }
  try { if (previewAccess) previewAccess.revoke(); } catch { process.exitCode = 1; console.error("Temporary Preview grant revocation failed; details suppressed"); }
  writeFileSync(path.join(output, "summary.json"), JSON.stringify({ origin, title, slug, phase, cleanup, results }, null, 2));
  console.log(JSON.stringify(cleanup));
}
