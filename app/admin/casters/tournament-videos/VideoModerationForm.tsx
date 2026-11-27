"use client";

import { useActionState, useEffect, useState } from "react";
import type { CasterTournamentChoice, CasterTournamentContexts, CasterTournamentVideo } from "@/lib/caster/tournament-video";
import { casterAdminInput, casterAdminPrimary } from "../admin-application-styles";
import { loadModerationVideoContexts, moderateCasterTournamentVideo } from "./actions";

export default function VideoModerationForm({ video, tournaments }: { video: CasterTournamentVideo; tournaments: CasterTournamentChoice[] }) {
  const [action, setAction] = useState("hide");
  const [tournament, setTournament] = useState(video.tournamentId);
  const [division, setDivision] = useState(video.divisionId ?? "");
  const [match, setMatch] = useState(video.matchId ?? "");
  const [scope, setScope] = useState<CasterTournamentContexts | null>(null);
  const [notice, submit, pending] = useActionState(moderateCasterTournamentVideo, { kind: "idle" });

  useEffect(() => {
    if (action !== "correct" || !tournament) return;
    let current = true;
    void loadModerationVideoContexts(tournament).then((value) => { if (current) setScope(value); })
      .catch(() => { if (current) setScope(null); });
    return () => { current = false; };
  }, [action, tournament]);

  return <details className="rounded-xl border border-white/10 p-3">
    <summary className="min-h-10 cursor-pointer font-semibold text-orange-200 focus-visible:outline-orange-300">Moderate video</summary>
    <form action={submit} className="grid gap-3 pt-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={video.id} /><input type="hidden" name="version" value={video.version} />
      <label className="grid gap-1 text-sm">Decision<select className={casterAdminInput} name="action" value={action} onChange={(event) => { setAction(event.target.value); setScope(null); }}>
        <option value="hide">Hide from both public pages</option><option value="remove">Remove from public circulation</option><option value="correct">Correct competition association</option>
      </select></label>
      {action === "correct" && <>
        <label className="grid gap-1 text-sm">Tournament<select required name="tournament" value={tournament} className={casterAdminInput} onChange={(event) => { setScope(null); setTournament(event.target.value); setDivision(""); setMatch(""); }}>
          <option value="">Select an eligible tournament</option>{tournaments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Division<select name="division" value={division} disabled={!scope} className={casterAdminInput} onChange={(event) => { setDivision(event.target.value); setMatch(""); }}>
          <option value="">Whole tournament</option>{scope?.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Match<select name="match" value={match} disabled={!scope || !division} className={casterAdminInput} onChange={(event) => setMatch(event.target.value)}>
          <option value="">Whole division</option>{scope?.matches.filter((item) => item.divisionId === division).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
      </>}
      <label className="grid gap-1 text-sm sm:col-span-2">Private audit reason<textarea required name="reason" maxLength={2000} rows={2} className={casterAdminInput} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirm" value="yes" className="size-5 accent-orange-500" required />I confirm this moderation decision.</label>
      <button className={casterAdminPrimary} disabled={pending || (action === "correct" && !scope)}>{pending ? "Recording…" : "Record decision"}</button>
      {notice.message && <p className="sm:col-span-2 text-sm text-orange-200" role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>}
    </form>
  </details>;
}
