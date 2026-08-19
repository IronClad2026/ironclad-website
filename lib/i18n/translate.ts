import type { DictionaryTree, MessageValues } from "@/lib/i18n/types";

const INTERPOLATION_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function getInterpolationVariables(template: string): string[] {
  const variables = new Set<string>();

  for (const match of template.matchAll(INTERPOLATION_PATTERN)) {
    variables.add(match[1]);
  }

  return [...variables].sort();
}

export function interpolateMessage(
  template: string,
  values: MessageValues = {}
): string {
  return template.replace(INTERPOLATION_PATTERN, (placeholder, variable) => {
    if (!Object.hasOwn(values, variable)) {
      return placeholder;
    }

    return String(values[variable]);
  });
}

export function getDictionaryMessage(
  dictionary: DictionaryTree,
  path: string
): string | undefined {
  const segments = path.split(".").filter(Boolean);
  let current: string | DictionaryTree = dictionary;

  for (const segment of segments) {
    if (typeof current === "string" || !Object.hasOwn(current, segment)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

export function translate(
  dictionary: DictionaryTree,
  path: string,
  values: MessageValues = {}
): string {
  const template = getDictionaryMessage(dictionary, path);

  if (template === undefined) {
    return path;
  }

  return interpolateMessage(template, values);
}
