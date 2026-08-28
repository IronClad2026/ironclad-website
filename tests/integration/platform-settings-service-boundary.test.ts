import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const updateEloVerificationSettingMock = vi.hoisted(() => vi.fn());
const updateEloVerificationSupportLinkSettingMock = vi.hoisted(() =>
  vi.fn()
);

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/platform-settings", () => ({
  updateEloVerificationSetting: updateEloVerificationSettingMock,
  updateEloVerificationSupportLinkSetting:
    updateEloVerificationSupportLinkSettingMock,
}));

import {
  updateEloVerificationMode,
  updateEloVerificationSupportLink,
} from "@/app/admin/elo-verification-actions";

describe("platform settings protected server workflow", () => {
  beforeEach(() => {
    authMock.mockReset();
    revalidatePathMock.mockReset();
    updateEloVerificationSettingMock.mockReset();
    updateEloVerificationSupportLinkSettingMock.mockReset();
    updateEloVerificationSettingMock.mockResolvedValue({
      enabled: true,
      updatedAt: null,
      updatedByClerkUserId: adminIdentity.userId,
      error: null,
    });
    updateEloVerificationSupportLinkSettingMock.mockResolvedValue({
      url: "https://support.example.test/elo",
      updatedAt: null,
      updatedByClerkUserId: adminIdentity.userId,
      error: null,
    });
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["ordinary player", playerIdentity],
  ])("rejects the %s identity before updating settings", async (_name, identity) => {
    const formData = new FormData();
    formData.set("mode", "enabled");
    authMock.mockResolvedValue(identity);

    await expect(updateEloVerificationMode(formData)).rejects.toThrow(
      "Unauthorized"
    );
    expect(updateEloVerificationSettingMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("allows an administrator to use the server-only settings workflow", async () => {
    const formData = new FormData();
    formData.set("mode", "enabled");
    authMock.mockResolvedValue(adminIdentity);

    await expect(updateEloVerificationMode(formData)).resolves.toBeUndefined();
    expect(updateEloVerificationSettingMock).toHaveBeenCalledWith({
      enabled: true,
      updatedByClerkUserId: adminIdentity.userId,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/system");
  });

  it.each([
    ["anonymous", anonymousIdentity],
    ["ordinary player", playerIdentity],
  ])(
    "rejects the %s identity before updating the support link",
    async (_name, identity) => {
      const formData = new FormData();
      formData.set("supportUrl", "https://support.example.test/elo");
      authMock.mockResolvedValue(identity);

      await expect(
        updateEloVerificationSupportLink(
          { status: "idle", message: "" },
          formData
        )
      ).rejects.toThrow("Unauthorized");
      expect(
        updateEloVerificationSupportLinkSettingMock
      ).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    }
  );

  it("allows an administrator to update the support link through the server workflow", async () => {
    const formData = new FormData();
    formData.set("supportUrl", "https://support.example.test/elo");
    authMock.mockResolvedValue(adminIdentity);

    await expect(
      updateEloVerificationSupportLink(
        { status: "idle", message: "" },
        formData
      )
    ).resolves.toEqual({
      status: "success",
      message: "ELO verification support link updated.",
      url: "https://support.example.test/elo",
    });
    expect(
      updateEloVerificationSupportLinkSettingMock
    ).toHaveBeenCalledWith({
      url: "https://support.example.test/elo",
      updatedByClerkUserId: adminIdentity.userId,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/system");
  });
});
