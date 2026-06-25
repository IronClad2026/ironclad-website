"use server";

import { revalidatePath } from "next/cache";
import {
  deleteLeaderboardRecalculationRuns,
  recalculateLeaderboardAllTime,
  recalculateLeaderboardForCurrentSeason,
  recalculateLeaderboardForTournament,
} from "@/lib/leaderboard/admin";

export type LeaderboardRecalculationActionState = {
  status: "idle" | "success" | "error" | "pending";
  message: string;
  runId?: string;
};

export type LeaderboardRunDeleteActionState = {
  status: "idle" | "success" | "error" | "pending";
  message: string;
  runId?: string;
  deletedRunIds?: string[];
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

export async function deleteLeaderboardRecalculationRunRecords(
  _previousState: LeaderboardRunDeleteActionState,
  formData: FormData
): Promise<LeaderboardRunDeleteActionState> {
  const runIds = formData.getAll("runId").map((runId) => String(runId));

  console.info("Leaderboard recalculation run delete action received IDs:", {
    count: runIds.length,
  });

  try {
    const result = await deleteLeaderboardRecalculationRuns(runIds);

    if (result.status === "success") {
      revalidatePath("/admin");
    }

    return {
      status: result.status,
      message: result.message,
      runId: result.runId,
      deletedRunIds: result.deletedRunIds,
    };
  } catch (error) {
    console.error("Leaderboard recalculation run deletion action failed:", error);
    return {
      status: "error",
      message: "Recalculation run records could not be deleted.",
    };
  }
}
