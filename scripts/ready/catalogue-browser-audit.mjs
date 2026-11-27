import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { expect } from "@playwright/test";
import { READY_MAIN_MESSAGE, readyCategories, readyQuestionCatalogue } from "../../lib/ready/catalogue.ts";
import { openQuickAction } from "./menu-journey.mjs";

// Exercise the actual Staging UI and its read-only prepared/lookup endpoint.
// Only public responses are written to the local audit record.
export async function auditReadyCatalogue({ page, origin, output, commit, items, protectionHeader }) {
  const results = [];
  const failures = [];
  const openedDocuments = new Set();
  const requestLimit = 9;
  let minute = -1;
  let requests = 0;
  const dialogue = page.locator("[data-mascot-dialogue]");
  const message = dialogue.locator("[data-mascot-message]");
  const button = (name) => dialogue.getByRole("button", { name, exact: true });
  const choiceButton = (entry) => dialogue.locator(`[data-ready-choice="${entry.id}"]`);
  const report = () => writeFile(resolve(output, "ready-catalogue-audit.json"),
    JSON.stringify({ commit, audience: "signed-out", results, failures }, null, 2));

  async function paceRequests() {
    const now = Date.now();
    if (Math.floor(now / 60_000) !== minute) {
      minute = Math.floor(now / 60_000);
      requests = 0;
    }
    if (requests < requestLimit) {
      requests++;
      return;
    }
    await wait((minute + 1) * 60_000 - now + 1200);
    return paceRequests();
  }

  async function checkMenu(menu, path) {
    await expect(message).toHaveText(menu.message);
    await expect(dialogue.locator("[data-ready-choice]")).toHaveCount(menu.choices.length);
    for (const item of menu.choices) await expect(choiceButton(item)).toHaveAccessibleName(item.label);
    results.push({ kind: "menu", id: menu.id, path, message: menu.message });
  }

  async function openPath(category, parents = []) {
    await openQuickAction(page, "Help", false);
    await expect(message).toHaveText(READY_MAIN_MESSAGE);
    const categoryButton = dialogue.locator(`[data-ready-category="${category.id}"]`);
    await expect(categoryButton).toHaveAccessibleName(category.label);
    await categoryButton.click();
    await expect(message).toHaveText(category.message);
    for (const parent of parents) {
      await choiceButton(parent).click();
      await expect(message).toHaveText(parent.message);
    }
  }

  async function selectLeaf(entry) {
    await paceRequests();
    await expect(choiceButton(entry)).toHaveAccessibleName(entry.label);
    const [response] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/ready" && response.request().method() === "POST"),
      choiceButton(entry).click(),
    ]);
    const payload = response.request().postDataJSON();
    assert.equal(payload.kind, entry.kind);
    assert.equal(payload.id, entry.id);
    return response;
  }

  async function checkLeaf(entry, path) {
    const before = page.url();
    let response = await selectLeaf(entry);
    if (response.status() === 429) {
      await expect(dialogue).toHaveAttribute("data-ready-view", "reply");
      await button("Back").click();
      await expect(message).toHaveText(path.at(-1).message);
      const retryAfter = Number(response.headers()["retry-after"]);
      assert(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 60, "Unexpected Ready retry window");
      await wait(retryAfter * 1000 + 1200);
      response = await selectLeaf(entry);
    }
    assert.equal(response.status(), 200, `Unexpected Ready HTTP status for ${entry.id}`);
    assert.equal(response.headers()["x-ready-ai-attempted"], "0");
    const reply = await response.json();
    assert.deepEqual(reply.intent, { kind: entry.kind, id: entry.id });
    assert.equal(typeof reply.text, "string");
    await expect(dialogue).toHaveAttribute("data-ready-view", "reply");
    await expect(message).toHaveText(reply.text);
    await expect(page).toHaveURL(before);
    if (entry.kind === "question") {
      assert(!reply.fallback && reply.sources?.length, `The prepared question ${entry.id} needs a sourced reply`);
    }
    const links = dialogue.getByRole("list", { name: "Sources" }).getByRole("link");
    await expect(links).toHaveCount(reply.sources?.length ?? 0);
    for (const [index, source] of (reply.sources ?? []).entries()) {
      await expect(links.nth(index)).toHaveAttribute("href", source.url);
      await expect(links.nth(index)).toHaveAccessibleName(
        `${source.title}${source.section ? ` · ${source.section}` : ""} (opens in a new tab)`);
      const target = new URL(source.url, origin);
      if (target.origin === origin && /^\/documents-rules-ppa\/[\w.-]+\.pdf$/.test(target.pathname) &&
        !openedDocuments.has(target.pathname)) {
        const context = page.context();
        const [popup, document] = await Promise.all([
          page.waitForEvent("popup"),
          context.waitForEvent("response", (candidate) => candidate.url() === target.origin + target.pathname),
          links.nth(index).click(),
        ]);
        try {
          assert.equal(document.status(), 200);
          assert.match(document.headers()["content-type"] ?? "", /^application\/pdf\b/i);
          await expect(popup).toHaveURL(target.href);
          if (entry.id === "privacy") {
            await popup.waitForLoadState("load");
            await popup.screenshot({ path: resolve(output, "ready-catalogue-privacy-citation.png"), caret: "hide" });
          }
          openedDocuments.add(target.pathname);
          results.push({ kind: "source opened", href: source.url });
        } finally {
          await popup.close();
          await page.bringToFront();
        }
      }
    }
    for (const action of reply.actions ?? []) {
      if (action.href) {
        await expect(dialogue.getByRole("link", { name: action.label, exact: true })).toHaveAttribute("href", action.href);
      } else {
        await expect(button(action.label)).toHaveCount(1);
      }
    }
    if (["disconnects", "results", "privacy"].includes(entry.id)) {
      await page.screenshot({ path: resolve(output, `ready-catalogue-${entry.id}.png`), caret: "hide" });
    }
    await button("Back").click();
    await expect(message).toHaveText(path.at(-1).message);
    await expect(dialogue.getByRole("list", { name: "Sources" })).toHaveCount(0);
    results.push({ kind: entry.kind, id: entry.id, path: [...path.map((node) => node.label), entry.label],
      reply: reply.text, sources: reply.sources ?? [], destinations: (reply.actions ?? []).map(({ label, href }) => ({ label, href })) });
  }

  async function browse(category, menu, parents = []) {
    const path = [category, ...parents];
    await checkMenu(menu, path.map(({ label }) => label));
    for (const entry of menu.choices) {
      if (entry.kind === "group") {
        await choiceButton(entry).click();
        await browse(category, entry, [...parents, entry]);
        await button("Back").click();
        await expect(message).toHaveText(menu.message);
        continue;
      }
      if (items && !items.has(entry.id)) continue;
      try {
        await checkLeaf(entry, path);
      } catch (error) {
        failures.push({ kind: entry.kind, id: entry.id, path: path.map(({ label }) => label), error: error.message.split("\n").slice(0, 12).join("\n") });
        await openPath(category, parents);
      }
      await report();
    }
  }

  // A new PDF tab has its own CDP target. Attach access only to exact same-site PDF GETs.
  await page.context().route(`${origin}/documents-rules-ppa/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || url.origin !== origin || !/^\/documents-rules-ppa\/[\w.-]+\.pdf$/.test(url.pathname)) {
      return route.abort();
    }
    const response = await route.fetch({ maxRedirects: 0, headers: { ...request.headers(), ...protectionHeader } });
    return route.fulfill({ response });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.locator("button[data-ready-dock]")).toBeVisible({ timeout: 25_000 });
  await page.locator("button[data-ready-dock]").press("Enter");
  await expect(dialogue).toBeVisible();
  const keyboardFocus = await page.evaluate(() => document.activeElement?.matches("[data-thought-cloud]") === true);
  results.push({ kind: "keyboard", initialDialogueFocus: keyboardFocus });
  await expect(dialogue.getByRole("textbox")).toHaveCount(0);
  await openQuickAction(page, "Help", false);
  await expect(message).toHaveText(READY_MAIN_MESSAGE);
  await expect(dialogue.locator("[data-ready-category]")).toHaveCount(readyCategories.length);
  await page.screenshot({ path: resolve(output, "ready-catalogue-main.png"), caret: "hide" });
  for (const category of readyCategories) {
    await openPath(category);
    await browse(category, category);
    await button("Main menu").click();
    await expect(message).toHaveText(READY_MAIN_MESSAGE);
    await expect(dialogue.getByRole("list", { name: "Sources" })).toHaveCount(0);
  }
  await button("Topic missing").click();
  await expect(dialogue.getByRole("textbox", { name: "Which topic or question is missing?" })).toBeVisible();
  await expect(button("Send suggestion")).toBeDisabled();
  await button("Cancel").click();
  await expect(message).toHaveText(READY_MAIN_MESSAGE);
  await expect(dialogue.getByRole("textbox")).toHaveCount(0);
  results.push({ kind: "feedback-form", id: "topic-missing", openedAndCancelled: true });
  await report();
  const checkedQuestions = new Set(results.filter(({ kind }) => kind === "question").map(({ id }) => id));
  assert.equal(failures.length, 0, "Some visible menu entries failed. See ready-catalogue-audit.json.");
  if (!items) assert.deepEqual([...checkedQuestions].sort(), Object.keys(readyQuestionCatalogue).sort());
  assert.equal(keyboardFocus, true, "Opening Ready from the keyboard must focus its conversation");
  return results.reduce((counts, { kind }) => ({ ...counts, [kind]: (counts[kind] ?? 0) + 1 }), {});
}
