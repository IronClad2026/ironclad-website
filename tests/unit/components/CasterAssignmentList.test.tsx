// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AssignmentList from "@/app/admin/casters/coverage/AssignmentList";
import type { AdminCoverageAssignment, CoverageChoices } from "@/app/admin/casters/coverage/contracts";

const { save, history } = vi.hoisted(() => ({ save: vi.fn(), history: vi.fn() }));
vi.mock("@/app/admin/casters/coverage/actions", () => ({ saveCastingAssignment: save, loadCastingHistory: history }));

const assignment: AdminCoverageAssignment = {
  id: "fixture-assignment", version: 1, application_id: "fixture-caster", scope: "tournament", status: "scheduled",
  tournament_id: "fixture-tournament", tournament_title: "Fixture Cup", tournament_slug: "fixture-cup",
  game: "Company of Heroes 3", target_available: true, division_id: null, division_name: null,
  match_id: null, match_label: null, scheduled_at: "2026-11-29T13:30:00.000Z", covered_at: null, verified_at: null,
  broadcast_url: "https://www.twitch.tv/ironclad", recording_url: null, caster_display_name: "Fixture Caster",
  own_match_reason: null, verified_by: null,
};
const choices: CoverageChoices = {
  divisions: [], matches: [], media: [], matchLimitReached: false, mediaLimitReached: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  save.mockReset();
  history.mockReset();
});

it("keeps editing and audit actions distinct when the same record version renders both", async () => {
  const consoleError = vi.spyOn(console, "error");
  save.mockResolvedValue({ kind: "ok", message: "Casting decision recorded." });
  history.mockResolvedValue({ kind: "ok", events: [] });
  const verified: AdminCoverageAssignment = { ...assignment, status: "completed", covered_at: "2026-11-29T13:30:00.000Z", verified_at: "2026-11-29T14:30:00.000Z" };
  render(<AssignmentList assignments={[verified]} choices={choices} scoped />);
  fireEvent.click(screen.getByText("Correct verified coverage or inspect the audit"));

  const update = await screen.findByRole("button", { name: /Correct verified/ });
  fireEvent.change(screen.getByRole("textbox", { name: "Correction reason" }), { target: { value: "Corrected archive date" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "I confirm this correction to verified coverage." }));
  fireEvent.click(update);

  await screen.findByText("Casting decision recorded.");
  expect(save).toHaveBeenCalledTimes(1);
  const submitted = save.mock.calls[0][1] as FormData;
  expect(submitted.get("action")).toBe("correct");
  expect(submitted.get("version")).toBe("1");
  expect(submitted.get("covered")).toBe("2026-11-29T13:30:00.000Z");
  fireEvent.click(screen.getByRole("button", { name: "Load audit history" }));
  await waitFor(() => expect(history).toHaveBeenCalledTimes(1));
  expect(consoleError.mock.calls.flat().some((message) => String(message).includes("Encountered two children with the same key"))).toBe(false);
});

it("keeps formerly scheduled items readable without offering routine scheduling operations", async () => {
  history.mockResolvedValue({ kind: "ok", events: [] });
  render(<AssignmentList assignments={[assignment]} choices={choices} scoped />);
  fireEvent.click(screen.getByText("View audit history"));
  expect(screen.queryByRole("button", { name: /save schedule|correct verified/i })).toBeNull();
  expect(await screen.findByRole("button", { name: "Load audit history" })).toBeVisible();
});
