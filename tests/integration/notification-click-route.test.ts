import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const resolveNotificationDestinationMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/notifications", () => ({
  resolveNotificationDestination: resolveNotificationDestinationMock,
}));

import { GET } from "@/app/api/notifications/click/route";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "user_click_player";

function request(scope = "player", notificationId = NOTIFICATION_ID) {
  const url = new URL("https://www.ironcladtournaments.com/api/notifications/click");
  url.searchParams.set("notificationId", notificationId);
  url.searchParams.set("scope", scope);
  return new Request(url);
}

async function expectRedirect(response: Response, destination: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `https://www.ironcladtournaments.com${destination}`
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("trusted notification click route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({
      userId: PLAYER_ID,
      sessionClaims: { metadata: { role: "player" } },
    });
    resolveNotificationDestinationMock.mockResolvedValue(
      "/tournaments?tournament=trusted"
    );
  });

  it("redirects a signed-out caller to sign-in without looking up a row", async () => {
    authMock.mockResolvedValue({ userId: null, sessionClaims: null });

    const response = await GET(request());
    await expectRedirect(response, "/sign-in");
    expect(resolveNotificationDestinationMock).not.toHaveBeenCalled();
  });

  it("rechecks a Player notification against the authenticated Clerk owner", async () => {
    const response = await GET(request());

    await expectRedirect(response, "/tournaments?tournament=trusted");
    expect(resolveNotificationDestinationMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      "player",
      PLAYER_ID
    );
  });

  it("allows the global Admin scope only for a current Admin", async () => {
    authMock.mockResolvedValue({
      userId: "user_click_admin",
      sessionClaims: { metadata: { role: "admin" } },
    });
    resolveNotificationDestinationMock.mockResolvedValue(
      "/admin/registrations?filter=all"
    );

    const response = await GET(request("admin"));

    await expectRedirect(response, "/admin/registrations?filter=all");
    expect(resolveNotificationDestinationMock).toHaveBeenCalledWith(
      NOTIFICATION_ID,
      "admin",
      null
    );
  });

  it("denies a browser-selected Admin scope to a non-Admin", async () => {
    const response = await GET(request("admin"));

    await expectRedirect(response, "/dashboard");
    expect(resolveNotificationDestinationMock).not.toHaveBeenCalled();
  });

  it("fails closed for malformed notification identity", async () => {
    const response = await GET(request("player", "not-a-uuid"));

    await expectRedirect(response, "/dashboard");
    expect(resolveNotificationDestinationMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
  ])("rejects an unsafe destination returned by the resolver: %s", async (destination) => {
    resolveNotificationDestinationMock.mockResolvedValue(destination);

    const response = await GET(request());
    await expectRedirect(response, "/dashboard");
  });

  it("uses the role-safe fallback if the trusted lookup fails", async () => {
    resolveNotificationDestinationMock.mockRejectedValue(
      new Error("Database unavailable")
    );

    const response = await GET(request());
    await expectRedirect(response, "/dashboard");
  });
});
