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
  await expect(page.getByText(/^History message 125 /)).toBeVisible();
  await expect(page.getByText(/^History message 1 /)).toHaveCount(0);
  await expect(page.getByText(/^History message /)).toHaveCount(50);
});



for (const width of [375, 390]) {
  test("earlier history preserves chronology, scroll and read cursor at " + width + "px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/browser/match-room/?scenario=history");
    await expect(page.getByText(/^History message 125 /)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.matchRoomFixture.snapshot().lastRead)).toBe(125);
    const log = page.getByRole("log");
    await log.evaluate((element) => { element.scrollTop = 100; element.dispatchEvent(new Event("scroll")); });
    const anchor = await log.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      const article = Array.from(element.querySelectorAll<HTMLElement>("[data-match-room-message]"))
        .find((node) => node.getBoundingClientRect().bottom > top + 10)!;
      return { id: article.dataset.matchRoomMessage!, offset: article.getBoundingClientRect().top - top };
    });
    const reads = await page.evaluate(() => window.matchRoomFixture.snapshot().readCalls);
    await page.getByRole("button", { name: "Load earlier messages", exact: true }).click();
    await expect(page.getByText(/^History message /)).toHaveCount(100);
    const offset = await log.evaluate((element, id) => {
      const article = element.querySelector<HTMLElement>('[data-match-room-message="' + id + '"]')!;
      return article.getBoundingClientRect().top - element.getBoundingClientRect().top;
    }, anchor.id);
    expect(Math.abs(offset - anchor.offset)).toBeLessThanOrEqual(4);
    await page.getByRole("button", { name: "Load earlier messages", exact: true }).click();
    await expect(page.getByText(/^History message /)).toHaveCount(125);
    await expect(page.getByRole("button", { name: "Load earlier messages", exact: true })).toHaveCount(0);
    const order = await log.locator("article p").allTextContents();
    expect(order.map((body) => Number(body.match(/^History message (\d+)/)?.[1]))).toEqual(
      Array.from({ length: 125 }, (_, index) => index + 1)
    );
    const snapshot = await page.evaluate(() => window.matchRoomFixture.snapshot());
    expect(snapshot.earlierCalls).toBe(2);
    expect(snapshot.lastRead).toBe(125);
    expect(snapshot.readCalls).toBe(reads);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("earlier-" + width + ".png"), fullPage: true });
  });

  test("assistance request, duplicate, explicit resolution and reopen at " + width + "px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/browser/match-room/");
    await page.getByRole("button", { name: "Won", exact: true }).click();
    await page.getByRole("combobox", { name: "Score", exact: true }).selectOption("2-1");
    await page.getByLabel("Game 1 replay", { exact: true }).setInputFiles({
      name: "assistance-draft.rec", mimeType: "application/octet-stream", buffer: Buffer.from("fixture"),
    });
    const request = page.getByRole("button", { name: "Request Admin Assistance", exact: true });
    await expect(request).toBeVisible();
    expect((await request.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await request.click();
    await expect(page.getByText("Assistance requested", { exact: true })).toBeVisible();
    await page.evaluate(() => window.matchRoomFixture.duplicateRequest());
    expect(await page.evaluate(() => window.matchRoomFixture.snapshot().assistanceMutations)).toBe(1);
    await page.evaluate(() => window.matchRoomFixture.setViewer("admin"));
    await page.getByRole("button", { name: "Resolve assistance", exact: true }).click();
    await expect(page.getByText("Assistance resolved", { exact: true })).toBeVisible();
    await page.evaluate(() => window.matchRoomFixture.setViewer("player"));
    await page.getByRole("button", { name: "Request assistance again", exact: true }).click();
    await expect(page.getByText("Assistance requested", { exact: true })).toBeVisible();
    const snapshot = await page.evaluate(() => window.matchRoomFixture.snapshot());
    expect(snapshot.assistance.requestVersion).toBe(2);
    expect(snapshot.assistanceMutations).toBe(3);
    expect(snapshot.count).toBe(2);
    await expect(page.getByRole("combobox", { name: "Score", exact: true })).toHaveValue("2-1");
    await expect(page.getByText("assistance-draft.rec", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("assistance-" + width + ".png"), fullPage: true });
  });
}

test("two synthetic users return through a generic notification to the pinned room", async ({ page, context }) => {
  await page.goto("/tests/browser/match-room/?scenario=notifications&viewer=player");
  await expect(page.getByText("Opponent ready for the Match.", { exact: true })).toBeVisible();
  const opponent = await context.newPage();
  await opponent.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await opponent.setViewportSize({ width: 375, height: 844 });
  await opponent.goto("/tests/browser/match-room/?scenario=notifications&viewer=opponent");
  const body = "PRIVATE fixture opponent coordination";
  await page.locator("textarea").first().fill(body);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(opponent.getByRole("link", { name: "New Match Room message", exact: true })).toBeVisible();
  const banner = opponent.getByRole("complementary", { name: "Fixture notification" });
  await expect(banner).toContainText("You have new messages in your Match Room.");
  await expect(banner).not.toContainText(body);
  expect(await page.evaluate(() => window.matchRoomFixture.snapshot().episode)).toBeNull();
  const firstEpisode = await opponent.evaluate(() => window.matchRoomFixture.snapshot().episode!.id);
  await page.locator("textarea").first().fill("Another private follow-up");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("textarea").first()).toHaveValue("");
  expect(await opponent.evaluate(() => window.matchRoomFixture.snapshot().episode!.id)).toBe(firstEpisode);
  await opponent.getByRole("link", { name: "New Match Room message", exact: true }).click();
  await expect(opponent).toHaveURL(/room=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  await expect(opponent.getByText(body, { exact: true })).toBeVisible();
  await expect.poll(() => opponent.evaluate(() => window.matchRoomFixture.snapshot().episode)).toBeNull();
  expect(await opponent.evaluate(() => window.matchRoomFixture.snapshot().resolveCalls)).toBe(0);
  const oldLink = new URL(opponent.url());
  oldLink.searchParams.set("viewer", "replacement");
  await opponent.goto(oldLink.toString());
  await expect(opponent.getByText(body, { exact: true })).toHaveCount(0);
  await expect(opponent.getByRole("region", { name: "Match Room", exact: true }).getByRole("alert")).toBeVisible();
  expect(await opponent.evaluate(() => window.matchRoomFixture.snapshot().resolveCalls)).toBe(0);
  await opponent.close();
});
