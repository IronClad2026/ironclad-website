// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SteamConnectionCard from "@/components/SteamConnectionCard";

describe("SteamConnectionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires the player profile to be saved first", () => {
    render(
      <SteamConnectionCard
        connected={false}
        hasPlayer={false}
        result={null}
        statusAvailable
      />
    );

    expect(
      screen.getByText("Save your profile before connecting Steam.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Steam Account" })
    ).not.toBeInTheDocument();
  });

  it("uses a relative same-origin POST form while disconnected", () => {
    render(
      <SteamConnectionCard
        connected={false}
        hasPlayer
        result={null}
        statusAvailable
      />
    );

    const button = screen.getByRole("button", {
      name: "Connect Steam Account",
    });
    const form = button.closest("form");

    expect(form).toHaveAttribute("action", "/api/steam/connect");
    expect(form).toHaveAttribute("method", "post");
  });

  it("offers a same-origin POST display-name refresh without replacement controls or an identifier", () => {
    const { container } = render(
      <SteamConnectionCard
        connected
        hasPlayer
        result="connected"
        statusAvailable
      />
    );

    expect(screen.getByText("Steam connected")).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", {
      name: "Refresh Steam Display Name",
    });
    const refreshForm = refreshButton.closest("form");

    expect(refreshForm).toHaveAttribute("action", "/api/steam/connect");
    expect(refreshForm).toHaveAttribute("method", "post");
    expect(
      screen.queryByRole("button", { name: /replace|disconnect/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Steam Account" })
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[0-9]{17,20}/);
  });

  it.each([
    ["connected", "Steam account connected successfully."],
    [
      "refreshed",
      "Steam account refreshed successfully. Your Steam Display Name is up to date.",
    ],
    [
      "display-name-failed",
      "Your Steam account is still connected, but we couldn’t refresh your Steam Display Name. Please try again later.",
    ],
  ] as const)("renders the %s profile feedback", (result, message) => {
    render(
      <SteamConnectionCard
        connected
        hasPlayer
        result={result}
        statusAvailable
      />
    );

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("fails closed when server-side status is unavailable", () => {
    render(
      <SteamConnectionCard
        connected={false}
        hasPlayer
        result="failed"
        statusAvailable={false}
      />
    );

    expect(
      screen.getByText("Steam connection status is temporarily unavailable.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Steam Account" })
    ).not.toBeInTheDocument();
  });

  it.each([
    ["connected", "Steam account connected successfully."],
    [
      "refreshed",
      "Steam account refreshed successfully. Your Steam Display Name is up to date.",
    ],
    [
      "display-name-failed",
      "Your Steam account is still connected, but we couldn’t refresh your Steam Display Name. Please try again later.",
    ],
  ] as const)(
    "does not trust a manually supplied %s result",
    (result, message) => {
      render(
        <SteamConnectionCard
          connected={false}
          hasPlayer
          result={result}
          statusAvailable
        />
      );

      expect(screen.queryByText(message)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Connect Steam Account" })
      ).toBeInTheDocument();
    }
  );
});
