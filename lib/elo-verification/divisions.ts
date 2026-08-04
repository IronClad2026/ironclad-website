import "server-only";

export type IronCladDivision = "Academy" | "Challenge" | "Main / Pro";

export type IronCladDivisionResult =
  | { ok: true; division: IronCladDivision }
  | { ok: false; reason: "invalid_elo" };

export function getIronCladDivision(elo: number): IronCladDivisionResult {
  if (!Number.isSafeInteger(elo) || elo < 0) {
    return { ok: false, reason: "invalid_elo" };
  }

  if (elo < 1_100) {
    return { ok: true, division: "Academy" };
  }

  if (elo < 1_400) {
    return { ok: true, division: "Challenge" };
  }

  return { ok: true, division: "Main / Pro" };
}
