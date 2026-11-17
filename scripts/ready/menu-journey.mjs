import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const centralMessage = "What can I help you with today, Commander?";
const entries = [
  ["match", "My match", ["My opponent", "Open opponent chat", "Deadline & match status", "View my bracket"]],
  ["results", "Results & replays", ["Submit my result", "Upload replays", "Confirm or dispute a result", "Why can’t I submit?"]],
  ["rules", "Rules & match help", ["Disconnects & lag", "Opponent not responding", "Pauses & deadlines", "Maps & match format"]],
  ["tournaments", "Tournaments & registration", ["Find or join a tournament", "My registration & waitlist", "Eligibility & divisions", "Event rules, prizes & decisions"]],
  ["profile", "My profile & progress", ["Profile & Steam", "Notifications", "My history & statistics", "Rankings & points"]],
  ["support", "Contact an admin", ["In-site Admin Assistance", "Open Discord ticket channel", "Copy my match reference"]],
];

export async function openQuickAction(page, label, mobile) {
  const grip = page.locator("[data-mascot-drag]");
  const button = page.getByRole("button", { name: label, exact: true });
  if (mobile) {
    if ((await grip.getAttribute("aria-expanded")) !== "true") await grip.tap();
    await button.tap();
  } else {
    await grip.hover();
    await button.click();
  }
}

export async function openReadySearch(page, mobile) {
  const search = page.getByRole("button", { name: "Search prepared answers", exact: true });
  if (!await search.isVisible()) await openQuickAction(page, "Help", mobile);
  if (mobile) await search.tap();
  else await search.click();
}

export function installRendererObservation() {
  // Test-only observation of the running controller; rendering calls pass through unchanged.
  Object.defineProperty(globalThis, "IronCladMascotV6", {
    configurable: true,
    set(module) {
      Object.defineProperty(globalThis, "IronCladMascotV6", {
        configurable: true,
        value: {
          ...module,
          createMascotRenderer(...args) {
            const renderer = module.createMascotRenderer(...args);
            globalThis.readyAcceptancePose = () => renderer.snapshot();
            return renderer;
          },
        },
      });
    },
  });
}

async function assertLayout(page, expect, mobile) {
  const main = page.locator('[data-ready-view="main"]');
  const message = main.locator("[data-mascot-message]");
  const box = await main.locator("[data-thought-cloud]").boundingBox();
  const skull = await page.locator("[data-mascot-drag]").boundingBox();
  const buttons = await Promise.all(entries.map(([id]) => main.locator(`[data-ready-category="${id}"]`).boundingBox()));
  await expect(message).toHaveText(centralMessage);
  const viewport = page.viewportSize();
  for (const bounds of [box, ...buttons]) {
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    const intersects = bounds.x < skull.x + skull.width && bounds.x + bounds.width > skull.x
      && bounds.y < skull.y + skull.height && bounds.y + bounds.height > skull.y;
    expect(intersects).toBe(false);
  }
  if (mobile) {
    expect(new Set(buttons.map(({ x }) => Math.round(x))).size).toBe(2);
    expect(buttons[0].y).toBeGreaterThanOrEqual(box.y + box.height);
  } else {
    await expect(main).toHaveAttribute("data-menu-layout", "oval");
    expect(buttons[2].x + buttons[2].width).toBeLessThanOrEqual(box.x);
    expect(buttons[3].x).toBeGreaterThanOrEqual(box.x + box.width - 1);
    expect(buttons[0].y).toBeLessThan(box.y);
    expect(buttons[4].y).toBeGreaterThan(box.y);
  }
}

async function dragPhoneMascot(page, deltaX = -190) {
  const grip = page.locator("[data-mascot-drag]");
  const pos = await grip.boundingBox();
  const from = { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 };
  const touch = await page.context().newCDPSession(page);
  const point = (x, y) => [{ id: 1, x: Math.round(x), y: Math.round(y) }];
  try {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
    for (const portion of [.25, .5, .75, 1]) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: point(from.x + deltaX * portion, from.y - 74 * portion),
      });
    }
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await touch.detach();
  }
  return (await grip.boundingBox()).x;
}

function readHeroClearance() {
  const heroLink = document.querySelector('[data-mascot-attention="view-tournaments"]');
  const dialogue = document.querySelector("[data-mascot-dialogue]");
  const thought = dialogue.querySelector("[data-thought-cloud]");
  const grip = document.querySelector("[data-mascot-drag]");
  const frame = dialogue.getBoundingClientRect();
  const bounds = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  const visibleClouds = [thought, ...dialogue.querySelectorAll("button, a[href], summary")].map((element) => {
    const box = element.getBoundingClientRect();
    return { left: Math.max(box.left, frame.left), top: Math.max(box.top, frame.top),
      right: Math.min(box.right, frame.right), bottom: Math.min(box.bottom, frame.bottom) };
  }).filter((box) => box.left < box.right && box.top < box.bottom);

  const controls = [...heroLink.parentElement.querySelectorAll("a[href]")].map((link) => {
    const box = link.getBoundingClientRect();
    const overlapped = visibleClouds.some((cloud) =>
      Math.min(box.right, cloud.right) - Math.max(box.left, cloud.left) > 1 &&
      Math.min(box.bottom, cloud.bottom) - Math.max(box.top, cloud.top) > 1);
    const tappable = [0.1, 0.5, 0.9].every((offset) => link.contains(
      document.elementFromPoint(box.left + box.width * offset, box.top + box.height / 2),
    ));
    return { ...bounds(link), overlapped, tappable };
  });
  return { width: innerWidth, height: innerHeight, dialogue: bounds(dialogue), thought: bounds(thought),
    skull: bounds(grip), controls };
}

async function assertCloudTap(page, expect) {
  const point = await page.evaluate(() => {
    const dialogue = document.querySelector("[data-mascot-dialogue]");
    const thought = dialogue.querySelector("[data-thought-cloud]").getBoundingClientRect();
    const frame = dialogue.getBoundingClientRect();
    const x = Math.round(thought.x + thought.width / 2);
    const y = Math.round((Math.max(thought.top, frame.top) + Math.min(thought.bottom, frame.bottom)) / 2);
    const probe = document.createElement("button");
    // A control under the cloud which does not affect layout or obstacle detection.
    probe.id = "ready-cloud-tap-probe";
    probe.type = "button";
    probe.tabIndex = -1;
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "fixed", zIndex: "118", opacity: "0",
      left: `${x - 6}px`, top: `${y - 6}px`, width: "12px", height: "12px" });
    probe.dataset.taps = "0";
    probe.addEventListener("click", () => { probe.dataset.taps = String(Number(probe.dataset.taps) + 1); });
    document.body.append(probe);
    const stack = document.elementsFromPoint(x, y);
    return { x, y, probePresent: stack.includes(probe), cloudOnTop: dialogue.contains(stack[0]) };
  });
  const probe = page.locator("#ready-cloud-tap-probe");
  try {
    expect(point.probePresent).toBe(true);
    await page.touchscreen.tap(point.x, point.y);
    await expect(probe).toHaveAttribute("data-taps", "0");
    expect(point.cloudOnTop).toBe(true);
  } finally {
    await probe.evaluate((element) => element.remove());
  }
}

export async function browserMobileLayoutJourney({ page, expect, output, verify }) {
  const settled = (view) => page.locator(`[data-ready-view="${view}"]:not([data-revealing])`);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const cta = page.locator('[data-mascot-attention="view-tournaments"]');
  const grip = page.locator("[data-mascot-drag]");
  await expect(cta).toHaveAttribute("href", "/tournaments");
  await openQuickAction(page, "Help", true);
  await expect(settled("main")).toBeVisible({ timeout: 16_000 });
  for (const { name, width, height } of [{ name: "portrait", width: 390, height: 780 },
    { name: "landscape", width: 780, height: 390 }]) {
    await page.setViewportSize({ width, height });
    if (name === "landscape") await cta.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(cta).toBeInViewport({ ratio: 1 });
    await expect(settled("main")).toBeVisible();
    const measure = async () => {
      const layout = await page.evaluate(readHeroClearance);
      await writeFile(resolve(output, `ready-mobile-${name}-geometry.json`), JSON.stringify(layout, null, 2));
      return layout.controls.every(({ overlapped, tappable }) => !overlapped && tappable);
    };
    await expect.poll(measure, { message: `${name} hero controls fully clear of Ready` }).toBe(true);
    await page.screenshot({ path: resolve(output, `ready-mobile-${name}.png`), animations: "disabled" });
    await assertCloudTap(page, expect);
    verify(true, `${width}×${height} Chrome touch emulation leaves both hero links clear and a cloud tap stays in Ready`);

    await button("Rules & match help").tap();
    await expect(settled("submenu")).toBeVisible({ timeout: 16_000 });
    await button("Maps & match format").tap();
    await expect(button("Which faction can I play?")).toBeVisible({ timeout: 16_000 });
    await button("Back").tap();
    await button("Disconnects & lag").tap();
    await expect(page.getByRole("link", { name: /Official Tournament Rulebook/ })).toBeVisible({ timeout: 20_000 });
    await button("Main menu").tap();
    await expect(settled("main")).toBeVisible({ timeout: 16_000 });
    const before = await grip.boundingBox();
    const draggedX = await dragPhoneMascot(page, before.x > (width - before.width) / 2 ? -190 : 190);
    expect(Math.abs(draggedX - before.x)).toBeGreaterThan(30);
    await expect(grip).toHaveAttribute("aria-expanded", "false");
    await button("Dock assistant").tap();
    await expect(page.locator("[data-mode='dock'][data-asset-status='ready']")).toHaveCount(1);
    await page.locator("[data-ready-dock]").tap();
    await expect(settled("main")).toBeVisible({ timeout: 16_000 });
    expect(Math.abs((await grip.boundingBox()).x - draggedX)).toBeLessThan(5);
    verify(true, `${name} touch emulation verified nested submenu, prepared rule source, drag, dock and reopen`);
  }
  await cta.tap();
  await expect(page).toHaveURL(/\/tournaments(?:[?#].*)?$/);
  verify(true, "a real tap on the exposed View Tournaments control opens Tournaments");
}

export async function browserMenuJourney({ page, expect, mobile, output, verify, recording }) {
  const message = page.locator("[data-mascot-message]");
  const view = (name) => page.locator(`[data-ready-view="${name}"]`);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const choose = (name) => mobile ? button(name).tap() : button(name).click();
  const complete = async (text) => {
    await expect(message).toHaveText(text, { timeout: 16_000 });
  };
  const main = () => complete(centralMessage);

  await complete("Welcome to IronClad, Commander. How’s morale today?");
  let draggedX;
  if (!mobile) {
    await choose("Time to kick some ass!");
    await expect.poll(() => page.evaluate(() => globalThis.readyAcceptancePose?.()?.expression)).toBe("Ghigno");
    await complete("That’s the spirit. Let’s give them a match to remember.");
    await main();
    await openQuickAction(page, "Welcome", mobile);
    await complete("Welcome back, Commander. How’s morale today?");
    await choose("A little nervous…");
    await complete("Even commanders get nervous. One match at a time.");
    await main();
    await openQuickAction(page, "Welcome", mobile);
    await complete("Welcome back, Commander. How’s morale today?");
  }
  await choose("I’m never winning this… white flag’s up!");
  await complete("Oh, poor you, Commander… let me shed a tactical tear.");
  await expect.poll(() => page.evaluate(() => globalThis.readyAcceptancePose?.()?.tearDrops ?? 0)).toBeGreaterThan(0);
  await complete("Permission to surrender? Denied. One match at a time, Commander.");
  const recovered = await page.evaluate(() => {
    const pose = globalThis.readyAcceptancePose?.();
    return pose?.expression === "Neutral" && pose?.tearDrops === 0;
  });
  verify(recovered, "Sad first line shows real particles; second line runs in Neutral after particles fade");
  await main();
  await assertLayout(page, expect, mobile);
  await page.screenshot({ path: resolve(output, mobile ? "ready-menu-touch.png" : "ready-menu-desktop.png") });

  for (const [, label, choices] of entries) {
    await choose(label);
    await expect(view("submenu")).toBeVisible();
    for (const choice of choices) await expect(button(choice)).toBeVisible();
    await choose("Back");
    await main();
  }
  verify(true, "six fixed categories, exact submenus and Back actions");
  await choose("Rules & match help");
  await choose("Maps & match format");
  await expect(button("Which faction can I play?")).toBeVisible();
  await expect(button("Which lobby settings should we use?")).toBeVisible();
  await choose("Back");
  await choose("Disconnects & lag");
  await expect(message).toContainText("10:00", { timeout: 16_000 });
  await expect(page.getByRole("link", { name: /Official Tournament Rulebook/ })).toBeVisible({ timeout: 16_000 });
  await choose("Still need help");
  await expect(button("Still need help")).toHaveCount(0);
  await choose("Contact an admin");
  await expect(button("In-site Admin Assistance")).toBeVisible();
  await choose("Main menu");
  await main();
  verify(true, "prepared answer, source and optional Still need help route");

  if (!mobile) {
    await openReadySearch(page, false);
    await page.getByRole("textbox", { name: "Ask about IronClad" }).fill("weather on mars");
    await choose("Send question");
    await expect(view("reply")).toBeVisible({ timeout: 16_000 });
    await expect(button("Main menu")).toBeVisible();
    await openQuickAction(page, "Help", false);
    await main();
    await openQuickAction(page, "Welcome", false);
    await complete("Welcome back, Commander. How’s morale today?");
    await choose("I’m never winning this… white flag’s up!");
    await openQuickAction(page, "Help", false);
    await main();
    await choose("My profile & progress");
    // Give the previous Sad handoff enough time to run if it was not canceled.
    await page.waitForTimeout(5500);
    await expect(button("Profile & Steam")).toBeVisible();
    await choose("Main menu");
    await main();
    verify(true, "Help opens immediately and cancels obsolete Sad handoff");
  } else {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await assertLayout(page, expect, mobile);
    const handle = page.locator("[data-mascot-drag]");
    const before = await handle.boundingBox();
    draggedX = await dragPhoneMascot(page);
    expect(draggedX).toBeLessThan(before.x - 40);
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await assertLayout(page, expect, mobile);
  }
  if (!mobile) await page.locator("[data-mascot-drag]").hover();
  await choose("Dock assistant");
  await expect(page.locator("[data-mode='dock'][data-asset-status='ready']")).toHaveCount(1);
  const dock = page.locator("[data-ready-dock]");
  if (mobile) await dock.tap();
  else await dock.click();
  await main();
  if (draggedX !== undefined) {
    const reOpened = await page.locator("[data-mascot-drag]").boundingBox();
    expect(reOpened.x).toBeCloseTo(draggedX, 0);
  }
  verify(true, mobile ? "touch emulation menu layout, resize, distinct drag and remembered docking position" : "desktop oval menu layout and docking");
  if (recording) await page.close();
}
