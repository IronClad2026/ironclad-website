export const TEN_MEBIBYTES = 10 * 1024 * 1024;

export function createReplayFile({
  contents = "replay-data",
  name = "match.rec",
  size,
}: {
  contents?: string;
  name?: string;
  size?: number;
} = {}) {
  const body =
    size === undefined ? contents : new Uint8Array(Math.max(0, size));

  return new File([body], name, {
    type: "application/octet-stream",
  });
}

export function createMatchResultFormData({
  matchId = "match-1",
  playerOneScore = "2",
  playerTwoScore = "0",
  replays = [],
  winnerRegistrationId = "registration-player-one",
}: {
  matchId?: string;
  playerOneScore?: string;
  playerTwoScore?: string;
  replays?: File[];
  winnerRegistrationId?: string;
} = {}) {
  const formData = new FormData();
  formData.set("matchId", matchId);
  formData.set("playerOneScore", playerOneScore);
  formData.set("playerTwoScore", playerTwoScore);
  formData.set("winnerRegistrationId", winnerRegistrationId);

  for (const replay of replays) {
    formData.append("replays", replay);
  }

  return formData;
}
