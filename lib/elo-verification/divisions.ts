import "server-only";

import { CURRENT_DIVISION_MODEL, getDivisionForElo, type DivisionModelVersion, type VerifiedDivision } from "@/lib/division-model";

export type IronCladDivision = VerifiedDivision;

export type IronCladDivisionResult =
  | { ok: true; division: IronCladDivision }
  | { ok: false; reason: "invalid_elo" };

export function getIronCladDivision(elo: number, model: DivisionModelVersion = CURRENT_DIVISION_MODEL): IronCladDivisionResult {
  const division = getDivisionForElo(elo, model);
  return division ? { ok: true, division } : { ok: false, reason: "invalid_elo" };
}
