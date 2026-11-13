import { expect, test } from "@playwright/test";

const path = "/tests/browser/public-profile-notice/";

test("keyboard focus, native required check and correct form submission", async ({ page }) => {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const heading = page.getByRole("heading", { name: "Public gaming profiles and tournament information" });
  const checkbox = page.getByRole("checkbox");
  await expect(heading).toBeFocused();
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.press("Tab");
  await expect(checkbox).toBeFocused();
  await page.getByRole("button", { name: "Acknowledge and continue" }).click();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  await page.route("**/api/account/public-profile-notice", async (route) => {
    const body = new URLSearchParams(route.request().postData() ?? "");
    expect(route.request().method()).toBe("POST");
    expect(body.get("acknowledged")).toBe("yes");
    expect(body.get("noticeVersion")).toBe("public-gaming-profile-v1");
    expect(body.get("returnTo")).toBe("/admin?section=inbox");
    await route.fulfill({ status: 303, headers: { Location: path + "?error=retry" } });
  });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("The acknowledgement could not be verified or saved. Please try again.");
  await expect(checkbox).not.toBeChecked();
});

test("narrow touch view exposes notice and controls without horizontal scrolling", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto(path + "?locale=pt-BR", { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog", { name: "Perfis de jogo públicos e informações de torneios" });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/sem fazer login/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Política de Privacidade" })).toBeVisible();
    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();
    await page.getByText("Estou ciente de que as informações do perfil de jogo e dos torneios descritas acima são visíveis ao público.").tap();
    await expect(checkbox).toBeChecked();
    const width = await page.locator("body").evaluate((element) => ({ scroll: element.scrollWidth, visible: element.clientWidth }));
    expect(width.scroll).toBe(width.visible);
  } finally {
    await context.close();
  }
});

test("transition disclosure posts its own version and leaves publication a separate choice", async ({ page }) => {
  await page.goto(path + "?notice=v2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/existing and new profiles.*Acknowledging this notice does not grant permission to share optional details/)).toBeVisible();
  const checkbox = page.getByRole("checkbox", { name: "I acknowledge how IronClad displays gaming profiles and official tournament information." });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  const submitted = page.waitForRequest("**/api/account/public-profile-notice");
  await page.route("**/api/account/public-profile-notice", route => route.fulfill({ status: 204 }));
  await page.getByRole("button", { name: "Acknowledge and continue" }).click();
  const body = new URLSearchParams((await submitted).postData() ?? "");
  expect(body.get("noticeVersion")).toBe("public-gaming-profile-v2");
  expect([...body.keys()].sort()).toEqual(["acknowledged", "noticeVersion", "returnTo"]);
});
