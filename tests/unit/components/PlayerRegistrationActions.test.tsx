// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/dashboard/registration-actions", () => ({
  respondToWaitlistOfferAction: vi.fn(async () => ({
    status: "success",
    message: "Updated.",
  })),
  withdrawTournamentRegistrationAction: vi.fn(async () => ({
    status: "success",
    message: "Withdrawn.",
  })),
}));

import PlayerRegistrationActions from "@/components/PlayerRegistrationActions";

const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("PlayerRegistrationActions", () => {
  afterEach(() => cleanup());

  it("shows the owner offer deadline with Accept and Decline actions", () => {
    render(
      <PlayerRegistrationActions
        registrationId={REGISTRATION_ID}
        registrationStatus="waitlisted"
        waitlistOfferStatus="offered"
        waitlistOfferExpiresAt="2099-08-07T03:00:00.000Z"
        launchedAt={null}
        tournamentStatus="registration_open"
      />
    );

    expect(
      screen.getByText("A tournament place is available")
    ).toBeInTheDocument();
    expect(screen.getByText(/Respond before/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept Spot" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Decline Spot" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Withdraw Registration" })
    ).toBeEnabled();
  });

  it.each(["approved", "rejected"] as const)(
    "keeps accepted history without claiming a %s player awaits review",
    (registrationStatus) => {
      const { container } = render(
        <PlayerRegistrationActions
          registrationId={REGISTRATION_ID}
          registrationStatus={registrationStatus}
          waitlistOfferStatus="accepted"
          waitlistOfferExpiresAt="2026-08-07T03:00:00.000Z"
          launchedAt={null}
          tournamentStatus="registration_open"
        />
      );

      expect(
        screen.queryByText(/awaiting administrator review/i)
      ).not.toBeInTheDocument();

      if (registrationStatus === "approved") {
        expect(
          screen.getByRole("button", { name: "Withdraw Registration" })
        ).toBeEnabled();
      } else {
        expect(container).toBeEmptyDOMElement();
      }
    }
  );

  it("removes response actions once the offer deadline has passed", async () => {
    render(
      <PlayerRegistrationActions
        registrationId={REGISTRATION_ID}
        registrationStatus="waitlisted"
        waitlistOfferStatus="offered"
        waitlistOfferExpiresAt="2000-08-07T03:00:00.000Z"
        launchedAt={null}
        tournamentStatus="registration_open"
      />
    );

    expect(
      await screen.findByText(/offer deadline has passed/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept Spot" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Decline Spot" })
    ).not.toBeInTheDocument();
  });

  it("removes ordinary roster actions after division launch", () => {
    const { container } = render(
      <PlayerRegistrationActions
        registrationId={REGISTRATION_ID}
        registrationStatus="approved"
        waitlistOfferStatus={null}
        waitlistOfferExpiresAt={null}
        launchedAt="2026-08-06T03:00:00.000Z"
        tournamentStatus="in_progress"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("explains a launch-cancelled waitlist without response actions", () => {
    render(
      <PlayerRegistrationActions
        registrationId={REGISTRATION_ID}
        registrationStatus="waitlisted"
        waitlistOfferStatus="cancelled"
        waitlistOfferExpiresAt={null}
        launchedAt="2026-08-06T03:00:00.000Z"
        tournamentStatus="in_progress"
      />
    );

    expect(
      screen.getByText("This division has started and its waitlist is now closed.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["cancelled", "voided"] as const)(
    "removes player mutation controls when the overall tournament is %s",
    (tournamentStatus) => {
      const { container } = render(
        <PlayerRegistrationActions
          registrationId={REGISTRATION_ID}
          registrationStatus="waitlisted"
          waitlistOfferStatus="offered"
          waitlistOfferExpiresAt="2099-08-07T03:00:00.000Z"
          launchedAt={null}
          tournamentStatus={tournamentStatus}
        />
      );

      expect(container).toBeEmptyDOMElement();
      expect(
        screen.queryByRole("button", { name: "Accept Spot" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Decline Spot" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Withdraw Registration" })
      ).not.toBeInTheDocument();
    }
  );
});
