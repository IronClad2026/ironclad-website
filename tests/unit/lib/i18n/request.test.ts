import { beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { getRequestLocale } from "@/lib/i18n/request";

describe("request locale resolution", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("uses a valid explicit locale cookie for player content", async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "it" })),
    });

    await expect(getRequestLocale()).resolves.toBe("it");
  });

  it("falls back to English for an invalid or absent cookie", async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => ({ value: "de" })),
    });

    await expect(getRequestLocale("player")).resolves.toBe("en");
  });

  it("forces Admin content to English without reading the cookie", async () => {
    await expect(getRequestLocale("admin")).resolves.toBe("en");
    expect(cookiesMock).not.toHaveBeenCalled();
  });
});
