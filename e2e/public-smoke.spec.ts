import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/about",
  "/rules",
  "/terms",
  "/privacy",
  "/rankings",
];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.continue();
      return;
    }

    await route.abort("blockedbyclient");
  });
});

for (const route of publicRoutes) {
  test(`${route} renders as a public smoke route`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("Home presents the native 1v1 competition path", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const heading = page.getByRole("heading", {
    name: "HOW IRONCLAD COMPETITION WORKS",
  });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeVisible();
  await expect(
    page.getByText(
      "Verify your Division, play through a structured eight-Player bracket, and build an official competitive record."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "VIEW TOURNAMENTS" }).last()
  ).toHaveAttribute("href", "/tournaments");
  await expect(page.getByRole("link", { name: "READ 1V1 RULES" })).toHaveAttribute(
    "href",
    "/rules#one-v-one-rules"
  );
  await expect(page.getByRole("link", { name: "VIEW RANKINGS" })).toHaveAttribute(
    "href",
    "/rankings"
  );
  await expect(page.getByText(/Battlefy/i)).toHaveCount(0);
  await expect(page.getByText(/Main \/ Elite/i)).toHaveCount(0);
});

test("Rules exposes the approved categories, document status, and accessible FAQ", async ({
  page,
}) => {
  await page.goto("/rules", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "IRONCLAD COMPETITION RULES" })
  ).toBeVisible();

  const oneVOneTab = page.getByRole("tab", { name: /1V1 RULES/ });
  const rankingsTab = page.getByRole("tab", {
    name: /RANKINGS & SEASONS/,
  });
  const ppaTab = page.getByRole("tab", { name: /PPA & CONDUCT/ });

  await expect(oneVOneTab).toHaveAttribute("aria-selected", "true");
  await oneVOneTab.press("ArrowRight");
  await expect(rankingsTab).toHaveAttribute("aria-selected", "true");
  await rankingsTab.press("End");
  await expect(ppaTab).toHaveAttribute("aria-selected", "true");
  await ppaTab.press("Home");
  await expect(oneVOneTab).toHaveAttribute("aria-selected", "true");

  const replayRule = page.getByRole("button", {
    name: "Results & Replay Proof",
  });
  await replayRule.scrollIntoViewIfNeeded();
  await replayRule.click();
  await expect(replayRule).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/Screenshots are not accepted as substitute Match-result proof/)
  ).toBeVisible();

  const rulebookStatus = page
    .locator("article")
    .filter({ hasText: "Official Tournament Rulebook" });
  await rulebookStatus.scrollIntoViewIfNeeded();
  await expect(rulebookStatus).toContainText("Version 3.0");
  await expect(rulebookStatus).toContainText("Effective");
  await expect(rulebookStatus).toContainText("18 August 2026");

  const discordFaq = page.getByRole("button", { name: "Is Discord required?" });
  await discordFaq.scrollIntoViewIfNeeded();
  await expect(discordFaq).toHaveAttribute("aria-expanded", "false");
  await discordFaq.click();
  await expect(discordFaq).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/match-scoped Admin Assistance feature provide platform fallbacks/)
  ).toBeVisible();

  await expect(page.getByText(/4V4 RULES/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Read Online" })).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: /Read \(opens in a new tab\)/ })
  ).toHaveCount(2);
});

test("About and Rankings use Career and season language without universal prizes", async ({
  page,
}) => {
  await page.goto("/about", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Career and season standings")).toBeVisible();
  await expect(
    page.getByText(
      "Results build permanent Career standings or a six-Event Main / Pro season."
    )
  ).toBeVisible();
  await expect(page.getByText(/Main \/ Elite/i)).toHaveCount(0);

  await page.goto("/rankings", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Leaderboard & Ranking" })
  ).toBeVisible();
  await expect(
    page.getByText(/Main \/ Pro is the authoritative six-valid-event season/)
  ).toBeVisible();
  await expect(page.getByText(/Prize Positions/i)).toHaveCount(0);
  await expect(page.getByText(/prize season/i)).toHaveCount(0);
});

test("anonymous visitors should reach the public players directory", async ({
  page,
}) => {
  const response = await page.goto("/players", {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Players Directory" })
  ).toBeVisible();
});
