import { test, expect } from "@playwright/test";

for (const width of [360, 390, 412, 430, 1280, 1440, 2560]) {
  test(`Manage Match states and disclosures at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      expect(url.hostname).toBe("127.0.0.1");
      await route.continue();
    });
    for (const scenario of [
      "empty",
      "pending",
      "disputed",
      "review",
      "expired",
      "hold",
      "complete",
    ]) {
      await page.goto(`/tests/browser/admin-match/?scenario=${scenario}`);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("opacity", "1");
      await expect(
        page.getByRole("button", { name: "Close match management" })
      ).toBeFocused();
      const expected = {
        empty: "Awaiting player result submission",
        pending: "Waiting for opponent confirmation",
        disputed: "Result disputed — Admin review required",
        review: "Result awaiting Admin review",
        expired:
          "Confirmation window ended — automatic confirmation processing",
        hold: "Match on hold",
        complete: "Result automatically confirmed",
      }[scenario]!;
      await expect(page.getByRole("status")).toHaveText(expected);
      await expect(
        page.getByRole("button", { name: "Reset Match", exact: true })
      ).not.toBeVisible();
      if (scenario === "pending")
        await expect(
          page.getByRole("button", { name: "Approve Result", exact: true })
        ).not.toBeVisible();
      if (["disputed", "review"].includes(scenario))
        await expect(
          page.getByRole("button", { name: "Approve Result", exact: true })
        ).toBeVisible();
      if (scenario === "complete") {
        await expect(dialog).toHaveAccessibleName(/Read-Only Match History/);
        await expect(dialog.locator("form")).toHaveCount(0);
      }
      const overflow = await dialog.evaluate((el) =>
        Array.from(el.querySelectorAll<HTMLElement>("*"))
          .filter(
            (node) =>
              node.getClientRects().length &&
              node.scrollWidth > node.clientWidth + 2 &&
              getComputedStyle(node).display !== "inline"
          )
          .map((node) => node.tagName + ":" + node.className)
      );
      expect(overflow).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${width}-${scenario}.png`),
      });
    }
    await page.goto("/tests/browser/admin-match/?scenario=empty&long=1");
    for (const title of [
      "Deadline & Scheduling",
      "Submission History (1)",
      "Advanced Admin Actions",
      "Danger Zone",
    ]) {
      const summary = page.locator("summary").filter({ hasText: title });
      await summary.click();
      await expect(summary.locator("..")).toHaveAttribute("open", "");
      await summary.scrollIntoViewIfNeeded();
      const box = await summary.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      if (title === "Danger Zone") {
        const reset = page.getByRole("button", {
          name: "Reset Match",
          exact: true,
        });
        await expect(reset).toBeDisabled();
        await page.getByLabel("Type RESET to continue").fill("RESET");
        await expect(reset).toBeEnabled();
        await reset.scrollIntoViewIfNeeded();
      }
      expect(
        await page
          .locator("[data-admin-match-scrollport]")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${width}-${title.split(" ")[0]}.png`),
      });
      await summary.click();
    }
    await page.getByRole("button", { name: "Close match management" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.locator("summary").filter({ hasText: "Danger Zone" })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Close match management" })
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
