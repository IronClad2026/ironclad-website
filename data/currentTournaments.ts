export type TournamentStatus =
  | "Registration"
  | "Ongoing"
  | "Completed";

export type CurrentTournament = {
  title: string;
  format: "1v1" | "4v4";
  bracket?: "Main Bracket" | "Challenger Bracket";
  game: string;

  status: TournamentStatus;

  startDate?: string;
  endDate?: string;

  battlefyUrl: string;
};

export const currentTournaments: CurrentTournament[] = [
  {
    title: "IronClad 1v1 Main Bracket",
    format: "1v1",
    bracket: "Main Bracket",
    game: "Company of Heroes 3",

    status: "Ongoing",

    battlefyUrl:
      "https://battlefy.com/ironclad-tournaments/operation-skyfall/69ebc7641259b1002120aeb0/stage/69fb9c1b52cae7002ffb66e9/bracket/",
  },

  {
    title: "IronClad 1v1 Challenger Bracket",
    format: "1v1",
    bracket: "Challenger Bracket",
    game: "Company of Heroes 3",

    status: "Ongoing",

    battlefyUrl:
      "https://battlefy.com/ironclad-tournaments/operation-skyfall/69ebc7641259b1002120aeb0/stage/69fb9c3c52cae7002ffb66f1/bracket/",
  },

  {
    title: "IronClad 4v4 Tournament",
    format: "4v4",
    game: "Company of Heroes 3",

    status: "Registration",

    battlefyUrl:
      "https://battlefy.com/ironclad-tournaments/4-vs-4-beta-tournament/69fba46252cae7002ffb6701/stage/69fba4b572cdc1004654096f/bracket/",
  },
];