import { beforeEach, describe, expect, it, vi } from "vitest";
import { moderateCaster, searchCasterModeration } from "@/app/admin/casters/moderation-actions";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), staff: vi.fn(), legal: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/caster/environment", () => ({ isCasterProgramEnabled: mocks.enabled }));
vi.mock("@/lib/patch2-admin-access", () => ({ requireCurrentPatch2Admin: mocks.staff }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("@/lib/caster/server", () => ({ casterRpc: mocks.rpc }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

const application = "10000000-0000-4000-8000-000000000001";
const previous = { kind: "idle" } as const;

function actionForm() {
  const form = new FormData();
  form.set("application", application);
  form.set("version", "7");
  form.set("action", "hide");
  form.set("reason", "  Synthetic moderation observation  ");
  form.set("confirm", "yes");
  form.set("p_actor", "untrusted-actor");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.staff.mockResolvedValue("authorized-staff");
  mocks.legal.mockResolvedValue(undefined);
});

describe("Caster moderation staff operations", () => {
  it("authenticates staff and legal acceptance before scoped searches", async () => {
    mocks.legal.mockRejectedValueOnce(new Error("Required"));
    const form = new FormData();
    form.set("status", "suspended");
    form.set("query", " synthetic ");
    form.set("page", "2");

    expect(await searchCasterModeration(previous, form)).toMatchObject({ kind: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ status: "ok", casters: [], has_more: false });
    expect(await searchCasterModeration(previous, form)).toMatchObject({ kind: "ok", filter: "suspended", page: 2, query: "synthetic" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("caster_phase3_admin_list", {
      p_actor: "authorized-staff", p_status: "suspended", p_query: "synthetic", p_offset: 25,
    });
  });

  it("requires a confirmed reason and rejects duplicated form arguments", async () => {
    const form = actionForm();
    form.delete("confirm");
    expect(await moderateCaster(previous, form)).toMatchObject({ kind: "error" });
    form.set("confirm", "yes");
    form.append("action", "reinstate");
    expect(await moderateCaster(previous, form)).toMatchObject({ kind: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes the active staff actor and the displayed moderation version to the atomic RPC", async () => {
    const form = actionForm();
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" });
    expect(await moderateCaster(previous, form)).toMatchObject({ kind: "error" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("caster_phase3_moderate", {
      p_actor: "authorized-staff", p_application_id: application, p_expected_version: 7, p_action: "hide",
      p_reason: "Synthetic moderation observation",
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("refreshes affected displays after a successful moderation decision", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "ok", caster: { slug: "fixture-caster" } });
    expect(await moderateCaster(previous, actionForm())).toMatchObject({ kind: "ok" });
    expect(mocks.revalidate.mock.calls.flat()).toEqual([
      "/admin/casters/moderation", `/admin/casters/moderation/${application}`, "/casters", "/", "/casters/fixture-caster",
    ]);
  });
});
