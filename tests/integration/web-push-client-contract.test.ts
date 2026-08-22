import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const absolute = resolve(root, directory, entry.name);
      const path = relative(root, absolute).replaceAll("\\", "/");

      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx|js)$/.test(entry.name) ? [path] : [];
    }
  );
}

describe("Stage B client and PWA contract", () => {
  it("keeps the service worker notification-only with no cache or fetch layer", () => {
    const worker = read("public/sw.js");

    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain('self.addEventListener("notificationclick"');
    expect(worker).toContain("self.registration.showNotification");
    expect(worker).toContain("applyBackgroundBadge(payload.unreadCount)");
    expect(worker).not.toContain('addEventListener("fetch"');
    expect(worker).not.toMatch(/\bcaches\s*\./);
    expect(worker).not.toContain("cache.add");
  });

  it("builds clicks only through the authenticated destination resolver", () => {
    const worker = read("public/sw.js");
    const payload = read("lib/web-push/payload.ts");
    const sender = read("lib/web-push/worker.ts");

    expect(worker).toContain("buildNotificationClickDestination(");
    expect(worker).toContain("/api/notifications/click?notificationId=");
    expect(worker).toContain('value === "player" || value === "admin"');
    expect(worker).toContain("NOTIFICATION_ID_PATTERN.test(value)");
    expect(worker).not.toContain("payload.destination");
    expect(worker).not.toContain("event.notification.data?.destination");
    expect(worker).toContain("includeUncontrolled: true");
    expect(worker).toContain("self.clients.openWindow(absoluteDestination)");
    expect(payload).toContain('scope: "player" | "admin"');
    expect(sender).toContain("scope: claim.recipientRole");
  });

  it("registers the worker only inside the deliberate enable control", () => {
    const files = [
      ...sourceFiles("app"),
      ...sourceFiles("components"),
      ...sourceFiles("lib"),
    ];
    const registrations = files.filter((path) =>
      read(path).includes('serviceWorker.register("/sw.js"')
    );
    const control = read("components/NotificationPermissionControl.tsx");
    const enableStart = control.indexOf("const enableNotifications");
    const registerAt = control.indexOf('serviceWorker.register("/sw.js"');
    const permissionAt = control.indexOf("Notification.requestPermission()");
    const firstAwaitAt = control.indexOf("await Promise.all", enableStart);

    expect(registrations).toEqual([
      "components/NotificationPermissionControl.tsx",
    ]);
    expect(enableStart).toBeGreaterThanOrEqual(0);
    expect(registerAt).toBeGreaterThan(enableStart);
    expect(permissionAt).toBeGreaterThan(registerAt);
    expect(firstAwaitAt).toBeGreaterThan(permissionAt);
  });

  it("serves the root-scoped worker without stale caching and mounts badge reconciliation", () => {
    const config = read("next.config.ts");
    const layout = read("app/layout.tsx");

    expect(config).toContain('source: "/sw.js"');
    expect(config).toContain('key: "Service-Worker-Allowed"');
    expect(config).toContain('value: "no-cache, no-store, must-revalidate"');
    expect(layout).toContain("<NotificationBadgeRuntime />");
  });

  it("keeps permission and lock-screen copy complete in all eight locales", () => {
    const requiredKeys = [
      "pushTitle",
      "pushDescription",
      "pushChecking",
      "pushEnable",
      "pushDisable",
      "pushEnabling",
      "pushDisabling",
      "pushEnabled",
      "pushDisabled",
      "pushBlocked",
      "pushInstallRequired",
      "pushUnsupported",
      "pushUnavailable",
      "pushPrivacy",
    ];

    expect(SUPPORTED_LOCALES).toHaveLength(8);
    for (const locale of SUPPORTED_LOCALES) {
      const dictionary = read(
        join("lib", "i18n", "dictionaries", locale, "notifications.ts")
      );
      for (const key of requiredKeys) {
        expect(dictionary, `${locale}/${key}`).toContain(`${key}:`);
      }
    }
  });
});
