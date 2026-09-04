import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MatchResultControls from "@/components/MatchResultControls";
import DiscordSupportLink from "@/components/RequestAdminAssistanceButton";
import {
  uxMatch,
  uxParticipants,
  uxReport,
} from "@/tests/fixtures/match-result-ux";
import { report, setReport } from "./runtime";
import "@/app/globals.css";

const scenario = new URLSearchParams(location.search).get("scenario");
if (scenario && scenario !== "entry")
  setReport({
    ...uxReport,
    confirmationDeadlineAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...(scenario === "review" ? { status: "disputed" as const } : {}),
    ...(scenario === "auto"
      ? {
          status: "auto_approved" as const,
          finalizedAt: new Date().toISOString(),
          finalizedSource: "cron_auto_approval",
        }
      : {}),
  });
function Fixture() {
  const [current, setCurrent] = useState(report);
  useEffect(() => {
    const update = () => setCurrent(report);
    window.addEventListener("fixture-result", update);
    return () => window.removeEventListener("fixture-result", update);
  }, []);
  const match = current?.finalizedAt
    ? {
        ...uxMatch,
        status: "completed" as const,
        playerOneScore: current.playerOneScore,
        playerTwoScore: current.playerTwoScore,
        winnerRegistrationId: current.winnerRegistrationId,
      }
    : uxMatch;
  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-6 text-white">
      <article className="mx-auto min-w-0 max-w-3xl border border-white/12 bg-black/45 p-3 sm:p-7">
        <header className="mb-6 border-b border-white/10 pb-5">
          <p className="text-xs font-black uppercase tracking-wide text-orange-300">
            Quarterfinal · Best of 3
          </p>
          <h1 className="mt-2 text-xl font-black">Marco vs TestAcademy4</h1>
          <p className="mt-2 text-xs text-zinc-400">
            Match deadline: 10 September
          </p>
        </header>
        <MatchResultControls
          match={match}
          participantsById={uxParticipants}
          isAdmin={false}
          canSubmit
          deadlineManaged
          presentation="workspace"
          viewerRegistrationId={
            scenario === "opponent"
              ? uxMatch.playerTwoRegistrationId
              : uxMatch.playerOneRegistrationId
          }
          reportGroups={current ? [current] : []}
          submissions={[]}
        />
        <DiscordSupportLink />
      </article>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
