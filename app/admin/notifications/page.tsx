import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNotificationInbox from "@/components/admin/tournaments/AdminNotificationInbox";
import { isAdminNotificationInboxEnabled, loadAdminNotificationInbox } from "@/lib/admin-notification-inbox";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Query = { kind?: string; page?: string; filter?: string; selected?: string };
type TournamentChoice = { id: string; title: string; status: string };

export default async function AdminNotificationsPage({ searchParams }: { searchParams?: Promise<Query> }) {
  const { userId, sessionClaims, sessionId } = await auth();
  if (!await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId)) redirect("/");
  const query = await searchParams;
  if (!isAdminNotificationInboxEnabled()) return (
    <main className="min-h-screen bg-black px-4 pt-28 pb-16 text-white sm:px-6">
      <section className="mx-auto max-w-4xl rounded-2xl border border-amber-500/25 p-5">
        <h1 className="text-2xl font-black">Admin notifications</h1>
        <p role="status" className="mt-3 text-sm leading-6 text-amber-100">The scoped admin inbox is turned off in this environment. Existing notifications remain saved.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-orange-200">
          <Link href="/admin/tournaments" className="inline-flex min-h-11 items-center underline">Open Tournaments</Link>
          <Link href="/admin/notifications/legacy-assistance?kind=unassigned" className="inline-flex min-h-11 items-center underline">Legacy assistance with no tournament</Link>
          <Link href="/admin" className="inline-flex min-h-11 items-center underline">Back to Admin</Link>
        </div>
      </section>
    </main>
  );

  if (query?.kind === "platform" || query?.kind === "unassigned") {
    const kind = query.kind;
    let data = null;
    try {
      data = await loadAdminNotificationInbox({ kind }, {
        page: query.page, filter: query.filter, selected: query.selected,
      });
    } catch {
      console.error("Admin notification inbox load failed.");
    }
    const title = kind === "platform" ? "Platform notifications" : "Legacy / unassigned notifications";
    return (
      <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32">
        <div className="mx-auto max-w-6xl">
          <Link href="/admin/notifications" className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-300">Choose another inbox</Link>
          <h1 className="mt-3 text-3xl font-black">{title}</h1>
          <p className="mt-3 mb-6 max-w-3xl text-sm leading-6 text-zinc-400">
            {kind === "platform"
              ? "Notifications explicitly classified as platform-wide. Tournament notifications appear only in their own workspace."
              : "Notifications without a verified tournament association or explicit platform classification. Opening a tournament does not assign these records to it."}
          </p>
          {data ? <AdminNotificationInbox data={data} title={title} baseHref={`/admin/notifications?kind=${kind}`} /> : (
            <section role="alert" className="rounded-2xl border border-red-500/30 p-5 text-sm text-red-200">
              <p>This inbox could not be loaded. Its notification state has not been treated as empty.</p>
              <Link href={`/admin/notifications?kind=${kind}`} className="mt-3 inline-flex min-h-11 items-center text-orange-200 underline">Reopen inbox</Link>
            </section>
          )}
        </div>
      </main>
    );
  }

  const supabase = createSupabaseAdminClient();
  const tournaments: TournamentChoice[] = [];
  let unavailable = false;
  let total: number | null = null;
  try {
    do {
      const result = await supabase.from("tournaments")
        .select("id, title, status", { count: "exact" })
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(tournaments.length, tournaments.length + 99);
      if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) ||
        result.count! < 0 || (total !== null && result.count !== total)) {
        throw new Error("Tournament choices unavailable.");
      }
      total = result.count!;
      if ((result.data.length === 0 && tournaments.length < total) || tournaments.length + result.data.length > total) {
        throw new Error("Tournament choices incomplete.");
      }
      for (const row of result.data) {
        if (!isUuid(row.id) || typeof row.title !== "string" || typeof row.status !== "string" || tournaments.some((item) => item.id === row.id)) {
          throw new Error("Tournament choice invalid.");
        }
        tournaments.push(row as TournamentChoice);
      }
    } while (tournaments.length < total);
  } catch {
    unavailable = true;
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-semibold text-zinc-400 hover:text-white">Back to Admin</Link>
        <h1 className="mt-4 text-3xl font-black">Choose an admin inbox</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Open a tournament to read or remove only its notifications. Historical notifications remain with their original tournament.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin/notifications?kind=platform" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-orange-200">Platform notifications</Link>
          <Link href="/admin/notifications?kind=unassigned" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-orange-200">Legacy / unassigned notifications</Link>
        </div>
        {unavailable ? (
          <p role="alert" className="mt-6 text-sm text-red-200">Tournament choices could not be loaded. Reopen this page to try again.</p>
        ) : tournaments.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-400">No tournaments are available.</p>
        ) : (
          <ul aria-label="Tournament notification inboxes" className="mt-6 grid gap-3 sm:grid-cols-2">
            {tournaments.map((tournament) => (
              <li key={tournament.id} className="min-w-0">
                <Link href={`/admin/tournaments/${tournament.id}?section=notifications`} className="flex min-h-20 min-w-0 flex-col justify-center rounded-2xl border border-white/10 p-4 hover:border-orange-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                  <span className="break-words font-bold">{tournament.title}</span>
                  <span className="mt-1 text-xs text-zinc-400">{tournament.status.replaceAll("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
