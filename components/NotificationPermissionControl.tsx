"use client";

import { BellOff, BellRing, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  checkWebPushSubscriptionOwnership,
  deleteWebPushSubscription,
  getNotificationPushConfiguration,
  saveWebPushSubscription,
} from "@/app/notifications/actions";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import notificationsEnglish from "@/lib/i18n/dictionaries/en/notifications";
import {
  closeDisplayedIronCladNotifications,
  requestNotificationBadgeReconciliation,
} from "@/lib/app-badge";

type PermissionPhase =
  | "checking"
  | "ready"
  | "enabling"
  | "disabling"
  | "blocked"
  | "installation_required"
  | "unsupported"
  | "error";

type ExistingSubscription = {
  endpoint: string;
  subscription: PushSubscription;
};

export default function NotificationPermissionControl({
  className = "",
}: {
  className?: string;
}) {
  const t = useOptionalTranslations("notifications", notificationsEnglish);
  const [phase, setPhase] = useState<PermissionPhase>("checking");
  const [existingSubscription, setExistingSubscription] =
    useState<ExistingSubscription | null>(null);

  const inspectBrowserState = useCallback(async () => {
    if (!supportsWebPush()) {
      setPhase(
        requiresAppleHomeScreenInstall()
          ? "installation_required"
          : "unsupported"
      );
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        const ownership = await checkWebPushSubscriptionOwnership(
          subscription.endpoint
        );
        if (!ownership.ok) {
          setExistingSubscription(null);
          setPhase("error");
          return;
        }

        if (!ownership.owned) {
          const removed = await subscription.unsubscribe();
          if (!removed) {
            setExistingSubscription(null);
            setPhase("error");
            return;
          }
          setExistingSubscription(null);
          void closeDisplayedIronCladNotifications();
          requestNotificationBadgeReconciliation();
        } else {
          setExistingSubscription({
            endpoint: subscription.endpoint,
            subscription,
          });
        }
      } else {
        setExistingSubscription(null);
        if (registration) {
          void closeDisplayedIronCladNotifications();
        }
      }

      setPhase(Notification.permission === "denied" ? "blocked" : "ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void inspectBrowserState();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [inspectBrowserState]);

  const enableNotifications = async () => {
    if (phase === "enabling" || phase === "disabling" || !supportsWebPush()) {
      return;
    }

    setPhase("enabling");
    let createdSubscription: PushSubscription | null = null;

    try {
      const configurationPromise = getNotificationPushConfiguration();
      const registrationPromise = navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      const permissionPromise =
        Notification.permission === "granted"
          ? Promise.resolve<NotificationPermission>("granted")
          : Notification.requestPermission();
      const [configuration, registration, permission] = await Promise.all([
        configurationPromise,
        registrationPromise,
        permissionPromise,
      ]);

      if (!configuration.ok) {
        setPhase("error");
        return;
      }

      if (permission !== "granted") {
        setPhase(permission === "denied" ? "blocked" : "ready");
        return;
      }

      let priorSubscription = await registration.pushManager.getSubscription();
      if (priorSubscription) {
        const ownership = await checkWebPushSubscriptionOwnership(
          priorSubscription.endpoint
        );
        if (!ownership.ok) {
          setPhase("error");
          return;
        }

        if (!ownership.owned) {
          const removed = await priorSubscription.unsubscribe();
          if (!removed) {
            setPhase("error");
            return;
          }
          priorSubscription = null;
          await closeDisplayedIronCladNotifications();
          requestNotificationBadgeReconciliation();
        }
      }

      const subscription =
        priorSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(
            configuration.vapidPublicKey
          ),
        }));
      if (!priorSubscription) {
        createdSubscription = subscription;
      }

      const serialized = subscription.toJSON();
      if (
        !serialized.endpoint ||
        !serialized.keys?.p256dh ||
        !serialized.keys.auth
      ) {
        throw new Error("INVALID_PUSH_SUBSCRIPTION");
      }

      const saved = await saveWebPushSubscription({
        endpoint: serialized.endpoint,
        expirationTime: serialized.expirationTime,
        keys: {
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        },
      });
      if (!saved.ok) {
        if (createdSubscription) {
          await createdSubscription.unsubscribe().catch(() => false);
        }
        setPhase("error");
        return;
      }

      setExistingSubscription({
        endpoint: subscription.endpoint,
        subscription,
      });
      setPhase("ready");
      requestNotificationBadgeReconciliation();
    } catch {
      if (createdSubscription) {
        await createdSubscription.unsubscribe().catch(() => false);
      }
      setPhase("error");
    }
  };

  const disableNotifications = async () => {
    if (
      phase === "enabling" ||
      phase === "disabling" ||
      !existingSubscription
    ) {
      return;
    }

    setPhase("disabling");

    try {
      const deleted = await deleteWebPushSubscription(
        existingSubscription.endpoint
      );
      if (!deleted.ok) {
        setPhase("error");
        return;
      }

      const unsubscribed = await existingSubscription.subscription.unsubscribe();
      if (!unsubscribed) {
        setPhase("error");
        return;
      }

      setExistingSubscription(null);
      setPhase(Notification.permission === "denied" ? "blocked" : "ready");
      void closeDisplayedIronCladNotifications();
      requestNotificationBadgeReconciliation();
    } catch {
      setPhase("error");
    }
  };

  const enabled = existingSubscription !== null;
  const busy = phase === "enabling" || phase === "disabling";
  const status = getStatusCopy({ enabled, phase, t });

  return (
    <section
      className={`border border-white/10 bg-black/25 p-4 ${className}`}
      aria-label={t("center.pushTitle")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {enabled ? (
              <BellRing className="h-4 w-4 text-orange-300" aria-hidden="true" />
            ) : (
              <BellOff className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            )}
            <h3 className="text-sm font-black text-white">
              {t("center.pushTitle")}
            </h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {t("center.pushDescription")}
          </p>
          <p
            className={`mt-2 text-xs font-semibold ${
              phase === "error" || phase === "blocked"
                ? "text-red-300"
                : enabled
                  ? "text-orange-200"
                  : "text-zinc-500"
            }`}
            role={phase === "error" ? "alert" : "status"}
          >
            {status}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-zinc-600">
            {t("center.pushPrivacy")}
          </p>
        </div>

        {phase !== "checking" &&
          phase !== "installation_required" &&
          phase !== "unsupported" && (
          <button
            type="button"
            onClick={
              enabled ? disableNotifications : enableNotifications
            }
            disabled={busy || (phase === "blocked" && !enabled)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {phase === "enabling"
              ? t("center.pushEnabling")
              : phase === "disabling"
                ? t("center.pushDisabling")
                : enabled
                  ? t("center.pushDisable")
                  : t("center.pushEnable")}
          </button>
        )}
      </div>
    </section>
  );
}

function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function requiresAppleHomeScreenInstall() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const appleMobileDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!appleMobileDevice) {
    return false;
  }

  const standaloneNavigator = navigator as Navigator & {
    standalone?: boolean;
  };
  const installed =
    standaloneNavigator.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches);

  return !installed;
}

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);

  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function getStatusCopy({
  enabled,
  phase,
  t,
}: {
  enabled: boolean;
  phase: PermissionPhase;
  t: (path: string) => string;
}) {
  if (phase === "checking") return t("center.pushChecking");
  if (phase === "installation_required") {
    return t("center.pushInstallRequired");
  }
  if (phase === "unsupported") return t("center.pushUnsupported");
  if (phase === "blocked") return t("center.pushBlocked");
  if (phase === "error") return t("center.pushUnavailable");
  return enabled ? t("center.pushEnabled") : t("center.pushDisabled");
}
