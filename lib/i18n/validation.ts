import type { DictionaryTree } from "@/lib/i18n/types";
import { getInterpolationVariables } from "@/lib/i18n/translate";

export type DictionaryValidationIssueCode =
  | "MISSING_KEY"
  | "EXTRA_KEY"
  | "BLANK_VALUE"
  | "INVALID_VALUE"
  | "INTERPOLATION_MISMATCH";

export type DictionaryValidationIssue = {
  code: DictionaryValidationIssueCode;
  path: string;
  detail: string;
};

type FlatDictionaryValue = string | "__invalid__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenDictionary(
  value: unknown,
  path = "",
  result = new Map<string, FlatDictionaryValue>()
): Map<string, FlatDictionaryValue> {
  if (typeof value === "string") {
    result.set(path, value);
    return result;
  }

  if (!isRecord(value)) {
    result.set(path, "__invalid__");
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    flattenDictionary(child, childPath, result);
  }

  return result;
}

export function validateDictionary(
  english: DictionaryTree,
  candidate: unknown
): DictionaryValidationIssue[] {
  const issues: DictionaryValidationIssue[] = [];
  const englishLeaves = flattenDictionary(english);
  const candidateLeaves = flattenDictionary(candidate);

  for (const [path, englishValue] of englishLeaves) {
    if (!candidateLeaves.has(path)) {
      issues.push({
        code: "MISSING_KEY",
        path,
        detail: "Translation key is missing.",
      });
      continue;
    }

    const candidateValue = candidateLeaves.get(path);

    if (candidateValue === "__invalid__") {
      issues.push({
        code: "INVALID_VALUE",
        path,
        detail: "Translation values must be strings or nested objects.",
      });
      continue;
    }

    if (typeof candidateValue !== "string") {
      continue;
    }

    if (candidateValue.trim().length === 0) {
      issues.push({
        code: "BLANK_VALUE",
        path,
        detail: "Translation value is blank.",
      });
    }

    if (typeof englishValue === "string") {
      const englishVariables = getInterpolationVariables(englishValue);
      const candidateVariables = getInterpolationVariables(candidateValue);

      if (englishVariables.join("|") !== candidateVariables.join("|")) {
        issues.push({
          code: "INTERPOLATION_MISMATCH",
          path,
          detail: `Expected {${englishVariables.join(", ")}} but found {${candidateVariables.join(", ")}}.`,
        });
      }
    }
  }

  for (const path of candidateLeaves.keys()) {
    if (!englishLeaves.has(path)) {
      issues.push({
        code: "EXTRA_KEY",
        path,
        detail: "Translation key does not exist in the English source.",
      });
    }
  }

  return issues;
}

export function assertDictionaryValid(
  english: DictionaryTree,
  candidate: unknown,
  label: string
): void {
  const issues = validateDictionary(english, candidate);

  if (issues.length === 0) {
    return;
  }

  const detail = issues
    .map((issue) => `${issue.code} ${issue.path}: ${issue.detail}`)
    .join("\n");

  throw new Error(`Invalid ${label} dictionary:\n${detail}`);
}
