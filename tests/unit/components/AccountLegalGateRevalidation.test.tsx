// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/", refresh: vi.fn() }));
const session = vi.hoisted(() => ({ isLoaded: true, userId: null as string | null }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => session,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
}));

import AccountLegalGateRevalidation from "@/components/legal/AccountLegalGateRevalidation";

describe("AccountLegalGateRevalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.pathname = "/";
    navigation.refresh.mockReset();
    session.isLoaded = true;
    session.userId = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("refreshes immediately when Clerk sign-in state changes", () => {
    const view = render(
      <AccountLegalGateRevalidation
        initiallySignedIn={false}
        watchForLegalChange={false}
      />
    );

    session.userId = "user_player";
    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn={false}
        watchForLegalChange={false}
      />
    );

    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("revalidates a satisfied session on route, focus, and visible boundaries", () => {
    session.userId = "user_player";
    const view = render(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForLegalChange
      />
    );

    navigation.pathname = "/tournaments";
    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForLegalChange
      />
    );
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForLegalChange
      />
    );
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(1_000));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigation.refresh).toHaveBeenCalledTimes(3);
  });

  it("does not poll or refresh without a user revalidation boundary", () => {
    session.userId = "user_player";
    const view = render(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForLegalChange
      />
    );

    act(() => vi.advanceTimersByTime(60_000));
    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForLegalChange
      />
    );
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("does not add legal-change listeners for anonymous browsing", () => {
    render(
      <AccountLegalGateRevalidation
        initiallySignedIn={false}
        watchForLegalChange={false}
      />
    );

    act(() => window.dispatchEvent(new Event("focus")));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
