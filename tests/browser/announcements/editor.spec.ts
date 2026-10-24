import { expect, test, type Locator, type Page } from "@playwright/test";

async function selectText(editor: Locator, text: string) {
  await editor.evaluate((element, value) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const index = current.textContent?.indexOf(value) ?? -1;
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(current, index);
        range.setEnd(current, index + value.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        (element as HTMLElement).focus();
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      current = walker.nextNode();
    }
    throw new Error(`Could not find text: ${value}`);
  }, text);
}

async function paste(editor: Locator, content: string, html = false) {
  await editor.evaluate((element, input) => {
    const clipboard = new DataTransfer();
    clipboard.setData(input.html ? "text/html" : "text/plain", input.content);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, { content, html });
}

async function endOfEditor(editor: Locator) {
  await editor.evaluate((element) => {
    (element as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

async function typographySnapshot(container: Locator) {
  return container.locator("p,h3,h4,ul,ol,strong,em,u,a").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      text: element.textContent,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      listStyleType: element.matches("ul,ol") ? style.listStyleType : null,
      textDecoration: style.textDecorationLine,
      minHeight: style.minHeight,
    };
  }));
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("formats, previews, publishes, reloads, and withdraws the same rich announcement", async ({ page }, testInfo) => {
  await page.goto("/tests/browser/announcements/");
  await page.getByLabel("Title", { exact: true }).fill("Rich announcement acceptance fixture");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  await editor.fill("Bold italic underline — 日本語 🛡️");
  for (const [text, button] of [["Bold", "Bold"], ["italic", "Italic"], ["underline", "Underline"]]) {
    await selectText(editor, text);
    await page.getByRole("button", { name: button, exact: true }).click();
  }
  await expect(editor.locator("strong")).toHaveText("Bold");
  await expect(editor.locator("em")).toHaveText("italic");
  await expect(editor.locator("u")).toHaveText("underline");
  await endOfEditor(editor);
  await editor.press("Enter");
  await paste(editor, '<html><head><style>.MsoNormal{color:red}</style></head><body><!--StartFragment--><p class="MsoNormal">Word paragraph <span style="font-weight:700">Word bold</span> <span style="font-style:italic">Word italic</span> <span style="text-decoration:underline">Word underline</span></p><p></p><p></p><h3>Tournament details</h3><p>Read tournament rules</p><ul><li><p>First bullet</p></li><li><p>Second bullet</p></li></ul><ol start="2"><li><p>Numbered item</p></li></ol><!--EndFragment--></body></html>', true);
  await expect(editor.locator("h3")).toHaveText("Tournament details");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ol")).toHaveAttribute("start", "2");
  await expect(editor.locator("strong")).toContainText(["Bold", "Word bold"]);
  await expect(editor.locator("em")).toContainText(["italic", "Word italic"]);
  await expect(editor.locator("u")).toContainText(["underline", "Word underline"]);
  expect(await editor.locator("p").evaluateAll((elements) => elements.filter((element) => !element.textContent).length)).toBeGreaterThanOrEqual(2);

  await selectText(editor, "tournament rules");
  await page.getByRole("button", { name: "Insert or edit link" }).click();
  const dialog = page.getByRole("dialog", { name: "Announcement link" });
  await expect(dialog.getByLabel("Link URL")).toBeFocused();
  await dialog.getByLabel("Link URL").fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Apply link" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Link URL").fill("https://example.com/rules");
  await dialog.getByLabel("Link URL").press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(editor.locator("a")).toHaveText("tournament rules");
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com/rules");

  await page.getByRole("checkbox", { name: "Link this announcement to a Tournament" }).check();
  await page.getByLabel("Select Tournament").selectOption("323e4567-e89b-42d3-a456-426614174000");
  const preview = page.getByRole("region", { name: "Announcement preview" });
  // AnnouncementBody is the heading's immediate parent; compare actual computed
  // element typography, independent of differing card padding/title sizes.
  const richPreview = preview.locator("h3", { hasText: "Tournament details" }).locator("..");
  const beforePublish = await typographySnapshot(richPreview);
  await richPreview.scrollIntoViewIfNeeded();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("editor-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("status")).toHaveText("Announcement published immediately.");
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();

  await page.getByRole("link", { name: "Public announcements", exact: true }).click();
  await page.reload();
  const article = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Rich announcement acceptance fixture", exact: true }) });
  const richPublic = article.locator("h3", { hasText: "Tournament details" }).locator("..");
  expect(await typographySnapshot(richPublic)).toEqual(beforePublish);
  await expect(article.getByRole("link", { name: "tournament rules" })).toHaveAttribute("href", "https://example.com/rules");
  await expect(article.getByRole("link", { name: "View Tournament" })).toHaveAttribute("href", "/tournaments?tournament=fixture-cup");
  await expect(page.getByText("Final line <script> stays literal.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ironclad:announcements:last-seen") ?? "null")?.id)).toBeTruthy();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("public-reloaded.png"), fullPage: true });
  await page.getByRole("link", { name: "Admin composer", exact: true }).click();
  await page.getByRole("button", { name: "Withdraw announcement", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Withdraw announcement?" }).getByRole("button", { name: "Withdraw announcement", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Announcement withdrawn.");
  await page.getByRole("link", { name: "Public announcements", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rich announcement acceptance fixture" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Legacy announcement" })).toBeVisible();
});

test("retains every plain-text newline, Unicode, and undo/redo without resetting history", async ({ page }) => {
  await page.goto("/tests/browser/announcements/");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  await editor.click();
  await paste(editor, "First\n\n\n日本語 🛡️\nLast");
  await expect(editor.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(4);
  await expect(editor).toHaveText("First日本語 🛡️Last");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(editor).toHaveText("First日本語 🛡️Last");
  await endOfEditor(editor);
  await editor.press("Shift+Enter");
  await editor.pressSequentially("Standard break");
  await expect(editor.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(5);
  await page.getByLabel("Title", { exact: true }).fill("Plain newline fixture");
  await page.getByRole("button", { name: "Publish now" }).click();
  const body = await page.evaluate(() => JSON.parse(localStorage.getItem("ironclad:announcement-editor-browser-fixture") ?? "[]")[0].body);
  expect(body).toBe("First\n\n\n日本語 🛡️\nLast\nStandard break");
});

test("strips unsupported Word markup and malicious URLs, and rejects oversized paste", async ({ page }) => {
  await page.goto("/tests/browser/announcements/");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  await editor.click();
  await paste(editor, '<p onclick="alert(1)">Safe <b>bold</b> <a href="javascript:alert(1)">bad link</a></p><script>window.__announcementAttack=true</script><iframe src="https://example.com"></iframe><img src="x" onerror="alert(1)"><p><a href="https://example.com/safe">good link</a></p>', true);
  await expect(editor.locator("strong")).toHaveText("bold");
  await expect(editor.locator("a")).toHaveCount(1);
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com/safe");
  await expect(editor.locator("script,img,iframe,[onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__announcementAttack"))).toBeUndefined();
  const previousText = await editor.textContent();
  await endOfEditor(editor);
  await paste(editor, "x".repeat(10_001));
  await expect(page.getByRole("alert")).toHaveText(/exceeds the announcement content limits/);
  await expect(editor).toHaveText(previousText ?? "");
  await page.getByRole("button", { name: "Bold", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Italic", exact: true })).toBeFocused();
  await noOverflow(page);
});

test("supports heading and list toolbar controls and cleans Word list conventions", async ({ page }) => {
  await page.goto("/tests/browser/announcements/");
  const editor = page.getByRole("textbox", { name: "Message", exact: true });
  await editor.fill("Toolbar heading");
  await page.getByRole("combobox", { name: "Text style" }).selectOption("3");
  await expect(editor.locator("h3")).toHaveText("Toolbar heading");
  await page.getByRole("combobox", { name: "Text style" }).selectOption("4");
  await expect(editor.locator("h4")).toHaveText("Toolbar heading");
  await page.getByRole("combobox", { name: "Text style" }).selectOption("paragraph");
  await page.getByRole("button", { name: "Numbered list", exact: true }).click();
  await expect(editor.locator("ol li p")).toHaveText("Toolbar heading");
  await page.getByRole("button", { name: "Bullet list", exact: true }).click();
  await expect(editor.locator("ul li p")).toHaveText("Toolbar heading");
  await page.getByRole("button", { name: "Bullet list", exact: true }).click();
  await endOfEditor(editor);
  await editor.press("Enter");
  await paste(editor, '<h1>Word heading</h1><h2>Word subheading</h2><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">· </span>Word first bullet</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">· </span>Word second bullet</p><p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">1. </span>Word first number</p><p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">2. </span>Word second number</p><ol type="I" style="list-style-type:upper-roman"><li><p>Roman normalized</p></li></ol>', true);
  await expect(editor.locator("h3")).toHaveText("Word heading");
  await expect(editor.locator("h4")).toHaveText("Word subheading");
  await expect(editor.locator("ul li")).toHaveText(["Word first bullet", "Word second bullet"]);
  await expect(editor.locator("ol").first().locator("li")).toHaveText(["Word first number", "Word second number"]);
  await expect(editor.locator("ol[type]")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
