"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import {
  deleteLeaderboardRecalculationRuns,
  recalculateLeaderboardAllTime,
  recalculateLeaderboardForCurrentSeason,
  recalculateLeaderboardForTournament,
} from "@/lib/leaderboard/admin";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

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
    if (!(await isCurrentUserAdmin())) {
      return {
        status: "error",
        message: "Only administrators can recalculate leaderboards.",
        runId: undefined,
      };
    }

    await requireCurrentAccountLegalAcceptance();

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

    revalidatePath("/admin/system");

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
  const rawRunIdEntries = formData.getAll("runId");
  const runIds = rawRunIdEntries.map((runId) => String(runId));
  const formDataEntries = rawRunIdEntries.map((value) => ({
    key: "runId",
    value: typeof value === "string" ? value : `[file:${value.name}]`,
  }));

  console.info("Leaderboard recalculation run delete action received form data:", {
    entries: formDataEntries,
    rawRunIdEntries: rawRunIdEntries.map((runId) => String(runId)),
    count: runIds.length,
  });

  if (runIds.length === 0) {
    return {
      status: "error",
      message: "No recalculation run records were submitted for deletion.",
    };
  }

  try {
    if (!(await isCurrentUserAdmin())) {
      return {
        status: "error",
        message:
          "Only administrators can delete leaderboard recalculation run records.",
        runId: undefined,
        deletedRunIds: undefined,
      };
    }

    await requireCurrentAccountLegalAcceptance();

    const result = await deleteLeaderboardRecalculationRuns(runIds);

    console.info("Leaderboard recalculation run delete action result:", {
      status: result.status,
      deletedRunIds: result.deletedRunIds ?? [],
      deletedCount: result.deletedRunIds?.length ?? 0,
    });

    if (result.status === "success") {
      revalidatePath("/admin/system");
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

async function isCurrentUserAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  return Boolean(userId && role === "admin");
}
