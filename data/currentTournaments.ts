export type TournamentStatus = "Upcoming" | "Ongoing" | "Completed";

export type CurrentTournament = {
  title: string;
  format: "1v1" | "4v4";
  bracket?: "Main Bracket" | "Challenger Bracket";
  game: string;
  startDate: string;
  endDate: string;
  battlefyUrl: string;
};

export const currentTournaments: CurrentTournament[] = [
  {
    title: "IronClad 1v1 Main Bracket",
    format: "1v1",
    bracket: "Main Bracket",
    game: "Company of Heroes 3",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    battlefyUrl: "YOUR_1V1_MAIN_BRACKET_BATTLEFY_LINK",
  },
  {
    title: "IronClad 1v1 Challenger Bracket",
    format: "1v1",
    bracket: "Challenger Bracket",
    game: "Company of Heroes 3",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    battlefyUrl: "YOUR_1V1_CHALLENGER_BRACKET_BATTLEFY_LINK",
  },
  {
    title: "IronClad 4v4 Tournament",
    format: "4v4",
    game: "Company of Heroes 3",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    battlefyUrl: "YOUR_4V4_BATTLEFY_LINK",
  },
];

export function getTournamentStatus(
  startDate: string,
  endDate: string
): TournamentStatus {
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (today < start) return "Upcoming";
  if (today > end) return "Completed";
  return "Ongoing";
}