import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());
const cookieSetMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const updateUserMetadataMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import {
  setLocalePreference,
  syncLocalePreferenceAfterAuth,
} from "@/app/locale-actions";

describe("locale preference Server Action", () => {
  beforeEach(() => {
    authMock.mockReset();
    clerkClientMock.mockReset();
    cookiesMock.mockReset();
    cookieGetMock.mockReset();
    cookieSetMock.mockReset();
    getUserMock.mockReset();
    updateUserMetadataMock.mockReset();
    cookiesMock.mockResolvedValue({ get: cookieGetMock, set: cookieSetMock });
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: getUserMock,
        updateUserMetadata: updateUserMetadataMock,
      },
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

  it("synchronizes an anonymous cookie preference after the player signs in", async () => {
    cookieGetMock.mockReturnValue({ value: "zh-CN" });
    authMock.mockResolvedValue({ userId: "user_test" });
    getUserMock.mockResolvedValue({ privateMetadata: {} });

    await expect(syncLocalePreferenceAfterAuth()).resolves.toEqual({
      ok: true,
      status: "updated",
    });
    expect(updateUserMetadataMock).toHaveBeenCalledTimes(1);
    expect(updateUserMetadataMock).toHaveBeenCalledWith("user_test", {
      privateMetadata: { ironcladLocale: "zh-CN" },
    });
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("does not rewrite already-matching Clerk metadata", async () => {
    cookieGetMock.mockReturnValue({ value: "fr" });
    authMock.mockResolvedValue({ userId: "user_test" });
    getUserMock.mockResolvedValue({
      privateMetadata: { ironcladLocale: "fr" },
    });

    await expect(syncLocalePreferenceAfterAuth()).resolves.toEqual({
      ok: true,
      status: "already-matched",
    });
    expect(updateUserMetadataMock).not.toHaveBeenCalled();
  });

  it("replaces invalid Clerk locale metadata with the validated cookie preference", async () => {
    cookieGetMock.mockReturnValue({ value: "ko" });
    authMock.mockResolvedValue({ userId: "user_test" });
    getUserMock.mockResolvedValue({
      privateMetadata: { ironcladLocale: "invalid" },
    });

    await expect(syncLocalePreferenceAfterAuth()).resolves.toEqual({
      ok: true,
      status: "updated",
    });
    expect(updateUserMetadataMock).toHaveBeenCalledWith("user_test", {
      privateMetadata: { ironcladLocale: "ko" },
    });
  });

  it("ignores a missing or invalid cookie before authentication or Clerk access", async () => {
    cookieGetMock.mockReturnValue({ value: "de" });

    await expect(syncLocalePreferenceAfterAuth()).resolves.toEqual({
      ok: true,
      status: "no-valid-cookie",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(clerkClientMock).not.toHaveBeenCalled();
  });

  it("leaves a valid anonymous preference in the cookie until sign-in", async () => {
    cookieGetMock.mockReturnValue({ value: "pt-BR" });
    authMock.mockResolvedValue({ userId: null });

    await expect(syncLocalePreferenceAfterAuth()).resolves.toEqual({
      ok: true,
      status: "not-signed-in",
    });
    expect(clerkClientMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it("reports a safe failure without changing the UI cookie when Clerk synchronization fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    cookieGetMock.mockReturnValue({ value: "es" });
    authMock.mockResolvedValue({ userId: "user_test" });
    getUserMock.mockRejectedValue(new Error("private provider detail"));

    const result = await syncLocalePreferenceAfterAuth();

    expect(result).toEqual({ ok: false, code: "SYNC_FAILED" });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Unable to synchronize the locale preference with Clerk."
    );
  });
});
