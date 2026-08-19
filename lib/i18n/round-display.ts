import type { MessageValues } from "@/lib/i18n/types";

export type RoundDisplayTranslator = (
  path: string,
  values?: MessageValues
) => string;

export function localizeBracketRoundName(
  roundName: string,
  t: RoundDisplayTranslator
) {
  const normalized = roundName
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");

  if (normalized === "grand final") {
    return t("bracketPresentation.roundNames.grandFinal");
  }
  if (normalized === "final") {
    return t("bracketPresentation.roundNames.final");
  }
  if (normalized === "round robin") {
    return t("tournaments.brackets.roundRobin");
  }
  if (
    normalized === "semifinal" ||
    normalized === "semifinals" ||
    normalized === "semi final" ||
    normalized === "semi finals"
  ) {
    return t("bracketPresentation.roundNames.semifinals");
  }
  if (
    normalized === "quarterfinal" ||
    normalized === "quarterfinals" ||
    normalized === "quarter final" ||
    normalized === "quarter finals"
  ) {
    return t("bracketPresentation.roundNames.quarterfinals");
  }

  const roundOfMatch = normalized.match(/^round of (\d+)$/);
  return roundOfMatch
    ? t("bracketPresentation.roundNames.roundOf", {
        count: roundOfMatch[1],
      })
    : roundName;
}
