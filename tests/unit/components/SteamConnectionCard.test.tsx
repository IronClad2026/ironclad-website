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

  it("shows connected status without replacement controls or an identifier", () => {
    const { container } = render(
      <SteamConnectionCard
        connected
        hasPlayer
        result="connected"
        statusAvailable
      />
    );

    expect(screen.getByText("Steam connected")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect|replace|disconnect/i })
    ).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[0-9]{17,20}/);
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

  it("does not trust a manually supplied connected result", () => {
    render(
      <SteamConnectionCard
        connected={false}
        hasPlayer
        result="connected"
        statusAvailable
      />
    );

    expect(
      screen.queryByText("Your Steam account is now connected.")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Steam Account" })
    ).toBeInTheDocument();
  });
});
