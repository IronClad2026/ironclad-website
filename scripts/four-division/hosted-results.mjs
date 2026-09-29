// Real participant UI result submission using explicitly synthetic test payloads.
// Files exercise transport/integrity rules; they are not authentic CoH3 replay evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const checked = (result) => { assert(!result.error, "Scoped result evidence read failed"); return result.data; };
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
export function syntheticReplay(eventId, matchId, game) {
  const body = `SYNTHETIC IRONCLAD STAGING UAT TEST PAYLOAD\nNot an authentic CoH3 replay. No real game or Steam ownership claim.\nEvent: ${eventId}\nMatch: ${matchId}\nGame: ${game}\n`;
  return { name: `synthetic-staging-${eventId}-${matchId}-game-${game}.rec`, mimeType: "application/octet-stream", buffer: Buffer.from(body, "utf8") };
}

export async function runHostedResults({ authentication, pageFor, capture, record, origin, event, division, aliases, outsiderAlias, completeDivision = false, checkDuplicates = false, roomBefore, roomAfter }) {
  const bracket = event.brackets.find((row) => row.name === division);
  assert(bracket?.launched_at, "Normal result UAT requires a launched Division");
  const generated = checked(await authentication.admin.from("generated_brackets").select("id").eq("tournament_bracket_id", bracket.id).single());
  const readOfficialSeason = async () => checked(await authentication.admin.from("leaderboard_current_season")
    .select("id,official_bracket_type,valid_qualifying_event_count,is_finalized,is_under_review").single());
  const seasonBefore = await readOfficialSeason();
  const identities = await Promise.all(aliases.map((alias) => authentication.fixture(alias)));
  const registrationRows = checked(await authentication.admin.from("registrations").select("id,profile_id,registration_status")
    .eq("tournament_id", event.id).eq("tournament_bracket_id", bracket.id));
  const byRegistration = new Map(registrationRows.filter((row) => row.registration_status === "approved").map((row) => [row.id, identities.find((identity) => identity.playerId === row.profile_id)]));
  assert.equal(byRegistration.size, 8);
  assert([...byRegistration.values()].every(Boolean), "Unexpected non-fixture result participant");
  const readMatches = async () => checked(await authentication.admin.from("tournament_matches")
    .select("id,match_number,status,series_best_of,activated_at,player_one_registration_id,player_two_registration_id,winner_registration_id,player_one_score,player_two_score,bracket_rounds(round_number)")
    .eq("generated_bracket_id", generated.id));
  const reports = async (matchId) => checked(await authentication.admin.from("match_result_report_groups")
    .select("id,status,finalized_at,finalized_source,player_one_score,player_two_score,winner_registration_id")
    .eq("match_id", matchId).order("created_at", { ascending: false }));
  let completedHere = 0;
  while (true) {
    const matches = await readMatches();
    const active = matches.filter((match) => match.status !== "completed" && match.activated_at &&
      match.player_one_registration_id && match.player_two_registration_id)
      .sort((left, right) => (left.bracket_rounds?.round_number ?? 0) - (right.bracket_rounds?.round_number ?? 0) || left.match_number - right.match_number);
    if (!active.length) {
      assert(matches.every((match) => match.status === "completed"), "No active match but Division is incomplete");
      break;
    }
    const match = active[0];
    assert([1, 3, 5].includes(match.series_best_of));
    const wins = Math.floor(match.series_best_of / 2) + 1;
    const files = Array.from({ length: wins }, (_, index) => syntheticReplay(event.id, match.id, index + 1));
    const winner = byRegistration.get(match.player_one_registration_id);
    const opponent = byRegistration.get(match.player_two_registration_id);
    assert(winner && opponent);
    const matchUrl = `${origin}/tournaments?tournament=${event.slug}&tab=brackets&match=${match.id}`;
    const reporter = await pageFor(winner);
    const responder = await pageFor(opponent);
    try {
      await reporter.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
      await responder.page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded" });
      const prior = await reports(match.id);
      assert(prior.length <= 1, "Unexpected pre-existing result activity");
      let roomState;
      if (roomBefore && completedHere === 0) roomState = await roomBefore({ match, matchUrl, reporter, responder, outsiderAlias });
      if (!prior.length) {
        const form = reporter.page.locator("form").filter({ has: reporter.page.getByRole("button", { name: "Won", exact: true }) });
        await form.getByRole("button", { name: "Won", exact: true }).click();
        await form.locator("select").selectOption(`${wins}-0`);
        const uploadFields = form.locator('input[type="file"]');
        await uploadFields.nth(wins - 1).waitFor({ state: "attached" });
        assert.equal(await uploadFields.count(), wins, "UI replay slots differ from played-game count");
        const submit = form.getByRole("button", { name: "Submit Result", exact: true });
        assert(await submit.isDisabled(), "Missing replay files did not disable result submission");
        await uploadFields.first().setInputFiles(files[0]);
        if (wins > 1) assert(await submit.isDisabled(), "Incomplete replay count did not disable submission");
        await form.locator("summary").filter({ hasText: "+ Add a note" }).click();
        await form.locator('textarea[name="notes"]').fill("SYNTHETIC STAGING UAT ONLY. Test participants, scores, and .rec payloads; not authentic CoH3 replay or Steam ownership evidence.");
        if (checkDuplicates && completedHere === 0 && wins > 1) {
          for (const [index, file] of files.entries()) await uploadFields.nth(index).setInputFiles({ ...file, buffer: files[0].buffer });
          await submit.click();
          await form.getByRole("alert").filter({ hasText: /replay.*already|unique replay|different replay/i }).waitFor({ timeout: 45_000 });
          assert.equal((await reports(match.id)).length, 0, "Duplicate payloads committed a result");
          record({ phase: "results", division, duplicateContentRejected: true, committedReports: 0 });
        }
        for (const [index, file] of files.entries()) await uploadFields.nth(index).setInputFiles(file);
        assert(!(await submit.isDisabled()), "Complete synthetic evidence did not enable normal submission");
        await capture(reporter.page, `${division}-result-${completedHere + 1}-review`);
        await submit.click();
      }
      let report;
      for (let attempt = 0; attempt < 45; attempt += 1) {
        report = (await reports(match.id))[0];
        if (report?.status === "pending_confirmation") break;
        await pause(500);
      }
      assert.equal(report?.status, "pending_confirmation", "Normal result did not reach opponent confirmation");
      assert.equal(report.player_one_score, wins);
      assert.equal(report.player_two_score, 0);
      const proofs = checked(await authentication.admin.from("match_result_submissions")
        .select("id,game_number,replay_content_hash,notes").eq("match_id", match.id).eq("report_group_id", report.id).order("game_number"));
      assert.equal(proofs.length, wins, "Persisted replay count differs from played games");
      assert(proofs.every((proof, index) => proof.game_number === index + 1 && proof.replay_content_hash === digest(files[index].buffer)), "Stored evidence hash or game order differs from submitted test payloads");
      // The normal result authority stores the series note on Game 1 only.
      assert(proofs[0]?.notes?.includes("SYNTHETIC STAGING UAT ONLY"), "Synthetic provenance note missing");
      await responder.page.goto(matchUrl, { waitUntil: "domcontentloaded" });
      await responder.page.getByRole("button", { name: "Confirm Result", exact: true }).waitFor();
      const outsider = await pageFor(await authentication.fixture(outsiderAlias));
      try {
        for (const [index, proof] of proofs.entries()) {
          const endpoint = `${origin}/api/match-proofs/${match.id}/submission/${proof.id}/replay`;
          const download = await responder.context.request.get(endpoint, { maxRedirects: 0 });
          assert.equal(download.status(), 200, "Opponent private replay download failed");
          assert.match(download.headers()["cache-control"] ?? "", /private.*no-store/);
          assert.match(download.headers()["content-disposition"] ?? "", /attachment.*\.rec/);
          assert.equal(digest(await download.body()), digest(files[index].buffer));
          const denial = await outsider.context.request.get(endpoint, { maxRedirects: 0 });
          assert.equal(denial.status(), 404, "Non-participant accessed private replay evidence");
        }
      } finally { await outsider.context.close(); }
      await capture(responder.page, `${division}-result-${completedHere + 1}-confirmation`);
      await responder.page.getByRole("button", { name: "Confirm Result", exact: true }).click();
      let official;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        official = (await readMatches()).find((row) => row.id === match.id);
        if (official?.status === "completed") break;
        await pause(500);
      }
      assert.equal(official?.status, "completed");
      assert.equal(official.winner_registration_id, match.player_one_registration_id);
      const finalized = (await reports(match.id))[0];
      assert.equal(finalized.finalized_source, "opponent_confirmation");
      assert(finalized.finalized_at);
      if (roomAfter && roomState) await roomAfter({ match, matchUrl, reporter, responder, roomState });
      completedHere += 1;
      record({ phase: "results", division, completedHere, playerUploadConfirmed: true, replayCount: wins, contentHashesVerified: true, privateDownloadVerified: true, outsiderDenied: true, officialSource: finalized.finalized_source });
    } finally {
      await reporter.context.close();
      await responder.context.close();
    }
    if (!completeDivision) break;
  }
  const finalMatches = await readMatches();
  const completed = finalMatches.filter((match) => match.status === "completed").length;
  if (completeDivision) assert.equal(completed, 7, "Eight-player elimination Division did not complete seven matches");
  if (completed === 7) {
    // Settlement receipts are intentionally unavailable through REST, including
    // service-role reads. The separate pinned read-only SQL audit verifies them.
    const points = checked(await authentication.admin.from("leaderboard_point_events")
      .select("player_id,bracket_type,event_type,points").eq("tournament_bracket_id", bracket.id));
    assert(points.length > 0 && points.every((point) => point.bracket_type === (division === "Main" ? "main_progression" : "pro")), "Completed Division leaked into another accounting scope");
    assert(points.every((point) => point.event_type !== "missing_tournament_bonus"), "Main or Pro received an Academy/Challenge late-entry bonus");
    const final = [...finalMatches].sort((left, right) => (right.bracket_rounds?.round_number ?? 0) - (left.bracket_rounds?.round_number ?? 0))[0];
    const champion = byRegistration.get(final.winner_registration_id);
    const championPoints = points.filter((point) => point.player_id === champion.playerId);
    assert.equal(championPoints.reduce((sum, point) => sum + point.points, 0), 25);
    assert.equal(championPoints.filter((point) => point.event_type === "round_passed").length, 2);
    assert.equal(championPoints.filter((point) => point.event_type === "tournament_win").length, 1);
    const seasonAfter = await readOfficialSeason();
    if (division === "Main") {
      assert.equal(seasonAfter.id, seasonBefore.id);
      assert.equal(seasonAfter.valid_qualifying_event_count, seasonBefore.valid_qualifying_event_count, "Main completion consumed an official Pro season slot");
    } else if (completedHere === 0) {
      assert.equal(seasonAfter.id, seasonBefore.id);
      assert.equal(seasonAfter.valid_qualifying_event_count, seasonBefore.valid_qualifying_event_count);
    } else if (seasonBefore.valid_qualifying_event_count < 5) {
      assert.equal(seasonAfter.id, seasonBefore.id);
      assert.equal(seasonAfter.valid_qualifying_event_count, seasonBefore.valid_qualifying_event_count + 1);
    } else {
      assert.notEqual(seasonAfter.id, seasonBefore.id);
      assert.equal(seasonAfter.valid_qualifying_event_count, 0);
    }
    record({ phase: "settlement", division, receiptVerification: "separate read-only SQL audit", separateAccountingScope: true, championPoints: 25, advancementBonuses: 2, winnerBonuses: 1, lateEntryBonus: false, officialSlotEffect: division === "Main" || completedHere === 0 ? 0 : 1 });
  }
  record({ phase: "results", division, completedHere, totalCompleted: completed, completeDivision });
}
