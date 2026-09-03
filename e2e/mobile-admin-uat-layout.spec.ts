import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

test.describe.configure({ mode: "serial" });

const globalCssPath = resolve(process.cwd(), "app/globals.css");
const compiledCss = postcss([tailwind()])
  .process(readFileSync(globalCssPath, "utf8"), { from: globalCssPath })
  .then((result) => result.css);

const mobileViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
] as const;

async function loadAppStyles(page: Page) {
  await page.setContent("<!doctype html><html><head></head><body></body></html>");
  await page.addStyleTag({ content: await compiledCss });
}

async function installBracketWorkspaceFixture(page: Page) {
  await page.evaluate(() => {
    const participants = Array.from(
      { length: 8 },
      (_, index) => `
        <div class="rounded-xl border border-white/10 bg-black/30 p-3">
          <p class="break-words font-bold text-white">TESTACADEMY${index + 1}</p>
          <p class="mt-1 text-xs text-slate-500">US Forces - ELO 1000</p>
        </div>`
    ).join("");
    const slots = Array.from({ length: 8 }, (_, index) => {
      const slotNumber = index + 1;
      return `
        <div data-bracket-slot="${slotNumber}" class="relative min-w-0 self-start overflow-visible rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <span class="inline-flex rounded-md border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Slot ${slotNumber}</span>
              <p class="mt-2 break-words text-xs leading-5 font-black uppercase tracking-[0.12em] text-slate-500 [overflow-wrap:anywhere] sm:tracking-[0.2em]">Opening Match ${Math.ceil(slotNumber / 2)} - Player ${slotNumber % 2 === 1 ? "1" : "2"}</p>
            </div>
          </div>
          <div class="mt-3 rounded-lg border border-orange-400/20 bg-black/30 px-3 py-2">
            <p class="break-words text-sm font-black text-white [overflow-wrap:anywhere]">TESTACADEMY${slotNumber} With A Long Touch Layout Name</p>
            <p class="mt-1 break-words text-xs leading-5 text-zinc-500">Drag to another slot or back to the player pool</p>
          </div>
          <select aria-label="Slot ${slotNumber} player" class="relative z-10 mt-3 min-h-11 w-full min-w-0 touch-manipulation rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white">
            <option>TESTACADEMY${slotNumber} - ELO 1000</option>
          </select>
          <button class="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">Remove Assignment</button>
        </div>`;
    }).join("");

    document.body.className = "m-0 overflow-hidden bg-black text-white";
    document.body.innerHTML = `
      <div data-bracket-dialog="true" class="fixed inset-0 flex h-dvh w-screen min-w-0 max-w-none flex-col overflow-hidden bg-[#080c14]">
        <header class="shrink-0 border-b border-white/10 bg-slate-950 px-5 py-5 sm:px-8">
          <p class="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Tournament Control Center</p>
          <h2 class="mt-1 break-words text-xl font-black text-white sm:text-2xl">Private seeding for Academy Bracket With A Long Mobile Label</h2>
          <p class="mt-1 break-words text-sm text-slate-400">TEST 2</p>
        </header>
        <div data-bracket-workspace-scroll-region="true" class="grid min-h-0 min-w-0 flex-1 grid-rows-[max-content_max-content] overflow-y-auto overscroll-contain lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden">
          <aside data-bracket-participant-panel="true" class="flex min-w-0 flex-col border-b border-white/10 bg-black/25 p-5 lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-b-0 lg:p-6">
            <p class="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Approved Participants</p>
            <section class="mt-6 flex min-h-[220px] flex-none flex-col overflow-visible rounded-2xl border border-white/10 p-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
              <div class="mt-3 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">${participants}</div>
            </section>
          </aside>
          <main data-bracket-slot-panel="true" class="min-w-0 overflow-visible p-5 sm:p-7 lg:min-h-0 lg:overflow-y-auto lg:p-8">
            <p class="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Bracket Structure</p>
            <div data-bracket-slot-grid="true" class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-start gap-4">${slots}</div>
          </main>
        </div>
        <footer data-bracket-workspace-footer="true" class="relative z-20 shrink-0 border-t border-white/10 bg-black/70 px-5 pt-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] sm:px-8">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs font-black uppercase tracking-[0.22em] text-orange-400">Save / Reset Controls</p>
            <div class="flex flex-col-reverse gap-3 sm:flex-row">
              <button class="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 py-3">Reset Changes</button>
              <button class="min-h-11 w-full rounded-xl bg-orange-500 px-6 py-3">Save Private Bracket Assignments</button>
            </div>
          </div>
        </footer>
      </div>`;
  });
}

function intersectionArea(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  return (
    Math.max(
      0,
      Math.min(left.x + left.width, right.x + right.width) -
        Math.max(left.x, right.x)
    ) *
    Math.max(
      0,
      Math.min(left.y + left.height, right.y + right.height) -
        Math.max(left.y, right.y)
    )
  );
}

for (const viewport of mobileViewports) {
  test(`manual seeding remains ordered and reachable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loadAppStyles(page);
    await installBracketWorkspaceFixture(page);

    const scrollRegion = page.locator(
      '[data-bracket-workspace-scroll-region="true"]'
    );
    const participantPanel = page.locator(
      '[data-bracket-participant-panel="true"]'
    );
    const slotPanel = page.locator('[data-bracket-slot-panel="true"]');
    const footer = page.locator('[data-bracket-workspace-footer="true"]');
    const slots = page.locator("[data-bracket-slot]");

    await expect(slots).toHaveCount(8);
    await expect(page.locator('[data-bracket-slot-grid="true"]')).toHaveCSS(
      "display",
      "grid"
    );

    const [participantBox, slotPanelBox, footerBox, scrollBox] =
      await Promise.all([
        participantPanel.boundingBox(),
        slotPanel.boundingBox(),
        footer.boundingBox(),
        scrollRegion.boundingBox(),
      ]);
    expect(participantBox).not.toBeNull();
    expect(slotPanelBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(slotPanelBox!.y).toBeGreaterThanOrEqual(
      participantBox!.y + participantBox!.height - 1
    );
    expect(footerBox!.y).toBeGreaterThanOrEqual(
      scrollBox!.y + scrollBox!.height - 1
    );

    const slotBoxes = await slots.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      })
    );
    for (let index = 1; index < slotBoxes.length; index += 1) {
      expect(slotBoxes[index].y).toBeGreaterThanOrEqual(
        slotBoxes[index - 1].y + slotBoxes[index - 1].height - 1
      );
      expect(intersectionArea(slotBoxes[index - 1], slotBoxes[index])).toBe(0);
    }

    for (let index = 0; index < 8; index += 1) {
      const selector = page.getByRole("combobox", {
        name: `Slot ${index + 1} player`,
      });
      const box = await selector.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await expect(selector).toHaveCSS("z-index", "10");
    }

    await scrollRegion.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const lastSlotBox = await slots.last().boundingBox();
    const finalFooterBox = await footer.boundingBox();
    expect(lastSlotBox).not.toBeNull();
    expect(finalFooterBox).not.toBeNull();
    expect(lastSlotBox!.y + lastSlotBox!.height).toBeLessThanOrEqual(
      finalFooterBox!.y + 1
    );

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth + 1
    );
  });
}

test("desktop manual seeding retains the split-pane layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadAppStyles(page);
  await installBracketWorkspaceFixture(page);

  const participantPanel = page.locator(
    '[data-bracket-participant-panel="true"]'
  );
  const slotPanel = page.locator('[data-bracket-slot-panel="true"]');
  const footer = page.locator('[data-bracket-workspace-footer="true"]');
  const [participantBox, slotPanelBox, footerBox] = await Promise.all([
    participantPanel.boundingBox(),
    slotPanel.boundingBox(),
    footer.boundingBox(),
  ]);

  expect(participantBox).not.toBeNull();
  expect(slotPanelBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(slotPanelBox!.x).toBeGreaterThanOrEqual(
    participantBox!.x + participantBox!.width - 1
  );
  expect(Math.abs(slotPanelBox!.y - participantBox!.y)).toBeLessThanOrEqual(1);
  expect(footerBox!.y).toBeGreaterThanOrEqual(
    participantBox!.y + participantBox!.height - 1
  );

  const slotBoxes = await page.locator("[data-bracket-slot]").evaluateAll(
    (elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      })
  );
  for (let left = 0; left < slotBoxes.length; left += 1) {
    for (let right = left + 1; right < slotBoxes.length; right += 1) {
      expect(intersectionArea(slotBoxes[left], slotBoxes[right])).toBe(0);
    }
  }
});

test("mobile bulk approval remains beside Select All and touch reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadAppStyles(page);
  await page.evaluate(() => {
    document.body.className = "m-0 bg-black p-4 text-white";
    document.body.innerHTML = `
      <section class="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div class="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-[0.22em] text-orange-300">Registration records</p>
            <p class="mt-1 break-words text-sm text-zinc-400">Showing 8 registrations in this workspace.</p>
          </div>
          <div data-mobile-bulk-controls="true" class="grid shrink-0 gap-2 sm:grid-cols-2 xl:hidden">
            <label class="inline-flex min-h-11 min-w-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 text-xs font-black uppercase tracking-wider text-zinc-300">
              <input type="checkbox" checked aria-label="Select all visible registrations" class="h-5 w-5" />
              <span>Select all</span>
            </label>
            <button class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green-200 sm:w-auto">Approve Selected (7)</button>
          </div>
        </div>
        <div class="grid min-w-0 gap-3">
          <article class="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">TESTACADEMY1 — Pending</article>
        </div>
      </section>`;
  });

  const controls = page.locator('[data-mobile-bulk-controls="true"]');
  const selectAll = page
    .getByRole("checkbox", { name: "Select all visible registrations" })
    .locator("..");
  const approve = page.getByRole("button", {
    name: "Approve Selected (7)",
  });
  const [controlsBox, selectAllBox, approveBox] = await Promise.all([
    controls.boundingBox(),
    selectAll.boundingBox(),
    approve.boundingBox(),
  ]);

  expect(controlsBox).not.toBeNull();
  expect(selectAllBox).not.toBeNull();
  expect(approveBox).not.toBeNull();
  expect(selectAllBox!.height).toBeGreaterThanOrEqual(44);
  expect(approveBox!.height).toBeGreaterThanOrEqual(44);
  expect(approveBox!.y).toBeGreaterThanOrEqual(
    selectAllBox!.y + selectAllBox!.height - 1
  );
  expect(approveBox!.x + approveBox!.width).toBeLessThanOrEqual(
    controlsBox!.x + controlsBox!.width + 1
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(391);
});
