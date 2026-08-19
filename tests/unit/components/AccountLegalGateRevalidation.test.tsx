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
        watchForSuccessor={false}
      />
    );

    session.userId = "user_player";
    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn={false}
        watchForSuccessor={false}
      />
    );

    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("revalidates a predecessor session on route navigation and tab return", () => {
    session.userId = "user_player";
    const view = render(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForSuccessor
      />
    );

    navigation.pathname = "/tournaments";
    view.rerender(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForSuccessor
      />
    );
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not add publication refreshes after successor acceptance", () => {
    session.userId = "user_player";
    render(
      <AccountLegalGateRevalidation
        initiallySignedIn
        watchForSuccessor={false}
      />
    );

    act(() => window.dispatchEvent(new Event("focus")));
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
