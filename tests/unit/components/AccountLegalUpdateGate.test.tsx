// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loadGateStateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/account-legal-acceptance", () => ({
  loadAccountLegalGateState: loadGateStateMock,
}));
vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, userId: null }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/legal-update-actions", () => ({
  acceptAccountLegalUpdate: vi.fn(),
}));

import AccountLegalUpdateGate from "@/components/legal/AccountLegalUpdateGate";
import type { AccountLegalUpdateCopy } from "@/components/legal/AccountLegalUpdateShell";

const copy = {
  eyebrow: "Legal update",
  title: "Review legal documents",
  description: "Review the current documents.",
  termsLinkLabel: "Terms",
  privacyLinkLabel: "Privacy",
  termsAgreement: "Accept Terms",
  privacyAcknowledgement: "Acknowledge Privacy",
  continueAction: "Continue",
  savingAction: "Saving",
  signOutAction: "Sign out",
  retryAction: "Try again",
  unavailableTitle: "Unavailable",
  unavailableDescription: "Return later.",
  authRequiredError: "Sign in again.",
  acceptanceRequiredError: "Confirm both.",
  unavailableError: "Try again.",
  acceptedMessage: "Saved.",
} satisfies AccountLegalUpdateCopy;

describe("AccountLegalUpdateGate", () => {
  afterEach(() => cleanup());

  it("uses the root-layout state without repeating the legal loader", async () => {
    const result = await AccountLegalUpdateGate({
      copy,
      state: { status: "satisfied" },
      children: <div>Normal authenticated application</div>,
    });
    render(result);

    expect(loadGateStateMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Normal authenticated application")
    ).toBeInTheDocument();
  });

  it.each([
    { status: "inactive" as const, reason: "anonymous" as const },
    { status: "inactive" as const, reason: "predecessor" as const },
    { status: "satisfied" as const },
  ])("renders normal children when the gate is $status", async (state) => {
      loadGateStateMock.mockResolvedValue(state);
      const result = await AccountLegalUpdateGate({
        copy,
        children: <div>Normal authenticated application</div>,
      });
      render(result);

      expect(
        screen.getByText("Normal authenticated application")
      ).toBeInTheDocument();
    });

  it.each([
    [{ status: "unavailable" as const }, "Unavailable"],
    [
      {
        status: "required" as const,
        terms: {
          id: "11111111-1111-4111-8111-111111111111",
          version: "1.1",
          url: "/terms-v1.1.pdf",
        },
        privacy: {
          id: "22222222-2222-4222-8222-222222222222",
          version: "1.1",
          url: "/privacy-v1.1.pdf",
        },
      },
      "Review legal documents",
    ],
  ])("renders only the gate shell for $1", async (state, heading) => {
    loadGateStateMock.mockResolvedValue(state);
    const result = await AccountLegalUpdateGate({
      copy,
      children: <div>Sensitive normal application children</div>,
    });
    render(result);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(
      screen.queryByText("Sensitive normal application children")
    ).not.toBeInTheDocument();
  });
});
