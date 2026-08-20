"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  readAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from "@/lib/analytics-consent";
import { sanitizeAnalyticsEventUrl } from "@/lib/analytics-route-policy";

type ConsentAwareVercelAnalyticsProps = {
  enabled: boolean;
  reloadCurrentPage?: () => void;
};

export default function ConsentAwareVercelAnalytics(
  props: ConsentAwareVercelAnalyticsProps
) {
  return (
    <Suspense fallback={null}>
      <ConsentAwareVercelAnalyticsRuntime {...props} />
    </Suspense>
  );
}

function ConsentAwareVercelAnalyticsRuntime({
  enabled,
  reloadCurrentPage = reloadBrowserDocument,
}: ConsentAwareVercelAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hash = useSyncExternalStore(
    subscribeToHashChanges,
    readBrowserHash,
    readServerHash
  );
  const decision = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    () => null
  );
  const currentRouteAllowed = isCurrentRouteAllowed(
    pathname,
    searchParams.toString(),
    hash
  );
  const active = enabled && decision === "granted" && currentRouteAllowed;
  const runtimeMountedInDocument = useRef(active);

  useEffect(() => {
    if (active) {
      runtimeMountedInDocument.current = true;
      return;
    }

    if (runtimeMountedInDocument.current && decision === "declined") {
      runtimeMountedInDocument.current = false;
      reloadCurrentPage();
    }
  }, [active, decision, reloadCurrentPage]);

  const beforeSend = useCallback((event: BeforeSendEvent) => {
    if (
      event.type !== "pageview" ||
      readAnalyticsConsent() !== "granted" ||
      typeof window === "undefined"
    ) {
      return null;
    }

    const sanitizedUrl = sanitizeAnalyticsEventUrl(
      event.url,
      window.location.origin
    );

    return sanitizedUrl
      ? ({ type: "pageview", url: sanitizedUrl } satisfies BeforeSendEvent)
      : null;
  }, []);

  return active ? <Analytics mode="production" beforeSend={beforeSend} /> : null;
}

function subscribeToHashChanges(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readBrowserHash() {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function readServerHash() {
  return "";
}

function isCurrentRouteAllowed(
  pathname: string | null,
  serializedSearchParams: string,
  hash: string
) {
  if (
    typeof window === "undefined" ||
    window.location.pathname !== pathname ||
    window.location.search.slice(1) !== serializedSearchParams ||
    window.location.hash !== hash
  ) {
    return false;
  }

  return (
    sanitizeAnalyticsEventUrl(
      window.location.href,
      window.location.origin
    ) !== null
  );
}

function reloadBrowserDocument() {
  window.location.reload();
}
