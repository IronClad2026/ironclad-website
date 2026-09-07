// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import AdminOperationsDashboard from "@/components/admin/operations/AdminOperationsDashboard";
import { emptyOperationsMetrics } from "../../fixtures/admin-operations";
const traffic = { status: "unavailable", reason: "non-production" } as const;
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
Element.prototype.scrollIntoView = vi.fn();
describe("Operations hierarchy", () => {
  it("preserves domain coverage, record destinations and truthful terminology", () => {
    const metrics = emptyOperationsMetrics();
    metrics.matches.resultResolution.playerConfirmed = 1;
    metrics.registrations.who.withdrawn = [{ id: "withdrawn", primary: "Withdrawn Player", secondary: "Fixture event", meta: "Withdrawn", timestamp: metrics.generatedAt, href: "/admin/registrations?filter=withdrawn&selected=registration-withdrawn" }];
    const { container } = render(<AdminOperationsDashboard metrics={metrics} websiteTraffic={traffic} />);
    for (const id of ["operations-overview", "attention-required", "players", "registrations", "tournaments", "matches", "website-traffic", "platform-health"]) expect(container.querySelector("#" + id)).toBeInTheDocument();
    for (const label of ["Open Player Accounts", "Registrations submitted", "Waiting Now", "Opponent Confirmed"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Registrations" }));
    expect(screen.getByRole("link", { name: /Withdrawn Player/ })).toHaveAttribute("href", metrics.registrations.who.withdrawn[0].href);
    for (const label of ["Approved Players", "Rejected Players", "Waitlisted Players"]) expect(screen.queryByText(label, { exact: true })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Subscriptions|Revenue|subscriber|tracker/i);
    for (const [label, period] of [["Today", "today"], ["7 days", "7d"], ["30 days", "30d"], ["All time", "all"]]) expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "/admin/operations?period=" + period + "#registrations");
  });
  it("keeps operational totals distinct from exact registration aggregates", () => {
    const metrics = emptyOperationsMetrics();
    metrics.registrations.statusGroups = [{ label: "Pending", value: 19 }, { label: "Manual review", value: 11 }];
    render(<AdminOperationsDashboard metrics={metrics} websiteTraffic={traffic} />);
    const current = screen.getByRole("region", { name: "Current operations · Now" });
    expect(within(current).getByRole("link", { name: /Pending registrations/ })).toHaveTextContent("19");
    expect(within(current).getByRole("link", { name: /Manual-review registrations/ })).toHaveTextContent("11");
    expect(within(current).getByRole("link", { name: /Open operational issues/ })).toHaveTextContent("0");
    expect(screen.getByText(/No items in these operational queues/)).toBeInTheDocument();
    expect(within(current).getByRole("link", { name: /Pending registrations/ })).toHaveAttribute("href", "/admin/registrations?filter=pending");
  });
  it("promotes nonzero queues with explicit severity and existing bounded records", () => {
    const metrics = emptyOperationsMetrics();
    metrics.attention[0].count = 2;
    metrics.overview.openIssues.value = 2;
    metrics.matches.who.disputed = [{ id: "fixture-match", primary: "Alpha vs Bravo", secondary: "Fixture tournament", meta: "Open dispute", timestamp: metrics.generatedAt, href: "/tournaments?tournament=fixture-event&tab=brackets&match=fixture-match" }];
    const { container } = render(<AdminOperationsDashboard metrics={metrics} websiteTraffic={traffic} />);
    const attention = screen.getByRole("region", { name: "Attention Required" });
    expect(within(attention).getByText("Critical")).toBeInTheDocument();
    expect(within(attention).getByText("1 recent shown")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: /Alpha vs Bravo/ })).toHaveAttribute("href", metrics.matches.who.disputed[0].href);
    expect(within(attention).queryByText("Warning")).not.toBeInTheDocument();
    expect(container.querySelector("#attention-required")!.compareDocumentPosition(container.querySelector("#website-traffic")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText(/No items in these operational queues/)).not.toBeInTheDocument();
  });
  it("preserves same-document navigation and bounded closure self-links", () => {
    const metrics = emptyOperationsMetrics();
    metrics.period.key = "7d";
    metrics.players.closedAccounts = [{ id: "closed", primary: "Retained closed account", secondary: "Retained account-closure record", meta: "Incomplete historical total", timestamp: metrics.generatedAt, href: "/admin/operations#who-left" }];
    render(<AdminOperationsDashboard metrics={metrics} websiteTraffic={traffic} />);
    const navigation = screen.getByRole("navigation", { name: "Operations sections" });
    expect(within(navigation).getByRole("link", { name: "Attention" })).toHaveAttribute("href", "#attention-required");
    expect(within(navigation).getByRole("link", { name: "Players" })).toHaveAttribute("href", "#players");
    expect(screen.getByRole("link", { name: /Retained closed account.*Retained account/ })).toHaveAttribute("href", "#who-left");
    expect(screen.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
  });
  it("retains all seven definitions with zero queues collapsed", () => {
    const { container } = render(<AdminOperationsDashboard metrics={emptyOperationsMetrics()} websiteTraffic={traffic} />);
    const summary = screen.getByText("All queues");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    const all = summary.closest("details")!;
    for (const item of emptyOperationsMetrics().attention) expect(within(all).getByText(item.label)).toBeInTheDocument();
    expect(container.querySelector("#match-issues")).toBeInTheDocument();
    expect(screen.getByText(/Website traffic analytics unavailable/)).toBeInTheDocument();
  });
});
