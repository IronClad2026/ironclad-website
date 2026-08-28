import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adminPage = source("app/admin/page.tsx");
const pollPage = source("app/admin/polls/page.tsx");
const pollActions = source("app/admin/polls/actions.ts");
const pollComponent = source("components/AdminPolls.tsx");

describe("Feature C Admin route contract", () => {
  it("adds one Polls & Decisions entry to the existing Command Center", () => {
    expect(adminPage).toContain('href: "/admin/polls"');
    expect(adminPage).toContain('label: "Polls & Decisions"');
  });

  it("authenticates before service-role creation and uses safe Poll RPC projections", () => {
    expect(pollPage.indexOf("await auth()"))
      .toBeLessThan(pollPage.indexOf("createSupabaseAdminClient()"));
    expect(pollPage).toContain('rpc("list_admin_polls"');
    expect(pollPage).toContain('rpc("get_admin_poll"');
    expect(pollPage).not.toContain('.from("polls")');
    expect(pollPage).not.toContain('.from("poll_options")');
    expect(pollPage).not.toContain('.from("poll_eligible_voters")');
    expect(pollPage).not.toContain('.from("poll_ballot_choices")');
  });

  it("keeps every mutation inside the fixed service-only RPC family", () => {
    for (const rpc of [
      "save_poll_draft",
      "delete_poll_draft",
      "preview_poll_eligibility",
      "publish_poll",
      "cancel_poll",
      "finalize_poll_decision",
    ]) {
      expect(pollActions).toContain(`rpc("${rpc}"`);
    }
    expect(pollActions).not.toContain('.from("polls")');
    expect(pollActions).toContain('rpc("get_admin_poll"');
  });

  it("uses responsive full-page editing, accessible dialogs, and button ordering", () => {
    expect(pollComponent).toContain(
      "xl:grid-cols-[340px_minmax(0,1fr)]"
    );
    expect(pollComponent).toContain('role="dialog"');
    expect(pollComponent).toContain('aria-modal="true"');
    expect(pollComponent).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(pollComponent).toContain("Move option");
    expect(pollComponent).not.toContain("draggable=");
    expect(pollComponent).not.toContain("onDrag");
    expect(pollComponent).toContain("const ADMIN_POLL_REFRESH_MS = 7_000");
    expect(pollComponent).toContain(
      "const ADMIN_POLL_MAX_TIMER_MS = 2_147_000_000"
    );
    expect(pollComponent).toContain("boundaryRefreshDelay(poll.opensAt)");
    expect(pollComponent).toContain("boundaryRefreshDelay(poll.closesAt)");
    expect(pollComponent).toContain('document.addEventListener("visibilitychange"');
    expect(pollComponent).toContain('window.addEventListener("online"');
    expect(pollComponent).toContain('window.addEventListener("offline"');
  });
});
