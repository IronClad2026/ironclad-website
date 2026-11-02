import Link from "next/link";
import { authorizePrivateAssistance, callPrivateAssistance } from "@/lib/private-assistance-server";
import { isAssistanceRecord, isAssistanceUuid } from "@/lib/private-assistance";

type LegacyRoom = { roomId: string; matchId: string; status: "requested" | "resolved"; requestVersion: number };
type LegacyRooms = { requests: LegacyRoom[]; totalCount: number; page: number; pageCount: number };

export default async function LegacyRoomAssistance({ tournamentId, page = "1", includeResolved = false }: {
  tournamentId: string; page?: string; includeResolved?: boolean;
}) {
  const denied = await authorizePrivateAssistance(true);
  if (denied) return null;
  const requestedPage = /^\d{1,9}$/.test(page) ? Math.max(1, Number(page)) : 1;
  const result = await callPrivateAssistance<LegacyRooms>("list_legacy_room_assistance", {
    p_tournament_id: tournamentId, p_page: requestedPage, p_include_resolved: includeResolved,
  }, (value) => {
    if (!isAssistanceRecord(value) || value.tournamentId !== tournamentId || value.includeResolved !== includeResolved ||
      !Array.isArray(value.requests) || value.requests.length > 25 ||
      ![value.totalCount, value.page, value.pageCount].every((n) => typeof n === "number" && Number.isSafeInteger(n))) return null;
    const totalCount = value.totalCount as number;
    const currentPage = value.page as number;
    const pageCount = value.pageCount as number;
    if (totalCount < 0 || pageCount !== Math.max(1, Math.ceil(totalCount / 25)) ||
      currentPage !== Math.min(requestedPage, pageCount) ||
      value.requests.length !== Math.min(25, Math.max(0, totalCount - (currentPage - 1) * 25))) return null;
    const requests: LegacyRoom[] = [];
    for (const row of value.requests) {
      if (!isAssistanceRecord(row) || !isAssistanceUuid(row.roomId) || !isAssistanceUuid(row.matchId) ||
        (row.status !== "requested" && row.status !== "resolved") || (!includeResolved && row.status !== "requested") ||
        typeof row.requestVersion !== "number" || !Number.isSafeInteger(row.requestVersion) || row.requestVersion < 1) return null;
      requests.push({ roomId: row.roomId, matchId: row.matchId, status: row.status, requestVersion: row.requestVersion });
    }
    if (new Set(requests.map((r) => r.roomId)).size !== requests.length) return null;
    return { requests, totalCount, page: currentPage, pageCount };
  });
  const base = `/admin/tournaments/${tournamentId}?section=assistance&legacyResolved=${includeResolved ? "1" : "0"}`;
  return (
    <section aria-label="Earlier shared room assistance" className="mt-5 rounded-2xl border border-white/10 p-4 text-sm text-zinc-300">
      <h2 className="text-lg font-bold text-white">Earlier assistance records</h2>
      <p className="mt-2">Earlier shared room requests retain their original room controls. These records have no invented private owner or conversation history.</p>
      <div className="mt-2 flex flex-wrap gap-4">
        <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href={`/admin/notifications/legacy-assistance?kind=tournament&tournamentId=${tournamentId}`}>Legacy notification requests for this tournament</Link>
        <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href={`/admin/tournaments/${tournamentId}?section=assistance&legacyResolved=${includeResolved ? "0" : "1"}`}>{includeResolved ? "Show outstanding room requests" : "Include resolved room requests"}</Link>
      </div>
      {!result.ok ? <p role="alert">Earlier room requests could not be loaded. They have not been treated as an empty queue.</p> : <>
        <p>{result.data.totalCount} earlier room requests · Page {result.data.page} of {result.data.pageCount}</p>
        <ul className="mt-2 space-y-2">{result.data.requests.map((row) => <li key={row.roomId}>
          <Link className="inline-flex min-h-11 items-center break-all text-orange-200 underline" href={`/admin/tournaments/${tournamentId}?section=matches&match=${row.matchId}&room=${row.roomId}`}>
            {row.status === "requested" ? "Outstanding" : "Resolved"} · Match {row.matchId}
          </Link>
        </li>)}</ul>
        <nav aria-label="Earlier room assistance pages" className="mt-2 flex gap-4">
          {result.data.page > 1 && <Link className="inline-flex min-h-11 items-center underline" href={`${base}&legacyPage=${result.data.page - 1}`}>Previous</Link>}
          {result.data.page < result.data.pageCount && <Link className="inline-flex min-h-11 items-center underline" href={`${base}&legacyPage=${result.data.page + 1}`}>Next</Link>}
        </nav>
      </>}
    </section>
  );
}
