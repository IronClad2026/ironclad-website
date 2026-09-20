import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MatchRoom from "@/components/MatchRoom";
import MatchResultControls from "@/components/MatchResultControls";
import MatchRoomAssistanceControls from "@/components/MatchRoomAssistanceControls";
import { uxMatch, uxParticipants } from "@/tests/fixtures/match-result-ux";
import { fixture, ROOM_ID } from "./runtime";
import "@/app/globals.css";
const params = new URLSearchParams(location.search);
const scenario = params.get("scenario");
const participants = [...uxParticipants.values()].map((value,index) => ({
  registrationId: value.registrationId, name: index ? "VeryLongOpponentName".repeat(6) : value.name,
}));
function Fixture() {
  const [viewer, setViewer] = useState(fixture.viewer);
  const [episode, setEpisode] = useState(() => fixture.snapshot().episode);
  useEffect(() => {
    const onViewer = () => setViewer(fixture.viewer());
    const update = () => setEpisode(fixture.snapshot().episode);
    window.addEventListener("fixture-viewer", onViewer);
    window.addEventListener("fixture-room-update", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("fixture-viewer", onViewer);
      window.removeEventListener("fixture-room-update", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const pinnedRoom = params.get("room") ??
    (scenario === "historical" || scenario === "outsider" ? ROOM_ID : null);
  const roomOpen = scenario !== "notifications" || viewer !== "opponent" || pinnedRoom !== null;
  const destination = new URLSearchParams({
    scenario: "notifications", viewer, match: uxMatch.id, room: episode?.roomId ?? ROOM_ID,
  });
  return (
    <main className="min-h-screen bg-zinc-950 p-3 text-white">
      <article className="mx-auto min-w-0 max-w-3xl border border-white/10 p-3 sm:p-6">
        <h1 className="mb-4 text-xl font-black">Match Workspace browser fixture</h1>
        {episode && <aside aria-label="Fixture notification" className="mb-4 rounded-lg border border-orange-400/40 p-3">
          <a href={"?" + destination.toString()}>{episode.title}</a>
          <p>{episode.message}</p>
        </aside>}
        {roomOpen && <MatchRoom matchId={uxMatch.id} participants={participants} admin={viewer === "admin"}
          roomId={pinnedRoom}
          footer={(room) => room && <MatchRoomAssistanceControls roomId={room.id} admin={viewer === "admin"} />}
        />}
        <div className="mt-6">
          <MatchResultControls match={uxMatch} participantsById={uxParticipants} isAdmin={false}
            canSubmit deadlineManaged presentation="workspace" viewerRegistrationId={uxMatch.playerOneRegistrationId}
            reportGroups={[]} submissions={[]}/>
        </div>
      </article>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
