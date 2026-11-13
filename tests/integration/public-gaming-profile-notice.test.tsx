// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  closure: vi.fn(),
  locale: vi.fn(),
  state: vi.fn(),
  save: vi.fn(),
  protect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  clerkMiddleware: (callback: unknown) => callback,
}));
vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/i18n/request", () => ({ getRequestLocale: mocks.locale }));
vi.mock("@/lib/public-gaming-profile-notice-server", () => ({
  loadPublicGamingProfileNotice: mocks.state,
  savePublicGamingProfileNotice: mocks.save,
}));
vi.mock("@/app/profile/delete-account-action", () => ({ deleteIronCladAccount: mocks.closure }));

import PublicProfileNoticePage from "@/app/account/public-profile-notice/page";
import { POST as save } from "@/app/api/account/public-profile-notice/route";
import { POST as close } from "@/app/api/account/close/route";
import proxy from "@/proxy";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { getPublicGamingProfileNoticeCopy } from "@/lib/i18n/public-gaming-profile-notice";
import {
  ACCOUNT_CLOSE_PATH,
  ACCOUNT_CLOSE_SAVE_PATH,
  NOTICE_LAYOUT_HEADER,
  noticeReturnPath,
  PUBLIC_PROFILE_NOTICE_PATH,
  PUBLIC_PROFILE_NOTICE_SAVE_PATH,
  PUBLIC_PROFILE_NOTICE_VERSION,
} from "@/lib/public-gaming-profile-notice";

const origin = "https://test.ironclad.invalid";
const identity = { userId: "user_fixtureOnly" };
const proxyHandler = proxy as unknown as (
  authority: (() => Promise<typeof identity | { userId: null }>) & { protect: typeof mocks.protect },
  request: NextRequest,
) => Promise<Response | undefined>;

const invokeProxy = (path: string, method = "GET") => proxyHandler(
  Object.assign(mocks.auth, { protect: mocks.protect }),
  new NextRequest(origin + path, { method, headers: { [NOTICE_LAYOUT_HEADER]: "spoofed" } }),
);

function post(path: string, input: string | URLSearchParams, requestOrigin = origin) {
  return new Request(origin + path, {
    method: "POST",
    body: input,
    headers: { origin: requestOrigin, "content-type": "application/x-www-form-urlencoded" },
  });
}

function checked(returnTo = "/admin?section=inbox") {
  return new URLSearchParams({ noticeVersion: PUBLIC_PROFILE_NOTICE_VERSION, acknowledged: "yes", returnTo });
}

beforeEach(() => {
  vi.stubEnv("PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED", "true");
  mocks.auth.mockResolvedValue(identity);
  mocks.locale.mockResolvedValue("en");
  mocks.state.mockResolvedValue("required");
  mocks.save.mockResolvedValue(true);
  mocks.protect.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("public gaming profile acknowledgement UI", () => {
  it.each(SUPPORTED_LOCALES)("renders the unticked required acknowledgement in %s", async (locale) => {
    mocks.locale.mockResolvedValue(locale);
    const copy = getPublicGamingProfileNoticeCopy(locale);
    const page = await PublicProfileNoticePage({ searchParams: Promise.resolve({ returnTo: "/dashboard" }) });
    render(page);
    const dialog = screen.getByRole("dialog", { name: copy.title });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("heading", { name: copy.title })).toHaveFocus();
    expect(screen.getByText(copy.publicFields)).toBeVisible();
    expect(screen.getByText(copy.contact)).toBeVisible();
    expect(screen.getByText(copy.privateFields)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: copy.checkbox })).toBeRequired();
    expect(screen.getByRole("checkbox", { name: copy.checkbox })).not.toBeChecked();
    expect(screen.getByRole("button", { name: copy.submit })).toBeVisible();
    expect(screen.getByRole("link", { name: copy.privacy })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: copy.support })).toHaveAttribute("href", "https://discord.com/channels/1440092095619662105/1440201093110960137");
    expect(screen.getByRole("link", { name: copy.closeAccount })).toHaveAttribute("href", ACCOUNT_CLOSE_PATH);
    expect(screen.getByRole("button", { name: copy.signOut })).toBeVisible();
  });

  it("shows retry and closure controls without offering a write during outage", async () => {
    mocks.state.mockResolvedValue("unavailable");
    render(await PublicProfileNoticePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Close account" })).toBeVisible();
  });
});

describe("acknowledgement form and closure escape", () => {
  it("uses the signed-in subject only and returns to the original same-site destination", async () => {
    const form = checked();
    form.set("subject", "user_wrong");
    const response = await save(post(PUBLIC_PROFILE_NOTICE_SAVE_PATH, form));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(origin + "/admin?section=inbox");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.save).toHaveBeenCalledWith(identity.userId);
  });

  it.each(["unchecked", "duplicate", "stale"] as const)("rejects %s submissions before writing", async (type) => {
    const form = checked();
    if (type === "unchecked") form.delete("acknowledged");
    if (type === "duplicate") form.append("acknowledged", "yes");
    if (type === "stale") form.set("noticeVersion", "old");
    const response = await save(post(PUBLIC_PROFILE_NOTICE_SAVE_PATH, form));
    expect(response.headers.get("location")).toContain("error=required");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps the original destination after a failed save", async () => {
    mocks.save.mockResolvedValue(false);
    const response = await save(post(PUBLIC_PROFILE_NOTICE_SAVE_PATH, checked("/dashboard")));
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.pathname).toBe(PUBLIC_PROFILE_NOTICE_PATH);
    expect(redirect.searchParams.get("returnTo")).toBe("/dashboard");
    expect(redirect.searchParams.get("error")).toBe("unavailable");
  });

  it("requires origin and authentication for both submissions", async () => {
    for (const [path, action] of [[PUBLIC_PROFILE_NOTICE_SAVE_PATH, save], [ACCOUNT_CLOSE_SAVE_PATH, close]] as const) {
      expect((await action(post(path, checked(), "https://invalid.example"))).status).toBe(403);
      mocks.auth.mockResolvedValueOnce({ userId: null });
      expect((await action(post(path, checked()))).headers.get("location")).toBe(origin + "/sign-in");
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.closure).not.toHaveBeenCalled();
  });

  it("uses existing closure authority only after one explicit confirmation and keeps safe redirect", async () => {
    mocks.closure.mockResolvedValue({ status: "success" });
    const duplicate = new URLSearchParams([["confirmation", "DELETE"], ["confirmation", "DELETE"]]);
    expect((await close(post(ACCOUNT_CLOSE_SAVE_PATH, duplicate))).headers.get("location")).toContain("confirmation-invalid");
    expect(mocks.closure).not.toHaveBeenCalled();
    const response = await close(post(ACCOUNT_CLOSE_SAVE_PATH, new URLSearchParams({ confirmation: "DELETE" })));
    expect(response.headers.get("location")).toBe(origin + "/");
    expect(mocks.closure).toHaveBeenCalledTimes(1);
  });
});

describe("live-site request boundary using simulated Clerk authority", () => {
  it.each(["/dashboard", "/tournaments?tab=matches", "/api/notifications/click?notificationId=abc"])(
    "preserves the intended route while interrupting %s",
    async (path) => {
      const response = await invokeProxy(path);
      const redirect = new URL(response!.headers.get("location")!);
      expect(response!.status).toBe(303);
      expect(redirect.pathname).toBe(PUBLIC_PROFILE_NOTICE_PATH);
      expect(redirect.searchParams.get("returnTo")).toBe(path);
    },
  );

  it("leaves signed-out public pages accessible without querying the notice", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await invokeProxy("/players");
    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(response?.headers.get("x-middleware-request-" + NOTICE_LAYOUT_HEADER)).toBeNull();
    expect(mocks.state).not.toHaveBeenCalled();
  });

  it.each(["/privacy", "/rules/public-gaming-profile", "/documents-rules-ppa/ironclad-privacy-policy-v1.2.pdf"])(
    "allows the pending account to read %s without exempting mutations",
    async (path) => {
      const response = await invokeProxy(path);
      expect(response?.headers.get("x-middleware-request-" + NOTICE_LAYOUT_HEADER)).toBe("public-document");
      expect((await invokeProxy(path, "POST"))?.status).toBe(403);
    },
  );

  it("keeps separate account routes available and blocks unrelated private API or action calls", async () => {
    expect((await invokeProxy(ACCOUNT_CLOSE_PATH))?.headers.get("x-middleware-request-" + NOTICE_LAYOUT_HEADER)).toBe("account-access");
    expect((await invokeProxy(PUBLIC_PROFILE_NOTICE_SAVE_PATH, "POST"))?.headers.get("x-middleware-next")).toBe("1");
    expect((await invokeProxy(ACCOUNT_CLOSE_SAVE_PATH, "POST"))?.headers.get("x-middleware-next")).toBe("1");
    expect((await invokeProxy(PUBLIC_PROFILE_NOTICE_PATH, "POST"))?.status).toBe(403);
    expect((await invokeProxy("/api/match-proofs/example"))?.status).toBe(403);
    expect((await invokeProxy("/tournaments", "POST"))?.status).toBe(403);
  });

  it.each(["satisfied", "inactive"])("keeps protected navigation working when %s", async (state) => {
    mocks.state.mockResolvedValue(state);
    const response = await invokeProxy("/dashboard");
    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(response?.headers.get("x-middleware-request-" + NOTICE_LAYOUT_HEADER)).toBeNull();
  });

  it.each(["//evil.invalid", "/\\evil.invalid", "/%2Fevil.invalid", "/account/public-profile-notice", "/api/account/close", "/sign-in"])(
    "rejects unsafe destination %s",
    (target) => expect(noticeReturnPath(target)).toBe("/"),
  );
});
