"use server";

import { revalidatePath } from "next/cache";
import {
  recalculateLeaderboardAllTime,
  recalculateLeaderboardForCurrentSeason,
  recalculateLeaderboardForTournament,
} from "@/lib/leaderboard/admin";

export type LeaderboardRecalculationActionState = {
  status: "idle" | "success" | "error" | "pending";
  message: string;
  runId?: string;
};

const initialError: LeaderboardRecalculationActionState = {
  status: "error",
  message: "Leaderboard recalculation could not be started.",
};

export async function runLeaderboardRecalculation(
  _previousState: LeaderboardRecalculationActionState,
  formData: FormData
): Promise<LeaderboardRecalculationActionState> {
  const action = String(formData.get("leaderboardAction") ?? "");

  try {
    const result =
      action === "current_season"
        ? await recalculateLeaderboardForCurrentSeason()
        : action === "all_time"
          ? await recalculateLeaderboardAllTime()
          : action === "tournament"
            ? await recalculateLeaderboardForTournament(
                String(formData.get("tournamentId") ?? "")
              )
            : initialError;

    revalidatePath("/admin");

    return {
      status: result.status,
      message: result.message,
      runId: result.runId,
    };
  } catch (error) {
    console.error("Leaderboard recalculation action failed:", error);
    return initialError;
  }
}
