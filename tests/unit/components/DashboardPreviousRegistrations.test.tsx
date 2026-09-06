// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DashboardPreviousRegistrations from "@/components/dashboard/DashboardPreviousRegistrations";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/dashboard");
});

function renderHistory() {
  return render(
    <DashboardPreviousRegistrations title="Previous registrations" count={1}>
      <article id="registration-past">Previous event</article>
    </DashboardPreviousRegistrations>
  );
}

describe("Previous registration deep links", () => {
  it("keeps the record mounted in a closed native disclosure", () => {
    renderHistory();
    const record = screen.getByText("Previous event");
    expect(record).toBeInTheDocument();
    expect(record.closest("details")).not.toHaveAttribute("open");
  });
  it("reveals an initial registration hash", () => {
    window.history.replaceState(null, "", "/dashboard#registration-past");
    renderHistory();
    expect(screen.getByText("Previous event").closest("details")).toHaveAttribute("open");
  });
  it("reveals a later exact registration hash but ignores unrelated targets", () => {
    renderHistory();
    window.history.replaceState(null, "", "/dashboard#division-invitations");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByText("Previous event").closest("details")).not.toHaveAttribute("open");
    window.history.replaceState(null, "", "/dashboard#registration-past");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByText("Previous event").closest("details")).toHaveAttribute("open");
  });
  it("ignores malformed hash encoding", () => {
    window.history.replaceState(null, "", "/dashboard#%E0%A4%A");
    expect(() => renderHistory()).not.toThrow();
  });
});
