import Link from "next/link";
import { redirect } from "next/navigation";
import { getHighlightsForModeration, highlightModerator } from "@/lib/combat-highlights/moderation";
import ModerationForm from "./ModerationForm";
import { retryCleanup } from "./actions";
export const dynamic = "force-dynamic";
export default async function CombatHighlightModerationPage({ searchParams }: { searchParams: Promise<{ playerId?: string }> }) {
  if (!await highlightModerator()) redirect("/dashboard");
  const { playerId } = await searchParams;
  const rows = await getHighlightsForModeration(playerId);
  return <main className="mx-auto min-h-screen max-w-4xl px-4 pb-20 pt-28 text-white">
    <Link href="/admin/player-showcase" className="text-sm text-orange-200 underline">Player Showcase moderation</Link>
    <h1 className="mt-4 text-3xl font-bold">Combat Highlights moderation</h1>
    <p className="mt-2 text-sm text-zinc-400">Reported clips, or look up a player. Hiding a clip immediately prevents new public playback authorization.</p>
    <form className="my-6 flex flex-wrap gap-3"><label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">Player ID<input name="playerId" defaultValue={playerId} className="min-h-11 rounded border border-zinc-700 bg-zinc-950 px-3" /></label><button className="self-end rounded border border-zinc-700 px-4 py-3">Look up</button><Link href="/admin/combat-highlights" className="self-end px-3 py-3 text-orange-200">Reported clips</Link></form>
    {rows.length === 0 && <p className="text-zinc-400">No clips to review.</p>}
    <div className="space-y-4">{rows.map((row) => <section key={row.playerId + ":" + row.slotNumber} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><Link href={"/players/" + row.playerId} className="break-all text-xs text-zinc-400">{row.playerId}</Link><h2 className="mt-2 font-semibold">Slot {row.slotNumber} · {row.title || "Untitled clip"}</h2><p className="mt-1 text-sm text-zinc-400">{row.hidden ? "Hidden" : "Eligible when profile is public"} · {row.reportCount} report(s)</p><ModerationForm row={row} /></section>)}</div>
    <form action={retryCleanup} className="mt-8 border-t border-zinc-800 pt-5"><button className="min-h-11 rounded border border-zinc-700 px-4 text-sm">Retry pending storage cleanup</button><p className="mt-2 text-xs text-zinc-500">Retries at most ten eligible deletions. Active upload reservations expire before their objects are removed.</p></form>
  </main>;
}
