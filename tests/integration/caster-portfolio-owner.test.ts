import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/caster/server", () => ({ loadCurrentCasterAccount: mocks.account, casterRpc: mocks.rpc }));

import { canManagePublishedCasterProfile } from "@/lib/caster/profile-owner";

const publication = { slug: "fixture-caster", publication_id: "35000000-0000-4000-8000-000000000001" };
const owner = { ...publication, membership_status: "active", hidden: false };
const actor = { id: "user_caster_fixture", status: "open", email: "fixture@example.test", emailVerified: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue(actor);
  mocks.rpc.mockResolvedValue({ status: "ok", profile: owner });
});

describe("private portfolio edit shortcut", () => {
  it("checks the current authenticated owner of the same published revision", async () => {
    expect(await canManagePublishedCasterProfile(publication)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("caster_phase3_owner", { p_actor: actor.id });
  });

  it.each(["signed_out", "closed", "unavailable", "unverified"])("denies the %s account before reading an owner record", async (status) => {
    mocks.account.mockResolvedValue({ ...actor, status: status === "unverified" ? "open" : status, emailVerified: status !== "unverified" });
    expect(await canManagePublishedCasterProfile(publication)).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...owner, slug: "someone-else" },
    { ...owner, publication_id: "35000000-0000-4000-8000-000000000002" },
    { ...owner, membership_status: "suspended" },
    { ...owner, membership_status: "inactive" },
    { ...owner, hidden: true },
    null,
  ])("rejects an unavailable or mismatched owner projection %#", async (profile) => {
    mocks.rpc.mockResolvedValue({ status: "ok", profile });
    expect(await canManagePublishedCasterProfile(publication)).toBe(false);
  });
});
