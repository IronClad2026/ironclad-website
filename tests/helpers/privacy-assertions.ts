import { expect } from "vitest";

export type ExactShape =
  | "value"
  | {
      array: ExactShape;
    }
  | {
      object: Record<string, ExactShape>;
    };

export const RESULT_PRIVATE_KEYS = [
  "actorClerkUserId",
  "actor_clerk_user_id",
  "clerkUserId",
  "clerk_user_id",
  "noShowResolvedBy",
  "no_show_resolved_by",
  "officialResultDecidedBy",
  "official_result_decided_by",
  "proofPaths",
  "proof_paths",
  "recipientClerkUserId",
  "recipient_clerk_user_id",
  "replayContentHash",
  "replayStoragePath",
  "replay_content_hash",
  "replay_path",
  "replay_paths",
  "replay_storage_path",
  "reviewedBy",
  "reviewed_by",
  "screenshotStoragePath",
  "screenshot_path",
  "screenshot_paths",
  "screenshot_storage_path",
  "submittedByClerkUserId",
  "submitted_by_clerk_user_id",
] as const;

export function expectExactShape(
  actual: unknown,
  shape: ExactShape,
  path = "$"
) {
  if (shape === "value") {
    return;
  }

  if ("array" in shape) {
    expect(Array.isArray(actual), `${path} must be an array`).toBe(true);

    for (const [index, value] of (actual as unknown[]).entries()) {
      expectExactShape(value, shape.array, `${path}[${index}]`);
    }
    return;
  }

  expect(
    typeof actual === "object" &&
      actual !== null &&
      !Array.isArray(actual) &&
      !(actual instanceof Map) &&
      !(actual instanceof Set),
    `${path} must be a plain object`
  ).toBe(true);

  const record = actual as Record<string, unknown>;
  const expectedKeys = Object.keys(shape.object).sort();
  expect(Object.keys(record).sort(), `${path} has unexpected keys`).toEqual(
    expectedKeys
  );

  for (const [key, childShape] of Object.entries(shape.object)) {
    expectExactShape(record[key], childShape, `${path}.${key}`);
  }
}

export function expectNoSensitiveBrowserData(
  actual: unknown,
  forbiddenValues: readonly string[] = []
) {
  const privateKeys = new Set<string>(RESULT_PRIVATE_KEYS);

  visit(actual, "$", (key, value, path) => {
    if (key !== null) {
      expect(
        privateKeys.has(key),
        `${path} contains private key ${key}`
      ).toBe(false);
    }

    if (typeof value === "string") {
      for (const forbiddenValue of forbiddenValues.filter(Boolean)) {
        expect(
          value.includes(forbiddenValue),
          `${path} contains private value ${forbiddenValue}`
        ).toBe(false);
      }
    }
  });

  const serialized = serializePrivacyValue(actual);
  for (const forbiddenValue of forbiddenValues.filter(Boolean)) {
    expect(serialized).not.toContain(forbiddenValue);
  }
}

export function serializePrivacyValue(actual: unknown) {
  return JSON.stringify(actual, (_key, value) => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }

    if (value instanceof Set) {
      return [...value];
    }

    return value;
  });
}

function visit(
  value: unknown,
  path: string,
  assertion: (
    key: string | null,
    value: unknown,
    path: string
  ) => void
) {
  assertion(null, value, path);

  if (value instanceof Map) {
    for (const [key, child] of value) {
      const childPath = `${path}.<map:${String(key)}>`;
      assertion(String(key), child, childPath);
      visit(child, childPath, assertion);
    }
    return;
  }

  if (value instanceof Set) {
    for (const [index, child] of [...value].entries()) {
      visit(child, `${path}.<set:${index}>`, assertion);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      visit(child, `${path}[${index}]`, assertion);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    assertion(key, child, childPath);
    visit(child, childPath, assertion);
  }
}
