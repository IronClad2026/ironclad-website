import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/casters/invitation/route";

const { JSDOM }: {
  JSDOM: new (html: string, options: { url: string; runScripts: "outside-only" }) => {
    window: Window & typeof globalThis;
  };
} = createRequire(import.meta.url)("jsdom");

const caller = vi.hoisted(() => ({ origin: "https://caster-test.example" as string | null }));
vi.mock("@/lib/caster/environment", () => ({
  getCasterInvitationOrigin: () => caller.origin,
}));

const origin = "https://caster-test.example";
const invitationPath = "/casters/invitation";
const invitationUrl = `${origin}${invitationPath}`;
const browserSource = readFileSync("public/caster-invitation/invitation.js", "utf8");
const syntheticSecret = "A".repeat(43);

afterEach(() => { caller.origin = origin; });

describe("standalone caster invitation page", () => {
  it("serves the same generic preview without echoing request parameters or loading shared third-party scripts", async () => {
    const first = GET(new NextRequest(`${invitationUrl}?secret=${syntheticSecret}`));
    const second = GET(new NextRequest(invitationUrl));
    const html = await first.text();
    expect(html).toBe(await second.text());
    expect(html).not.toContain(syntheticSecret);
    expect(html).toContain(`property="og:url" content="${invitationUrl}"`);
    expect(html).toContain(`property="og:image" content="${origin}/caster-invitation/preview.png"`);
    expect(html.match(/<script[^>]+>/g)).toEqual(['<script src="/caster-invitation/invitation.js">']);
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    expect(first.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(HEAD().body).toBeNull();
    expect(HEAD().status).toBe(first.status);

    const image = readFileSync("public/caster-invitation/preview.png");
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("keeps the existing locale and offers only support links when disabled", async () => {
    const request = new NextRequest(invitationUrl, { headers: { Cookie: "ironclad_locale=it" } });
    const active = await GET(request).text();
    expect(active).toContain('<html lang="it">');
    expect(active).toContain("Ho già un account");
    caller.origin = null;
    const disabled = GET(request);
    expect(disabled.status).toBe(404);
    expect(HEAD().status).toBe(404);
    const html = await disabled.text();
    expect(html).toContain("non è disponibile");
    expect(html).not.toContain("invitation-form");
    expect(html).not.toContain("invitation.js");
  });

  it("scrubs the fragment before the browser requests anything and prepares only after explicit interaction", async () => {
    const dom = await createPage(`${invitationUrl}#invite=${syntheticSecret}`);
    try {
      expect(dom.window.location.href).toBe(invitationUrl);
      expect(dom.window.fetch).not.toHaveBeenCalled();
      dom.window.document.querySelector<HTMLButtonElement>('button[value="register"]')?.click();
      await vi.waitFor(() => expect(dom.window.document.querySelector("[role=status]")?.textContent).toContain("expired"));
      expect(dom.window.fetch).toHaveBeenCalledTimes(1);
      expect(dom.window.fetch).toHaveBeenCalledWith("/api/caster/invitation/prepare", expect.objectContaining({
        method: "POST", redirect: "error", body: JSON.stringify({ secret: syntheticSecret }),
      }));
    } finally {
      dom.window.close();
    }
  });

  it.each([syntheticSecret, `${invitationUrl}#invite=${syntheticSecret}`])("prepares through the recovery field without putting the secret in the URL", async (value) => {
    const dom = await createPage(invitationUrl);
    try {
      const recovery = dom.window.document.querySelector<HTMLDetailsElement>("#recovery")!;
      const input = recovery.querySelector("input")!;
      const button = recovery.querySelector("button")!;
      recovery.open = true;
      input.value = `https://other.example${invitationPath}#invite=${syntheticSecret}`;
      button.click();
      expect(dom.window.fetch).not.toHaveBeenCalled();
      input.value = value;
      button.click();
      await vi.waitFor(() => expect(dom.window.fetch).toHaveBeenCalledTimes(1));
      expect(dom.window.location.href).toBe(invitationUrl);
      expect(input.value).toBe("");
    } finally {
      dom.window.close();
    }
  });

  it("supports reopening an invitation in a tab already on the invitation page", async () => {
    const dom = await createPage(invitationUrl);
    try {
      dom.window.location.hash = `invite=${syntheticSecret}`;
      await vi.waitFor(() => expect(dom.window.location.href).toBe(invitationUrl));
      expect(dom.window.fetch).not.toHaveBeenCalled();
      dom.window.document.querySelector<HTMLButtonElement>('button[value="register"]')?.click();
      await vi.waitFor(() => expect(dom.window.fetch).toHaveBeenCalledTimes(1));
    } finally {
      dom.window.close();
    }
  });
});

async function createPage(url: string) {
  const dom = new JSDOM(await GET(new NextRequest(invitationUrl)).text(), { url, runScripts: "outside-only" });
  dom.window.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ status: "expired" }) });
  const ready = new Promise<void>((resolve) => {
    dom.window.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
  dom.window.eval(browserSource);
  await ready;
  return dom;
}
