import { useState } from "react";
import { createRoot } from "react-dom/client";
import AdminMatchManagementDialog from "@/components/AdminMatchManagementDialog";
import {
  adminMatch,
  adminParticipants,
  adminReport,
} from "@/tests/fixtures/admin-match-ux";
import type { TournamentCard, MatchResultReportGroup } from "@/lib/tournaments";
import "@/app/globals.css";

const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") ?? "empty";
const report: MatchResultReportGroup = {
  ...adminReport,
  confirmationDeadlineAt: new Date(
    Date.now() + (scenario === "expired" ? -60_000 : 1_800_000)
  ).toISOString(),
  status:
    scenario === "disputed"
      ? "disputed"
      : scenario === "review"
        ? "under_review"
        : scenario === "complete"
          ? "auto_approved"
          : "pending_confirmation",
  disputeNotes:
    scenario === "disputed"
      ? "Please review the winner of Game 2 against the attached replay."
      : null,
  ...(scenario === "complete"
    ? {
        finalizedAt: new Date().toISOString(),
        finalizedSource: "cron_auto_approval",
      }
    : {}),
};
const match = {
  ...adminMatch,
  ...(scenario === "hold" ? { holdStartedAt: new Date().toISOString() } : {}),
  ...(scenario === "complete"
    ? {
        status: "completed" as const,
        playerOneScore: 2,
        playerTwoScore: 1,
        winnerRegistrationId: adminMatch.playerOneRegistrationId,
      }
    : {}),
};
const participants = new Map(adminParticipants);
if (params.has("long"))
  for (const [id, player] of participants)
    participants.set(id, {
      ...player,
      name: player.name + "_VeryLongUnbrokenParticipantName_".repeat(3),
    });
const reports = ["empty", "hold"].includes(scenario) ? [] : [report];
reports.push({
  ...adminReport,
  id: "earlier-report",
  status: "rejected",
  finalizedAt: "2026-09-01T00:00:00Z",
  reviewNotes:
    "A historical note including a long replay filename: " +
    "fixture_championship_replay_".repeat(8) +
    ".rec",
});

function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <button className="min-h-11 p-3" onClick={() => setOpen(true)}>
        Open fixture match
      </button>
      {open && (
        <AdminMatchManagementDialog
          tournament={
            { title: "Championship · Open Division" } as TournamentCard
          }
          match={match}
          bracketFormat="single_elimination"
          participantsById={participants}
          viewer={{ isAdmin: true }}
          submissions={[]}
          reportGroups={reports}
          readOnly={scenario === "complete"}
          onClose={() => setOpen(false)}
          diceHistory={
            <p className="text-xs text-zinc-400">
              Read-only dice history fixture
            </p>
          }
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
