import Link from "next/link";
import { loadLegacyAssistanceQueue, parseLegacyAssistanceScope, requireLegacyAssistanceAdmin } from "@/lib/admin-legacy-assistance";
import { setLegacyAssistanceStatus } from "./actions";

export default async function LegacyAssistancePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireLegacyAssistanceAdmin();
  const query = await searchParams;
  let tournamentId: string | null;
  try { tournamentId = parseLegacyAssistanceScope(query.kind, query.tournamentId); }
  catch { return <p>Open legacy assistance from a tournament inbox or the unassigned legacy inbox. <Link href="/admin/notifications">Choose an inbox</Link></p>; }
  const requestedPage = typeof query.page === "string" && /^[1-9]\d{0,8}$/.test(query.page) ? Number(query.page) : 1;
  const includeResolved = query.filter === "all";
  const data = await loadLegacyAssistanceQueue(tournamentId, requestedPage, includeResolved);
  const href = (page: number, all = includeResolved) => {
    const params = new URLSearchParams({ kind: tournamentId ? "tournament" : "unassigned", page: String(page), filter: all ? "all" : "active" });
    if (tournamentId) params.set("tournamentId", tournamentId);
    return "/admin/notifications/legacy-assistance?" + params.toString();
  };
  return <main className="space-y-5 p-4 md:p-8">
    <h1 className="text-2xl font-semibold">Legacy assistance · {tournamentId ? "Selected tournament" : "Unassigned records"}</h1>
    <p>Shared team queue. Reading or removing a notification never changes these requests. Change a status only after reviewing the request; this does not pause or change the match.</p>
    <p>Previously hidden requests have unknown resolution history and need review. No past resolution has been assumed.</p>
    <Link href={tournamentId ? `/admin/tournaments/${tournamentId}?section=notifications` : "/admin/notifications?kind=unassigned"}>Back to inbox</Link>
    <nav className="flex gap-4"><Link href={href(1, false)}>Open / In progress</Link><Link href={href(1, true)}>All statuses</Link></nav>
    {query.notice === "stale" && <p role="alert">The request changed or is unavailable in this queue. Review the current status and try again.</p>}
    {query.notice === "updated" && <p role="status">Request status updated for all admins.</p>}
    <p>{data.totalCount} requests · Page {data.page} of {data.pageCount}</p>
    {data.requests.map((request) => <article key={request.id} className="space-y-3 rounded border border-white/15 p-4">
      <h2 className="font-semibold">{request.title ?? "Legacy assistance record"}</h2>
      <p className="whitespace-pre-wrap break-words">{request.message ?? "Original notification unavailable. Historical request status is retained."}</p>
      <p>{request.actor_display_name ?? "Requester not recorded"} · {request.status.replace("_", " ")}</p>
      {request.legacy_resolution_unknown && <p>Prior resolution unknown — review required.</p>}
      <p>Requested {request.created_at}</p>
      {request.match_id && tournamentId && <Link href={`/admin/tournaments/${tournamentId}?section=matches&match=${encodeURIComponent(request.match_id)}`}>Review match context</Link>}
      <form action={setLegacyAssistanceStatus} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="kind" value={tournamentId ? "tournament" : "unassigned"} />
        {tournamentId && <input type="hidden" name="tournamentId" value={tournamentId} />}
        <input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="version" value={request.version} />
        <label>Status <select name="status" defaultValue={request.status} className="rounded bg-neutral-900 p-2"><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>
        <button type="submit" className="rounded border p-2">Save request status</button>
      </form>
    </article>)}
    <nav className="flex gap-4">{data.page > 1 && <Link href={href(data.page - 1)}>Previous</Link>}{data.page < data.pageCount && <Link href={href(data.page + 1)}>Next</Link>}</nav>
  </main>;
}
