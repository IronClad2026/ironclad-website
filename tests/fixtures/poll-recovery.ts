import { parsePollListProjection } from "@/lib/polls";

export const POLL_TEST_TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
export function makePollRpc(scope: "public" | "viewer", overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111", purpose: "tournament_decision",
    audience_kind: "tournament_approved", tournament_id: POLL_TEST_TOURNAMENT_ID, tournament_bracket_id: null,
    question: "Synthetic recovery poll", context: null, option_source: "text", max_selections: 1, winner_count: 1,
    authority: "binding", result_visibility: "after_close", public_final_totals: false,
    opens_at: "2026-08-18T00:00:00.000Z", closes_at: "2099-08-25T00:00:00.000Z", published_at: "2026-08-17T00:00:00.000Z",
    cancelled_at: null, cancellation_reason: null,
    final_decision_published_at: scope === "public" ? "2026-09-01T00:00:00.000Z" : null,
    final_decision_basis: scope === "public" ? "binding_computed" : null,
    final_rationale: null, binding_tie_rule_used: false,
    status: scope === "public" ? "final_decision_published" : "open",
    ...(scope === "viewer" ? { ballot_revision: 0, selected_option_ids: [] } : {}),
    options: ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"].map((id, index) => ({
      id, position: index + 1, label: index ? "Map B" : "Map A", map: null,
      poll_result_rank: scope === "public" && index === 0 ? 1 : null,
      final_decision_rank: scope === "public" && index === 0 ? 1 : null,
    })),
    ...overrides,
  };
}
export function makePollProjection(scope: "public" | "viewer", overrides: Record<string, unknown> = {}) {
  const parsed = parsePollListProjection({ polls: [makePollRpc(scope, overrides)] }, scope);
  if (!parsed) throw new Error("Invalid synthetic poll fixture.");
  return parsed.polls[0];
}
