// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
const acceptAccountLegalUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/legal-update-actions", () => ({
  acceptAccountLegalUpdate: acceptAccountLegalUpdateMock,
  initialAccountLegalAcceptanceActionState: {
    status: "idle",
    code: "idle",
  },
}));

import AccountLegalUpdateShell, {
  type AccountLegalUpdateCopy,
} from "@/components/legal/AccountLegalUpdateShell";

const copy: AccountLegalUpdateCopy = {
  eyebrow: "Legal update",
  title: "Review the updated Terms and Privacy Policy",
  description: "Review both documents to continue using your signed-in account.",
  termsLinkLabel: "Terms of Service",
  privacyLinkLabel: "Privacy Policy",
  termsAgreement: "I accept the Terms of Service v1.1.",
  privacyAcknowledgement:
    "I acknowledge that I reviewed the Privacy Policy v1.1.",
  continueAction: "Continue",
  savingAction: "Saving…",
  signOutAction: "Sign out",
  retryAction: "Try again",
  unavailableTitle: "The legal update is temporarily unavailable",
  unavailableDescription: "Try again, or sign out and return later.",
  authRequiredError: "Your session could not be verified.",
  acceptanceRequiredError: "Complete both confirmations.",
  unavailableError: "Your acknowledgement could not be saved.",
  acceptedMessage: "Legal update saved.",
};

const requiredState = {
  status: "required" as const,
  terms: {
    id: "11111111-1111-4111-8111-111111111111",
    version: "1.1",
    url: "/documents-rules-ppa/ironclad-terms-of-service-v1.1.pdf",
  },
  privacy: {
    id: "22222222-2222-4222-8222-222222222222",
    version: "1.1",
    url: "/documents-rules-ppa/ironclad-privacy-policy-v1.1.pdf",
  },
};

describe("AccountLegalUpdateShell", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    acceptAccountLegalUpdateMock.mockReset();
    acceptAccountLegalUpdateMock.mockResolvedValue({
      status: "success",
      code: "accepted",
    });
  });
  afterEach(() => cleanup());

  it("shows two unchecked required controls and immutable successor links", () => {
    render(<AccountLegalUpdateShell state={requiredState} copy={copy} />);

    expect(
      screen.getByRole("heading", { name: copy.title })
    ).toHaveFocus();
    const terms = screen.getByRole("checkbox", {
      name: copy.termsAgreement,
    });
    const privacy = screen.getByRole("checkbox", {
      name: copy.privacyAcknowledgement,
    });
    expect(terms).not.toBeChecked();
    expect(privacy).not.toBeChecked();
    expect(terms).toBeRequired();
    expect(privacy).toBeRequired();

    expect(
      screen.getByRole("link", { name: /Terms of Service v1\.1/ })
    ).toHaveAttribute("href", requiredState.terms.url);
    expect(
      screen.getByRole("link", { name: /Privacy Policy v1\.1/ })
    ).toHaveAttribute("href", requiredState.privacy.url);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(screen.queryByText(/allow analytics/i)).not.toBeInTheDocument();
  });

  it("provides safe retry and sign-out escapes when lookup fails closed", () => {
    render(
      <AccountLegalUpdateShell state={{ status: "unavailable" }} copy={copy} />
    );

    expect(
      screen.getByRole("heading", { name: copy.unavailableTitle })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("refreshes normal content only after a successful server acceptance", async () => {
    render(<AccountLegalUpdateShell state={requiredState} copy={copy} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: copy.termsAgreement })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: copy.privacyAcknowledgement })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());
  });

  it("does not refresh normal content after a rejected server acceptance", async () => {
    acceptAccountLegalUpdateMock.mockResolvedValue({
      status: "error",
      code: "unavailable",
    });
    render(<AccountLegalUpdateShell state={requiredState} copy={copy} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: copy.termsAgreement })
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: copy.privacyAcknowledgement })
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      copy.unavailableError
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("uses a full-page responsive shell without fixed overlay content", () => {
    const { container } = render(
      <AccountLegalUpdateShell state={requiredState} copy={copy} />
    );

    const main = screen.getByRole("main");
    expect(main).toHaveClass("min-h-screen", "overflow-x-hidden", "px-4");
    expect(container.querySelector(".fixed")).not.toBeInTheDocument();
    expect(container.querySelector("[class~='sm:grid-cols-2']"))
      .toBeInTheDocument();
  });
});
