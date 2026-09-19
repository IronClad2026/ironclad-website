import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
for (const width of [375,390]) {
  test("persisted room workflow and replay draft at " + width + "px", async ({page},testInfo) => {
    await page.setViewportSize({width,height:844});
    await page.goto("/tests/browser/match-room/");
    await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toBeVisible();
    await expect(page.getByText("IRONCLAD ADMIN",{exact:true})).toBeVisible();
    const draft = page.locator("textarea").first();
    const send = page.getByRole("button",{name:"Send",exact:true});
    await draft.fill("   ");
    await expect(send).toBeDisabled();
    await page.getByRole("button",{name:"Won",exact:true}).click();
    await page.getByRole("combobox",{name:"Score",exact:true}).selectOption("2-1");
    await page.getByLabel("Game 1 replay",{exact:true}).setInputFiles({name:"retained-draft.rec",mimeType:"application/octet-stream",buffer:Buffer.from("fixture")});
    await page.evaluate(() => window.matchRoomFixture.failResponse());
    const body = "<script>plain text only</script>\n" + "🎲".repeat(950);
    await draft.fill(body);
    await send.click();
    await expect(draft).toHaveValue(body);
    await page.getByRole("button",{name:"Retry",exact:true}).click();
    await expect(draft).toHaveValue("");
    await expect(page.getByText(body,{exact:true})).toBeVisible();
    expect(await page.evaluate(() => window.matchRoomFixture.snapshot().messages.filter(m=>m.body.includes("<script>")).length)).toBe(1);
    expect(await page.locator("script").allTextContents()).not.toContain("plain text only");
    await expect(page.getByText("retained-draft.rec",{exact:true})).toBeVisible();
    await expect(page.getByRole("combobox",{name:"Score",exact:true})).toHaveValue("2-1");
    await page.evaluate(() => { window.matchRoomFixture.incoming("New opponent response"); window.dispatchEvent(new Event("focus")); });
    await expect(page.getByText("New opponent response",{exact:true})).toBeVisible();
    await page.evaluate(() => { window.matchRoomFixture.failHistory(true); window.dispatchEvent(new Event("focus")); });
    await expect(page.getByText("New opponent response",{exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.screenshot({path:testInfo.outputPath("room-"+width+".png"),fullPage:true});
  });
}
test("closed, unavailable and denied historical contexts",async({page})=>{
  await page.goto("/tests/browser/match-room/?scenario=closed");
  await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Match Room",exact:true}).locator("textarea")).toHaveCount(0);
  await page.goto("/tests/browser/match-room/?scenario=unavailable");
  await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("region",{name:"Match Room",exact:true}).locator("textarea")).toHaveCount(0);
  await page.goto("/tests/browser/match-room/?scenario=outsider");
  await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.matchRoomFixture.snapshot().resolveCalls)).toBe(0);
  await page.goto("/tests/browser/match-room/?scenario=historical");
  await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.matchRoomFixture.snapshot().resolveCalls)).toBe(0);
});
test("admin command and newest bounded history",async({page})=>{
  await page.goto("/tests/browser/match-room/?scenario=admin");
  await expect(page.getByText("Opponent ready for the Match.",{exact:true})).toBeVisible();
  await page.locator("textarea").first().fill("Administrator instruction");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("Administrator instruction",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.matchRoomFixture.snapshot().messages.at(-1)?.senderKind)).toBe("admin");
  await page.goto("/tests/browser/match-room/?scenario=history");
  await expect(page.getByText(/^History message 55 /)).toBeVisible();
  await expect(page.getByText(/^History message 1 /)).toHaveCount(0);
  await expect(page.getByText(/^History message /)).toHaveCount(50);
});

