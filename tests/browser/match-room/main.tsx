import { createRoot } from "react-dom/client";
import MatchRoom from "@/components/MatchRoom";
import MatchResultControls from "@/components/MatchResultControls";
import { uxMatch, uxParticipants } from "@/tests/fixtures/match-result-ux";
import "./runtime";
import "@/app/globals.css";
const scenario = new URLSearchParams(location.search).get("scenario");
const participants = [...uxParticipants.values()].map((value,index) => ({
  registrationId: value.registrationId, name: index ? "VeryLongOpponentName".repeat(6) : value.name,
}));
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-zinc-950 p-3 text-white">
    <article className="mx-auto min-w-0 max-w-3xl border border-white/10 p-3 sm:p-6">
      <h1 className="mb-4 text-xl font-black">Match Workspace browser fixture</h1>
      <MatchRoom matchId={uxMatch.id} participants={participants} admin={scenario === "admin"}
        roomId={scenario === "historical" || scenario === "outsider" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null}/>
      <div className="mt-6">
        <MatchResultControls match={uxMatch} participantsById={uxParticipants} isAdmin={false}
          canSubmit deadlineManaged presentation="workspace" viewerRegistrationId={uxMatch.playerOneRegistrationId}
          reportGroups={[]} submissions={[]}/>
      </div>
    </article>
  </main>
);

