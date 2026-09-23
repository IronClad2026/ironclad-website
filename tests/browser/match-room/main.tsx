import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import MatchRoom from "@/components/MatchRoom";
import MatchResultControls from "@/components/MatchResultControls";
import MatchRoomAssistanceControls from "@/components/MatchRoomAssistanceControls";
import useMatchRoomUnread from "@/components/tournaments/useMatchRoomUnread";
import { uxMatch, uxParticipants } from "@/tests/fixtures/match-result-ux";
import { fixture, ROOM_ID } from "./runtime";
import { SECOND_MATCH_ID } from "./visibility-runtime";
import "@/app/globals.css";
const params = new URLSearchParams(location.search);
const scenario = params.get("scenario");
const participants = [...uxParticipants.values()].map((value,index) => ({
  registrationId: value.registrationId, name: index ? "VeryLongOpponentName".repeat(6) : value.name,
}));
function Fixture() {
  const [viewer, setViewer] = useState(fixture.viewer);
  const [episode, setEpisode] = useState(() => fixture.snapshot().episode);
  const [showRoom, setShowRoom] = useState(false);
  const unreadByMatchId = useMatchRoomUnread({ userId: scenario === "unread" ? "fixture-" + viewer : null, matchIds: [uxMatch.id] });
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
  const roomOpen = scenario === "unread" ? showRoom : scenario !== "notifications" || viewer !== "opponent" || pinnedRoom !== null;
  const destination = new URLSearchParams({
    scenario: "notifications", viewer, match: uxMatch.id, room: episode?.roomId ?? ROOM_ID,
  });
  if (scenario === "visibility") return (
    <main className="min-h-screen bg-zinc-950 p-3 text-white">
      <div className="mx-auto max-w-3xl" data-testid="first-room">
        <MatchRoom matchId={uxMatch.id} participants={participants} />
      </div>
      <div className="h-[1200px]" aria-hidden="true" />
      <div className="mx-auto max-w-3xl" data-testid="second-room">
        <MatchRoom matchId={SECOND_MATCH_ID} participants={participants} />
      </div>
    </main>
  );
  return (
    <main className="min-h-screen bg-zinc-950 p-3 text-white">
      <article className="mx-auto min-w-0 max-w-3xl border border-white/10 p-3 sm:p-6">
        <h1 className="mb-4 text-xl font-black">Match Workspace browser fixture</h1>
        {scenario === "unread" && <section aria-label="Private card attention fixture" className="mb-4">
          <output data-testid="unread-summary">{unreadByMatchId.get(uxMatch.id)?.unreadSource ?? "none"}</output>
          <button type="button" onClick={() => setShowRoom((value) => !value)}>{showRoom ? "Close fixture room" : "Open fixture room"}</button>
        </section>}
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
