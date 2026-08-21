// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfigurationMock = vi.hoisted(() => vi.fn());
const checkOwnershipMock = vi.hoisted(() => vi.fn());
const saveSubscriptionMock = vi.hoisted(() => vi.fn());
const deleteSubscriptionMock = vi.hoisted(() => vi.fn());
const reconcileBadgeMock = vi.hoisted(() => vi.fn());
const closeDisplayedNotificationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/notifications/actions", () => ({
  checkWebPushSubscriptionOwnership: checkOwnershipMock,
  deleteWebPushSubscription: deleteSubscriptionMock,
  getNotificationPushConfiguration: getConfigurationMock,
  saveWebPushSubscription: saveSubscriptionMock,
}));
vi.mock("@/lib/app-badge", () => ({
  closeDisplayedIronCladNotifications: closeDisplayedNotificationsMock,
  requestNotificationBadgeReconciliation: reconcileBadgeMock,
}));

import NotificationPermissionControl from "@/components/NotificationPermissionControl";

type BrowserSetup = {
  getRegistration: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
};

describe("notification permission control", () => {
  beforeEach(() => {
    getConfigurationMock.mockResolvedValue({
      ok: true,
      vapidPublicKey: "AQID",
    });
    checkOwnershipMock.mockResolvedValue({ ok: true, owned: true });
    saveSubscriptionMock.mockResolvedValue({ ok: true });
    deleteSubscriptionMock.mockResolvedValue({ ok: true });
    closeDisplayedNotificationsMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window, "matchMedia");
    Reflect.deleteProperty(navigator, "serviceWorker");
    Reflect.deleteProperty(navigator, "standalone");
    Reflect.deleteProperty(navigator, "userAgent");
    Reflect.deleteProperty(navigator, "platform");
    Reflect.deleteProperty(navigator, "maxTouchPoints");
  });

  it("does not register a worker or request permission during render", async () => {
    const browser = installBrowserMocks({ permission: "default" });

    render(<NotificationPermissionControl />);

    await screen.findByRole("button", { name: "Enable notifications" });
    expect(browser.getRegistration).toHaveBeenCalledWith("/");
    expect(browser.register).not.toHaveBeenCalled();
    expect(browser.requestPermission).not.toHaveBeenCalled();
    expect(getConfigurationMock).not.toHaveBeenCalled();
  });

  it("reports generic unsupported browsers without exposing an enable action", async () => {
    render(<NotificationPermissionControl />);

    await screen.findByText("This browser does not support Web Push.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(getConfigurationMock).not.toHaveBeenCalled();
  });

  it("registers, requests permission, subscribes, then persists on the enable gesture", async () => {
    const order: string[] = [];
    const subscription = createSubscription({
      onSubscribe: () => order.push("subscribe"),
    });
    const browser = installBrowserMocks({
      permission: "default",
      registration: subscription.registration,
      order,
    });
    getConfigurationMock.mockImplementation(async () => {
      order.push("configuration");
      return { ok: true, vapidPublicKey: "AQID" };
    });
    saveSubscriptionMock.mockImplementation(async () => {
      order.push("save");
      return { ok: true };
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByText("Notifications are enabled on this device.");
    expect(order).toEqual([
      "configuration",
      "register",
      "permission",
      "subscribe",
      "save",
    ]);
    expect(browser.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(saveSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/push/subscription-one",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
      })
    );
    expect(reconcileBadgeMock).toHaveBeenCalledOnce();
  });

  it("requests permission in the enable gesture before awaiting server configuration", async () => {
    let resolveConfiguration!: (value: {
      ok: true;
      vapidPublicKey: string;
    }) => void;
    getConfigurationMock.mockReturnValue(
      new Promise((resolve) => {
        resolveConfiguration = resolve;
      })
    );
    const subscription = createSubscription();
    const browser = installBrowserMocks({
      permission: "default",
      registration: subscription.registration,
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    expect(browser.register).toHaveBeenCalledOnce();
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();

    resolveConfiguration({ ok: true, vapidPublicKey: "AQID" });

    await screen.findByText("Notifications are enabled on this device.");
    expect(saveSubscriptionMock).toHaveBeenCalledOnce();
  });

  it("leaves notifications off when the permission prompt is dismissed", async () => {
    const browser = installBrowserMocks({
      permission: "default",
      requestedPermission: "default",
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByText("Notifications are off on this device.");
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();
    expect(reconcileBadgeMock).not.toHaveBeenCalled();
  });

  it("reports a permission denial returned by the deliberate prompt", async () => {
    const browser = installBrowserMocks({
      permission: "default",
      requestedPermission: "denied",
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByText(
      "Notifications are blocked in your browser or device settings."
    );
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Enable notifications" })
    ).toBeDisabled();
  });

  it("contains service-worker registration failure without persisting", async () => {
    const browser = installBrowserMocks({ permission: "default" });
    browser.register.mockRejectedValueOnce(new Error("REGISTER_FAILED"));

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByRole("alert");
    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();
    expect(reconcileBadgeMock).not.toHaveBeenCalled();
  });

  it("rolls back a newly-created browser subscription if persistence fails", async () => {
    const subscription = createSubscription();
    installBrowserMocks({
      permission: "granted",
      registration: subscription.registration,
    });
    saveSubscriptionMock.mockResolvedValue({
      ok: false,
      code: "unavailable",
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByRole("alert");
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(reconcileBadgeMock).not.toHaveBeenCalled();
  });

  it("stops a definitively unowned subscription on mount without deleting another account's row", async () => {
    const subscription = createSubscription({ existing: true });
    const browser = installBrowserMocks({
      permission: "granted",
      registration: subscription.registration,
      existingRegistration: true,
    });
    checkOwnershipMock.mockResolvedValue({ ok: true, owned: false });

    render(<NotificationPermissionControl />);

    await screen.findByText("Notifications are off on this device.");
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(deleteSubscriptionMock).not.toHaveBeenCalled();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();
    expect(browser.register).not.toHaveBeenCalled();
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledOnce();
    expect(reconcileBadgeMock).toHaveBeenCalledOnce();
  });

  it("closes stale displayed notifications for a registered worker without a subscription", async () => {
    installBrowserMocks({
      permission: "granted",
      existingRegistration: true,
    });

    render(<NotificationPermissionControl />);

    await screen.findByText("Notifications are off on this device.");
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledOnce();
    expect(deleteSubscriptionMock).not.toHaveBeenCalled();
    expect(saveSubscriptionMock).not.toHaveBeenCalled();
  });

  it("repairs an unowned browser subscription without taking another account's endpoint", async () => {
    const order: string[] = [];
    const subscription = createSubscription({
      existing: true,
      replacementEndpoint:
        "https://fcm.googleapis.com/push/subscription-replacement",
      onSubscribe: () => order.push("subscribe"),
      onUnsubscribe: () => order.push("unsubscribe"),
    });
    installBrowserMocks({
      permission: "granted",
      registration: subscription.registration,
      existingRegistration: true,
    });
    checkOwnershipMock.mockResolvedValue({ ok: true, owned: false });
    closeDisplayedNotificationsMock.mockImplementation(async () => {
      order.push("close");
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable notifications" })
    );

    await screen.findByText("Notifications are enabled on this device.");
    expect(order).toEqual(["unsubscribe", "close", "subscribe"]);
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledOnce();
    expect(saveSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          "https://fcm.googleapis.com/push/subscription-replacement",
      })
    );
  });

  it("deletes trusted server ownership before unsubscribing the browser", async () => {
    const order: string[] = [];
    const subscription = createSubscription({
      existing: true,
      onUnsubscribe: () => order.push("unsubscribe"),
    });
    installBrowserMocks({
      permission: "granted",
      registration: subscription.registration,
      existingRegistration: true,
    });
    deleteSubscriptionMock.mockImplementation(async () => {
      order.push("delete");
      return { ok: true };
    });

    render(<NotificationPermissionControl />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Disable on this device" })
    );

    await screen.findByText("Notifications are off on this device.");
    expect(order).toEqual(["delete", "unsubscribe"]);
    expect(deleteSubscriptionMock).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/push/subscription-one"
    );
    expect(closeDisplayedNotificationsMock).toHaveBeenCalledOnce();
    expect(reconcileBadgeMock).toHaveBeenCalledOnce();
  });

  it("reports a denied browser permission without retrying it automatically", async () => {
    const browser = installBrowserMocks({ permission: "denied" });

    render(<NotificationPermissionControl />);

    await screen.findByText(
      "Notifications are blocked in your browser or device settings."
    );
    expect(
      screen.getByRole("button", { name: "Enable notifications" })
    ).toBeDisabled();
    expect(browser.requestPermission).not.toHaveBeenCalled();
  });

  it("explains the Home Screen requirement on an unsupported iPhone browser", async () => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default", requestPermission: vi.fn() },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn() },
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)",
    });
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });

    render(<NotificationPermissionControl />);

    await screen.findByText(
      "On iPhone or iPad, install IronClad on your Home Screen before enabling notifications."
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

function installBrowserMocks({
  permission,
  requestedPermission = "granted",
  registration = createSubscription().registration,
  existingRegistration = false,
  order = [],
}: {
  permission: NotificationPermission;
  requestedPermission?: NotificationPermission;
  registration?: ServiceWorkerRegistration;
  existingRegistration?: boolean;
  order?: string[];
}): BrowserSetup {
  const requestPermission = vi.fn().mockImplementation(async () => {
    order.push("permission");
    return requestedPermission;
  });
  const notification = {
    permission,
    requestPermission,
  };
  const getRegistration = vi
    .fn()
    .mockResolvedValue(existingRegistration ? registration : undefined);
  const register = vi.fn().mockImplementation(async () => {
    order.push("register");
    return registration;
  });

  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: notification,
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register },
  });

  return { getRegistration, register, requestPermission };
}

function createSubscription({
  existing = false,
  replacementEndpoint,
  onSubscribe = () => undefined,
  onUnsubscribe = () => undefined,
}: {
  existing?: boolean;
  replacementEndpoint?: string;
  onSubscribe?: () => void;
  onUnsubscribe?: () => void;
} = {}) {
  let existingActive = existing;
  const unsubscribe = vi.fn().mockImplementation(async () => {
    existingActive = false;
    onUnsubscribe();
    return true;
  });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/push/subscription-one",
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/push/subscription-one",
      expirationTime: null,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    }),
    unsubscribe,
  } as unknown as PushSubscription;
  const replacementSubscription = replacementEndpoint
    ? ({
        endpoint: replacementEndpoint,
        toJSON: () => ({
          endpoint: replacementEndpoint,
          expirationTime: null,
          keys: { p256dh: "replacement-p256dh", auth: "replacement-auth" },
        }),
        unsubscribe: vi.fn().mockResolvedValue(true),
      } as unknown as PushSubscription)
    : subscription;
  const getSubscription = vi.fn(() =>
    Promise.resolve(existingActive ? subscription : null)
  );
  const subscribe = vi.fn().mockImplementation(async () => {
    onSubscribe();
    return replacementSubscription;
  });
  const registration = {
    pushManager: { getSubscription, subscribe },
  } as unknown as ServiceWorkerRegistration;

  return {
    registration,
    subscription,
    unsubscribe,
    replacementSubscription,
  };
}
