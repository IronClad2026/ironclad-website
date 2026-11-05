import { describe, expect, it, vi } from "vitest";
import { navigateTournamentPresentation } from "@/lib/tournament-presentation-navigation";

function setup() {
  return { router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }, history: { pushState: vi.fn() } };
}
describe("loaded tournament presentation navigation", () => {
  it("changes the URL immediately and retains background authority refresh for main tabs", () => {
    const context = setup();
    navigateTournamentPresentation({ ...context, href: "/tournaments?tournament=event&tab=brackets", mode: "push", sameTournament: true });
    expect(context.history.pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/tournaments?tournament=event&tab=brackets");
    expect(context.router.push).not.toHaveBeenCalled();
    expect(context.router.refresh).toHaveBeenCalledOnce();
    expect(context.history.pushState.mock.invocationCallOrder[0]).toBeLessThan(context.router.refresh.mock.invocationCallOrder[0]);
  });
  it("keeps overview panels immediate without losing another component's pending authority refresh", () => {
    const context = setup();
    navigateTournamentPresentation({ ...context, href: "/tournaments?tournament=event&tab=overview&panel=rules", mode: "push", sameTournament: true });
    expect(context.history.pushState).toHaveBeenCalledOnce();
    expect(context.router.refresh).toHaveBeenCalledOnce();
    expect(context.router.push).not.toHaveBeenCalled();
  });
  it("retains server navigation when selecting another event", () => {
    const context = setup();
    navigateTournamentPresentation({ ...context, href: "/tournaments?tournament=another&tab=overview", mode: "push", sameTournament: false });
    expect(context.router.push).toHaveBeenCalledExactlyOnceWith("/tournaments?tournament=another&tab=overview", { scroll: false });
    expect(context.history.pushState).not.toHaveBeenCalled();
    expect(context.router.refresh).not.toHaveBeenCalled();
  });
  it("retains server replacement for canonical URLs without adding history entries", () => {
    const context = setup();
    navigateTournamentPresentation({ ...context, href: "/tournaments?tournament=event&tab=overview", mode: "replace", sameTournament: true });
    expect(context.router.replace).toHaveBeenCalledExactlyOnceWith("/tournaments?tournament=event&tab=overview", { scroll: false });
    expect(context.history.pushState).not.toHaveBeenCalled();
  });
});
