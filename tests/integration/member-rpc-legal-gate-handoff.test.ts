import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadGate: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.unmock("@/lib/account-legal-mutation-guard");
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/account-legal-acceptance", () => ({ loadAccountLegalGateState: mocks.loadGate }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.createClient }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { castPollBallot } from "@/app/polls/actions";
import { rollMatchDice } from "@/app/tournaments/dice-actions";
import {
  respondToWaitlistOfferAction,
  withdrawTournamentRegistrationAction,
} from "@/app/dashboard/registration-actions";
import { isAccountLegalAcceptanceRpcError } from "@/lib/account-legal-rpc-error";

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const OPTION_ID = "22222222-2222-4222-8222-222222222222";
const REQUIRED = "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED";
const UNAVAILABLE = "ACCOUNT_LEGAL_ACCEPTANCE_UNAVAILABLE";
const initialState = { status: "idle" as const, message: "" };

const actions = [
  {
    name: "poll ballot",
    run: () => castPollBallot({ pollId: SUBJECT_ID, expectedRevision: 0, selectedOptionIds: [OPTION_ID] }),
    failure: { ok: false, code: "save_failed", error: "Your ballot could not be saved. Refresh the Poll and try again." },
  },
  {
    name: "match dice",
    run: () => rollMatchDice({ matchId: SUBJECT_ID, expectedActivationVersion: 1, gameNumber: 1, expectedTieRound: 1 }),
    failure: { ok: false, code: "roll_failed", error: "Dice Roll-Off could not be completed. Refresh the Match and try again." },
  },
  {
    name: "waitlist acceptance",
    run: () => respondToWaitlistOfferAction(initialState, formData("accept")),
    failure: { status: "error", code: "mutation_failed", message: "The waitlist offer could not be updated." },
  },
];

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "user_legal_handoff_test" });
  mocks.loadGate.mockResolvedValue({ status: "satisfied" });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: SUBJECT_ID }, error: null }),
  };
  mocks.createClient.mockResolvedValue({ from: vi.fn(() => query), rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe.each(actions)("$name legal-gate handoff", ({ run, failure }) => {
  it.each(["required", "unavailable"])("refreshes the canonical layout gate for a %s preflight block", async (status) => {
    mocks.loadGate.mockResolvedValue({ status });
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses the same unavailable gate when canonical preflight lookup throws", async () => {
    mocks.loadGate.mockRejectedValue(new Error("Synthetic private lookup detail"));
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([REQUIRED, UNAVAILABLE])("refreshes the gate for exact SQL denial %s", async (message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message, details: "Synthetic private detail" } });
    expect(await run()).toEqual(failure);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([REQUIRED, UNAVAILABLE])("handles an exact thrown SQL denial %s without leaking it", async (message) => {
    mocks.rpc.mockRejectedValue({ code: "42501", message, details: "Synthetic private detail" });
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });

  it.each([
    { code: "42501", message: "Permission denied for a different reason", details: REQUIRED },
    { code: "40001", message: REQUIRED },
    { code: "42501", message: `${REQUIRED}: private detail` },
  ])("does not classify unrelated permission failure $code/$message as legal state", async (error) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not classify an ordinary thrown RPC failure as legal state", async () => {
    mocks.rpc.mockRejectedValue(new Error("Synthetic private network detail"));
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["code", "message"])("safely rejects an error with a throwing %s accessor", async (field) => {
    const error = { code: "42501", message: REQUIRED };
    Object.defineProperty(error, field, { get: () => { throw new Error("Synthetic private accessor detail"); } });
    mocks.rpc.mockResolvedValue({ data: null, error });
    expect(await run()).toEqual(failure);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Synthetic private accessor detail");
  });
});

describe("legal gate exit preservation", () => {
  it.each(["decline", "withdraw"])("keeps %s available without current legal acceptance", async (operation) => {
    mocks.loadGate.mockResolvedValue({ status: "required" });
    mocks.rpc.mockResolvedValue({ data: [{
      registration_id: SUBJECT_ID,
      registration_status: operation === "withdraw" ? "withdrawn" : "waitlisted",
      withdrawn_at: "2026-09-08T05:00:00.000Z",
      waitlist_offer_status: "declined",
      waitlist_offer_resolved_at: "2026-09-08T05:00:00.000Z",
    }], error: null });
    const result = operation === "withdraw"
      ? await withdrawTournamentRegistrationAction(initialState, formData())
      : await respondToWaitlistOfferAction(initialState, formData("decline"));
    expect(result).toMatchObject({ status: "success", code: operation === "withdraw" ? "withdrawn" : "offer_declined" });
    expect(mocks.loadGate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/", "layout");
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it.each(["decline", "withdraw"])("does not add legal-gate handling to a %s RPC error", async (operation) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: REQUIRED } });
    const result = operation === "withdraw"
      ? await withdrawTournamentRegistrationAction(initialState, formData())
      : await respondToWaitlistOfferAction(initialState, formData("decline"));
    expect(result).toMatchObject({ status: "error", code: "mutation_failed" });
    expect(mocks.loadGate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("exact legal RPC classifier", () => {
  it.each([null, undefined, [], REQUIRED, { message: REQUIRED }, { code: 42501, message: REQUIRED },
    { code: "42501", message: ` ${REQUIRED}` }, { code: "42501", message: REQUIRED.toLowerCase() }])(
    "rejects malformed or near-match errors %#", (error) => {
      expect(isAccountLegalAcceptanceRpcError(error)).toBe(false);
    }
  );
});

function formData(response?: string) {
  const form = new FormData();
  form.set("registrationId", SUBJECT_ID);
  if (response) form.set("response", response);
  return form;
}
