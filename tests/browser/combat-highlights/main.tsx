import { createRoot } from "react-dom/client";
import CombatHighlights from "@/components/combat-highlights/CombatHighlights";
import CombatHighlightsEditor from "@/components/combat-highlights/CombatHighlightsEditor";
import type { HighlightEditorActions, HighlightSlot, HighlightsState, PublicHighlightClip, ReserveHighlightInput } from "@/lib/combat-highlights/types";
import "../../../app/globals.css";

const query = new URLSearchParams(location.search);
const count = Math.max(0, Math.min(3, Number(query.get("count") ?? 3)));
const clips: PublicHighlightClip[] = ["A clean flank", "Holding the line", "The final push"].map((title, index) => ({
  uploadId: `fixture-clip-${index + 1}`, title: query.has("long") ? title.repeat(8).slice(0, 64) : title,
  durationMs: 2500, width: 96, height: 54, fps: 10, contentType: "video/webm", hasPoster: false,
  videoUrl: `${location.origin}/fixture-media/clip-${index + 1}.webm`, posterUrl: null,
}));
let state: HighlightsState = {
  playerId: "fixture-player", enabled: true, publicProfileEnabled: false,
  slots: [1, 2, 3].map((slotNumber): HighlightSlot => ({ slotNumber, displayOrder: slotNumber, revision: 1, hidden: false, clip: slotNumber <= count ? clips[slotNumber - 1] : null, pendingUploadId: null })),
};
let reservation: ReserveHighlightInput | null = null;
function record(name: string) {
  const output = document.querySelector("[data-fixture-actions]");
  if (output) output.textContent += name + " ";
}
const result = () => ({ ok: true, code: "saved", state: structuredClone(state) });
const actions: HighlightEditorActions = {
  async reserve(input) {
    record("reserve");
    reservation = input;
    state = { ...state, slots: state.slots.map((slot) => slot.slotNumber === input.slotNumber ? { ...slot, pendingUploadId: "fixture-upload", revision: slot.revision + 1 } : slot) };
    return { ...result(), upload: { uploadId: "fixture-upload", videoUrl: `${location.origin}/fixture-upload/video`, videoAuthorization: "synthetic-video-grant", posterUrl: input.posterByteLength ? `${location.origin}/fixture-upload/poster` : null, posterAuthorization: input.posterByteLength ? "synthetic-poster-grant" : null, clerkToken: "synthetic-clerk-token" } };
  },
  async complete() {
    record("complete");
    state = { ...state, slots: state.slots.map((slot) => slot.pendingUploadId ? { ...slot, pendingUploadId: null, revision: slot.revision + 1, clip: { ...clips[0], uploadId: "fixture-upload", title: reservation?.title ?? "Uploaded highlight" } } : slot) };
    return result();
  },
  async cancel(uploadId) { record("cancel"); state = { ...state, slots: state.slots.map((slot) => slot.pendingUploadId === uploadId ? { ...slot, pendingUploadId: null, revision: slot.revision + 1 } : slot) }; return result(); },
  async clear(slotNumber) { record("clear"); state = { ...state, slots: state.slots.map((slot) => slot.slotNumber === slotNumber ? { ...slot, clip: null, revision: slot.revision + 1 } : slot) }; return result(); },
  async reorder(slotNumbers) { record("reorder"); state = { ...state, slots: state.slots.map((slot) => ({ ...slot, displayOrder: slotNumbers.indexOf(slot.slotNumber) + 1, revision: slot.revision + 1 })) }; return result(); },
  async preview() { record("preview"); return { ok: true, code: "saved", videoUrl: `${location.origin}/fixture-media/owner.webm`, clerkToken: "synthetic-owner-token" }; },
};
const surface = query.get("surface") ?? "public";
createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen bg-black py-8 text-white">
    {surface === "editor" ? <div className="px-4"><CombatHighlightsEditor initialState={state} actions={actions} /></div> : <CombatHighlights clips={clips.slice(0, count)} report={async () => { record("report"); return { ok: true, code: "saved" }; }} />}
    <output data-fixture-actions className="sr-only" />
  </main>
);
document.documentElement.dataset.highlightsFixtureReady = surface;
