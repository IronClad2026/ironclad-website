/** Immutable competition semantics. Display names are never accounting keys. */
export type DivisionModelVersion = "legacy_three_v1" | "four_division_v1";
export type PlayableDivisionId = "academy" | "challenge" | "main" | "main_progression" | "pro";
export type DivisionName = "Academy" | "Challenge" | "Main" | "Pro";
export type VerifiedDivision = DivisionName | "Main / Pro";

export const LEGACY_DIVISION_MODEL: DivisionModelVersion = "legacy_three_v1";
export const CURRENT_DIVISION_MODEL: DivisionModelVersion = "four_division_v1";

export function parseDivisionModelVersion(value: unknown): DivisionModelVersion | null {
  return value === "legacy_three_v1" || value === "four_division_v1" ? value : null;
}

/** Missing metadata only occurs in pre-migration historical projections. Unknown values fail closed. */
export function requireDivisionModelVersion(value: unknown): DivisionModelVersion {
  const model = value === undefined ? LEGACY_DIVISION_MODEL : parseDivisionModelVersion(value);
  if (!model) throw new Error("Unknown tournament division model.");
  return model;
}

export function resolveDivisionId(model: DivisionModelVersion, name: string): PlayableDivisionId | null {
  if (!parseDivisionModelVersion(model)) return null;
  if (name === "Academy") return "academy";
  if (name === "Challenge") return "challenge";
  if (name === "Main") return model === LEGACY_DIVISION_MODEL ? "main" : "main_progression";
  if (name === "Pro" && model === CURRENT_DIVISION_MODEL) return "pro";
  return null;
}

export function getDivisionDisplayName(model: DivisionModelVersion, name: string): VerifiedDivision | null {
  const id = resolveDivisionId(model, name);
  if (!id) return null;
  return id === "main" ? "Main / Pro" : name as DivisionName;
}

export function getDivisionForElo(elo: number, model: DivisionModelVersion): VerifiedDivision | null {
  if (!parseDivisionModelVersion(model) || !Number.isSafeInteger(elo) || elo < 0) return null;
  if (elo < 1100) return "Academy";
  if (elo < 1400) return "Challenge";
  if (model === LEGACY_DIVISION_MODEL) return "Main / Pro";
  return elo < 1700 ? "Main" : "Pro";
}

export function getRelicCalculationVersion(model: DivisionModelVersion) {
  if (!parseDivisionModelVersion(model)) throw new Error("Unknown tournament division model.");
  return model === LEGACY_DIVISION_MODEL ? "relic-highest-1v1-v1" : "relic-highest-1v1-v2";
}

/** Classify stored evidence by its original contract; never reinterpret a saved snapshot. */
export function getDivisionModelForCalculationVersion(version: unknown): DivisionModelVersion | null {
  if (version === "relic-highest-1v1-v1" || version === "phase4-staging-fixture-v1" ||
    version === "staging-synthetic-academy-v1" || version === "staging-synthetic-v1") return LEGACY_DIVISION_MODEL;
  if (version === "relic-highest-1v1-v2" || version === "staging-synthetic-v2") return CURRENT_DIVISION_MODEL;
  return null;
}
