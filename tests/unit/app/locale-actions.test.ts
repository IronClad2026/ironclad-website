import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());
const cookieSetMock = vi.hoisted(() => vi.fn());
const updateUserMetadataMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { setLocalePreference } from "@/app/locale-actions";

describe("locale preference Server Action", () => {
  beforeEach(() => {
    authMock.mockReset();
    clerkClientMock.mockReset();
    cookiesMock.mockReset();
    cookieSetMock.mockReset();
    updateUserMetadataMock.mockReset();
    cookiesMock.mockResolvedValue({ set: cookieSetMock });
    clerkClientMock.mockResolvedValue({
      users: { updateUserMetadata: updateUserMetadataMock },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects non-allowlisted input before touching cookies or Clerk", async () => {
    await expect(setLocalePreference("de")).resolves.toEqual({
      ok: false,
      code: "INVALID_LOCALE",
    });
    expect(cookiesMock).not.toHaveBeenCalled();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("sets the one-year functional cookie without a user identifier", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(setLocalePreference("pt-BR")).resolves.toEqual({
      ok: true,
      locale: "pt-BR",
      metadataMirror: "not-signed-in",
    });
    expect(cookieSetMock).toHaveBeenCalledWith("ironclad_locale", "pt-BR", {
      httpOnly: true,
      maxAge: 31_536_000,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect(updateUserMetadataMock).not.toHaveBeenCalled();
  });

  it("marks the preference cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    authMock.mockResolvedValue({ userId: null });

    await setLocalePreference("ko");

    expect(cookieSetMock).toHaveBeenCalledWith(
      "ironclad_locale",
      "ko",
      expect.objectContaining({ secure: true })
    );
  });

  it("mirrors a signed-in preference to Clerk private metadata", async () => {
    authMock.mockResolvedValue({ userId: "user_test" });

    await expect(setLocalePreference("ru")).resolves.toEqual({
      ok: true,
      locale: "ru",
      metadataMirror: "updated",
    });
    expect(updateUserMetadataMock).toHaveBeenCalledWith("user_test", {
      privateMetadata: { ironcladLocale: "ru" },
    });
  });

  it("keeps the cookie authoritative when the Clerk mirror fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authMock.mockResolvedValue({ userId: "user_test" });
    updateUserMetadataMock.mockRejectedValue(new Error("private detail"));

    const result = await setLocalePreference("fr");

    expect(result).toEqual({
      ok: true,
      locale: "fr",
      metadataMirror: "failed",
    });
    expect(cookieSetMock).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private detail");
    expect(errorSpy).toHaveBeenCalledWith(
      "Unable to mirror the locale preference to Clerk."
    );
  });
});
