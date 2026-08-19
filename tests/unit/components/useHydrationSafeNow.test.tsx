// @vitest-environment jsdom

import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTimeRemaining } from "@/components/DashboardNotifications";
import useHydrationSafeNow from "@/components/useHydrationSafeNow";
import notificationsEnglish from "@/lib/i18n/dictionaries/en/notifications";
import { translate } from "@/lib/i18n/translate";

const t = (path: string, values = {}) =>
  translate(notificationsEnglish, path, values);

function CountdownProbe({ deadline }: { deadline: string }) {
  const now = useHydrationSafeNow({ intervalMs: 5 });

  return (
    <span data-countdown-state={now === null ? "snapshot" : "live"}>
      {formatTimeRemaining(deadline, now, "en", t)}
    </span>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHydrationSafeNow", () => {
  it("keeps the server snapshot for initial hydration, then advances active and expired countdown states", async () => {
    const deadline = "2026-08-20T00:00:00.000Z";
    const deadlineTimestamp = Date.parse(deadline);
    const now = vi.spyOn(Date, "now");
    const container = document.createElement("div");
    const recoverableErrors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | null = null;

    document.body.append(container);
    now.mockReturnValue(deadlineTimestamp - 61_000);

    try {
      const serverMarkup = renderToString(<CountdownProbe deadline={deadline} />);
      expect(serverMarkup).toContain("Time remaining unavailable");
      container.innerHTML = serverMarkup;

      await act(async () => {
        root = hydrateRoot(container, <CountdownProbe deadline={deadline} />, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
        expect(container.innerHTML).toBe(serverMarkup);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.firstElementChild).toHaveAttribute(
        "data-countdown-state",
        "live"
      );
      expect(container).toHaveTextContent("1m 1s remaining");

      now.mockReturnValue(deadlineTimestamp);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container).toHaveTextContent("Expired · awaiting automation");
      expect(recoverableErrors).toEqual([]);
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      container.remove();
    }
  });
});
