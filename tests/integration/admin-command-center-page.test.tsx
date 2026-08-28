import { isValidElement, type ElementType, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const loadAdminNotificationsMock = vi.hoisted(() => vi.fn());
const notificationCenterMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("@/lib/notifications", () => ({
  loadAdminNotifications: loadAdminNotificationsMock,
}));
vi.mock("@/components/InAppNotificationCenter", () => ({
  default: notificationCenterMock,
}));

import AdminPage from "@/app/admin/page";
import AdminRegistrationsPage from "@/app/admin/registrations/page";

const notifications = {
  notifications: [],
  totalCount: 0,
  unreadCount: 0,
  error: null,
};

describe("Admin Command Center and global Registrations authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    createSupabaseAdminClientMock.mockReset();
    loadAdminNotificationsMock.mockReset();
    notificationCenterMock.mockClear();
  });

  it.each([
    ["signed-out", anonymousIdentity],
    ["non-Admin", playerIdentity],
  ])("denies a %s identity before either route loads private data", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/"
    );
    await expect(
      AdminRegistrationsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(loadAdminNotificationsMock).not.toHaveBeenCalled();
  });

  it("redirects a valid legacy registration bookmark before loading Command Center data", async () => {
    const selected = "84d27955-537c-4cb1-9e2c-f041cc1d4013";
    authMock.mockResolvedValue(adminIdentity);

    await expect(
      AdminPage({
        searchParams: Promise.resolve({
          filter: "manual_review",
          selected,
          notice: "note-required",
          detail: "Review evidence",
          focus: "note",
        }),
      })
    ).rejects.toThrow(
      `NEXT_REDIRECT:/admin/registrations?filter=manual_review&selected=${selected}&notice=note-required&detail=Review+evidence&focus=note`
    );

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    expect(loadAdminNotificationsMock).not.toHaveBeenCalled();
  });

  it("sanitizes unsupported legacy state without accepting an arbitrary destination", async () => {
    authMock.mockResolvedValue(adminIdentity);

    await expect(
      AdminPage({
        searchParams: Promise.resolve({
          filter: "unsupported",
          selected: "not-a-uuid",
          notice: "unknown",
          focus: "redirectUrl",
        }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/admin/registrations?filter=all");

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(
      "/admin/registrations?filter=all"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("loads only compact summary data and retains the Admin Notification Center", async () => {
    const registrationSelect = vi.fn().mockResolvedValue({
      data: [
        { registration_status: "pending" },
        { registration_status: "manual_review" },
      ],
      error: null,
    });
    const tournamentOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "tournament-1",
          title: "Active Cup",
          status: "registration_open",
          grand_final_at: null,
          created_at: "2026-08-28T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const tournamentSelect = vi.fn(() => ({ order: tournamentOrder }));
    const from = vi.fn((table: string) => {
      if (table === "registrations") {
        return { select: registrationSelect };
      }
      if (table === "tournaments") {
        return { select: tournamentSelect };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ from });
    loadAdminNotificationsMock.mockResolvedValue(notifications);

    const page = await AdminPage({ searchParams: Promise.resolve({}) });
    const notificationCenter = findElementByType(page, notificationCenterMock);

    expect(registrationSelect).toHaveBeenCalledExactlyOnceWith(
      "registration_status"
    );
    expect(tournamentSelect).toHaveBeenCalledExactlyOnceWith(
      "id, title, status, grand_final_at, created_at"
    );
    expect(loadAdminNotificationsMock).toHaveBeenCalledExactlyOnceWith(50);
    expect(notificationCenter?.props).toMatchObject({
      scope: "admin",
      title: "Admin Notification Center",
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: null,
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

function findElementByType(
  node: ReactNode,
  type: ElementType
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);
      if (match) return match;
    }
    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === type) {
    return node as ReactElement<Record<string, unknown>>;
  }

  return findElementByType(
    (node.props as { children?: ReactNode }).children,
    type
  );
}
