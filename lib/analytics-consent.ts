export const ANALYTICS_CONSENT_STORAGE_KEY =
  "ironclad_analytics_consent" as const;
export const ANALYTICS_CONSENT_CHANGE_EVENT =
  "ironclad:analytics-consent-change" as const;

export const ANALYTICS_CONSENT_DECISIONS = [
  "granted",
  "declined",
] as const;

export type AnalyticsConsentDecision =
  (typeof ANALYTICS_CONSENT_DECISIONS)[number];

type ConsentStorageReader = Pick<Storage, "getItem">;
type ConsentStorageWriter = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

let currentDocumentForcedOff = false;

export function parseAnalyticsConsentDecision(
  value: unknown
): AnalyticsConsentDecision | null {
  return value === "granted" || value === "declined" ? value : null;
}

export function readAnalyticsConsent(
  storage?: ConsentStorageReader | null
): AnalyticsConsentDecision | null {
  if (currentDocumentForcedOff) return null;

  const source = storage ?? getBrowserStorage();

  if (!source) return null;

  try {
    return parseAnalyticsConsentDecision(
      source.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(
  decision: AnalyticsConsentDecision,
  storage?: ConsentStorageWriter | null,
  eventTarget?: Window | null
): boolean {
  const source = storage ?? getBrowserStorage();
  const target = eventTarget ?? getBrowserWindow();

  if (!source || !parseAnalyticsConsentDecision(decision)) {
    currentDocumentForcedOff = true;
    dispatchAnalyticsConsentChange(null, target);
    return false;
  }

  try {
    source.setItem(ANALYTICS_CONSENT_STORAGE_KEY, decision);
    currentDocumentForcedOff = false;
  } catch {
    try {
      source.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    } catch {
      // The in-memory notification below still makes this tab fail closed.
    }

    currentDocumentForcedOff = true;
    dispatchAnalyticsConsentChange(null, target);
    return false;
  }

  dispatchAnalyticsConsentChange(decision, target);
  return true;
}

export function subscribeToAnalyticsConsent(
  onChange: (decision: AnalyticsConsentDecision | null) => void,
  eventTarget?: Window | null
): () => void {
  const target = eventTarget ?? getBrowserWindow();

  if (!target) return () => undefined;

  const handleSameTabChange = (event: Event) => {
    const decision =
      event instanceof CustomEvent
        ? parseAnalyticsConsentDecision(event.detail)
        : null;
    onChange(decision);
  };

  const handleCrossTabChange = (event: StorageEvent) => {
    if (
      event.key !== ANALYTICS_CONSENT_STORAGE_KEY &&
      event.key !== null
    ) {
      return;
    }

    currentDocumentForcedOff = false;
    onChange(parseAnalyticsConsentDecision(event.newValue));
  };

  target.addEventListener(
    ANALYTICS_CONSENT_CHANGE_EVENT,
    handleSameTabChange
  );
  target.addEventListener("storage", handleCrossTabChange);

  return () => {
    target.removeEventListener(
      ANALYTICS_CONSENT_CHANGE_EVENT,
      handleSameTabChange
    );
    target.removeEventListener("storage", handleCrossTabChange);
  };
}

function dispatchAnalyticsConsentChange(
  decision: AnalyticsConsentDecision | null,
  target: Window | null
) {
  if (!target) return;

  target.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_CHANGE_EVENT, {
      detail: decision,
    })
  );
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getBrowserWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}
