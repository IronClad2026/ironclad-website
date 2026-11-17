import { resolve } from "node:path";
import { openQuickAction } from "./menu-journey.mjs";

const routePath = "/api/ready/usage";

export async function browserUsageMenuJourney({ page, expect, output, verify, traffic }) {
  const dock = page.locator("[data-ready-dock]");
  const message = page.locator("[data-mascot-message]");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const checkbox = page.getByRole("checkbox", { name: "Allow Ready usage analytics" });
  const complete = async (value) => expect(message).toHaveText(value, { timeout: 16_000 });
  const main = () => complete("What can I help you with today, Commander?");
  const choice = async () => {
    const details = page.getByText("Ready analytics", { exact: true });
    if (!(await details.isVisible())) await openQuickAction(page, "Help", false);
    if (!(await checkbox.isVisible())) await details.click({ timeout: 7000 });
    await expect(checkbox).toBeVisible();
  };
  const accepted = () => traffic.events.filter(({ status }) => status === 200).map(({ type }) => type);

  let attemptedConsent = false;
  try {
    traffic.phase = "welcome and default consent";
    await complete("Welcome to IronClad, Commander. How’s morale today?");
    await button("Time to kick some ass!").click();
    await complete("That’s the spirit. Let’s give them a match to remember.");
    await main();
    await choice();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).not.toBeChecked();
    verify(traffic.events.length === 0, "default-off consent emits no events for initial opening, automatic speech or a morale choice");

    attemptedConsent = true;
    traffic.phase = "opt-in consent";
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect.poll(() => traffic.choices.at(-1)).toEqual({ enabled: true, status: 200 });
    await page.screenshot({ path: resolve(output, "ready-usage-player-consent.png") });
    await page.getByText("Ready analytics", { exact: true }).click();
    await page.locator("[data-mascot-drag]").hover();
    await button("Dock assistant").click();
    await expect(page.locator("[data-mode='dock']")).toHaveCount(1);
    await dock.click();
    await main();
    await expect.poll(accepted).toContain("manual_open");

    traffic.phase = "simulated collection failure";
    await openQuickAction(page, "Help", false);
    traffic.failCategory = true;
    await button("Results & replays").click();
    await expect(button("Submit my result")).toBeVisible();
    await expect.poll(() => traffic.events.filter(({ status }) => status === 503).length).toBe(2);
    traffic.failCategory = false;
    verify(true, "Ready remains usable during a simulated tracking failure, with one bounded retry");

    await button("Main menu").click();
    await button("Rules & match help").click();
    traffic.phase = "prepared disconnect answer";
    await button("Disconnects & lag").click();
    await expect(message).toContainText("10:00", { timeout: 16_000 });
    await expect(page.getByRole("link", { name: /Official Tournament Rulebook/ })).toBeVisible({ timeout: 20_000 });
    traffic.phase = "helpful vote acknowledgement";
    await button("Helpful").click();
    await expect.poll(accepted, { timeout: 15_000 }).toContain("helpfulness");
    traffic.phase = "required accepted events";
    for (const event of ["manual_open", "engage", "category_select", "question_select", "answer_display", "helpfulness"]) {
      verify(accepted().includes(event), `consented player UI received successful response for ${event}`);
    }
    await page.screenshot({ path: resolve(output, "ready-usage-player-answer.png") });

    traffic.phase = "missing topic form";
    await button("Back").click();
    await button("Topic missing").click();
    await complete("Something missing, Commander? Tell us which topic or question you wanted Ready to cover.");
    await expect(page.getByRole("textbox", { name: "Which topic or question is missing?" })).toBeVisible();
    await expect(button("Send suggestion")).toBeDisabled();
    await button("Cancel").click();
    verify(!traffic.events.some(({ type }) => type === "topic_missing"), "opening and cancelling the form produces no missing-topic analytics flag");

    traffic.phase = "safe rules navigation";
    await button("Main menu").click();
    await button("Tournaments & registration").click();
    await button("Event rules, prizes & decisions").click();
    await button("Official documents & editions").click();
    await button("Where are the official rules?").click();
    const rules = page.getByRole("link", { name: "Open rules hub", exact: true });
    await expect(rules).toBeVisible({ timeout: 16_000 });
    await rules.click();
    await expect(page).toHaveURL(/\/rules(?:[?#].*)?$/);
    await expect.poll(accepted).toContain("action_click");
    verify(true, "a real rules navigation accepted a click event without creating a result, message or support request");
  } catch (error) {
    traffic.failurePhase = traffic.phase;
    await page.screenshot({ path: resolve(output, "ready-usage-player-before-cleanup.png") }).catch(() => undefined);
    throw error;
  } finally {
    traffic.failCategory = false;
    if (attemptedConsent) {
      try {
        await choice();
        if (await checkbox.isChecked()) await checkbox.click();
        await expect(checkbox).not.toBeChecked();
        await expect.poll(() => traffic.choices.at(-1)).toEqual({ enabled: false, status: 200 });
      } catch {
        // A UI failure cannot leave the designated test account opted in.
        const status = await page.evaluate(async (path) => {
          const response = await fetch(path, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "choice", enabled: false }),
          });
          return response.status;
        }, routePath);
        verify(status === 200, "test account withdrawal verified through the guarded API cleanup");
        throw new Error("UI_WITHDRAWAL_REQUIRES_REVIEW");
      }
      const attempts = traffic.events.length;
      await page.getByText("Ready analytics", { exact: true }).click();
      await button("My match").click();
      await expect(button("My opponent")).toBeVisible();
      await page.waitForTimeout(250);
      verify(traffic.events.length === attempts, "withdrawal stopped new tracking while Ready remained usable");
    }
  }
}
