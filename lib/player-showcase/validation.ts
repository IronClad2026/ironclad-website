export const CURRENT_THOUGHT_MAX_CODE_POINTS = 160;

// Tabs and all supported line breaks become spaces before control validation.
// ZWJ/ZWNJ and ordinary RTL letters remain valid multilingual content.
const LINE_BREAKS_AND_TABS = /[\t\r\n\u2028\u2029]/gu;
const DISALLOWED_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isShowcaseUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isShowcaseRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function countCurrentThoughtCodePoints(value: string): number {
  return Array.from(value.normalize("NFC").replace(LINE_BREAKS_AND_TABS, " ").trim()).length;
}

export function validateCurrentThought(value: unknown):
  | { ok: true; value: string | null; count: number }
  | { ok: false; code: "thoughtTooLong" | "thoughtInvalid"; count: number } {
  if (value === null) return { ok: true, value: null, count: 0 };
  if (typeof value !== "string") return { ok: false, code: "thoughtInvalid", count: 0 };
  const normalized = value.normalize("NFC").replace(LINE_BREAKS_AND_TABS, " ");
  const count = Array.from(normalized.trim()).length;
  // Check before trim so forbidden leading/trailing controls cannot disappear.
  if (DISALLOWED_CONTROLS.test(normalized)) return { ok: false, code: "thoughtInvalid", count };
  if (count > CURRENT_THOUGHT_MAX_CODE_POINTS) return { ok: false, code: "thoughtTooLong", count };
  return { ok: true, value: normalized.trim() || null, count };
}
