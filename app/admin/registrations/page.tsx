import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type LegacyRegistrationQuery = {
  filter?: string | string[];
  selected?: string | string[];
  notice?: string | string[];
  detail?: string | string[];
  focus?: string | string[];
};

type TournamentChoice = {
  id: string;
  title: string;
  status: string;
};

const REGISTRATION_FILTERS = [
  "all",
  "pending",
  "manual_review",
  "approved",
  "rejected",
  "waitlisted",
  "withdrawn",
] as const;

const REGISTRATION_NOTICES = [
  "note-required",
  "saved",
  "save-failed",
  "registration-deleted",
  "registration-delete-failed",
  "registration-delete-blocked",
  "bracket-full",
  "registration-closed",
  "registration-locked",
  "registration-bulk-approved",
  "registration-bulk-partial",
  "registration-bulk-failed",
  "registration-scope-required",
  "registration-scope-mismatch",
] as const;

const REGISTRATION_FOCUS_TARGETS = ["note", "reject", "manual_review"] as const;

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function registrationWorkspaceHref(
  tournamentId: string,
  query: LegacyRegistrationQuery | undefined,
  selected?: string
) {
  const params = new URLSearchParams({ section: "registrations" });
  const filter = typeof query?.filter === "string" &&
    REGISTRATION_FILTERS.some((value) => value === query.filter)
    ? query.filter : "all";
  params.set("filter", filter);
  if (selected) params.set("selected", selected);

  if (typeof query?.notice === "string" &&
    REGISTRATION_NOTICES.some((value) => value === query.notice)) {
    params.set("notice", query.notice);
  }
  if (typeof query?.detail === "string" && query.detail.trim()) {
    params.set("detail", query.detail.trim().slice(0, 240));
  }
  if (selected && typeof query?.focus === "string" &&
    REGISTRATION_FOCUS_TARGETS.some((value) => value === query.focus)) {
    params.set("focus", query.focus);
  }

  return `/admin/tournaments/${encodeURIComponent(tournamentId)}?${params.toString()}`;
}

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyRegistrationQuery>;
}) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  if (!userId || role !== "admin") redirect("/");

  const query = await searchParams;
  const selected = typeof query?.selected === "string" ? query.selected.toLowerCase() : undefined;
  const supabase = createSupabaseAdminClient();
  let destination: string | null = null;

  // Old bookmarks resolve only the selected registration's stored association.
  // Never infer a tournament from the player, title, filter or current event.
  if (isUuid(selected)) {
    try {
      const registration = await supabase
        .from("registrations")
        .select("id, tournament_id")
        .eq("id", selected)
        .maybeSingle();
      const tournamentId = registration.data?.tournament_id;
      if (!registration.error && registration.data?.id === selected && isUuid(tournamentId)) {
        const tournament = await supabase
          .from("tournaments")
          .select("id")
          .eq("id", tournamentId)
          .maybeSingle();
        if (!tournament.error && tournament.data?.id === tournamentId) {
          destination = registrationWorkspaceHref(tournamentId, query, selected);
        }
      }
    } catch {
      console.error("Legacy registration destination lookup failed.");
    }
  }
  // Next.js redirects throw; keep them outside lookup error handling.
  if (destination) redirect(destination);

  let tournaments: TournamentChoice[] = [];
  let choicesUnavailable = false;
  try {
    const result = await supabase
      .from("tournaments")
      .select("id, title, status")
      .order("created_at", { ascending: false });
    if (result.error || !Array.isArray(result.data)) {
      choicesUnavailable = true;
    } else {
      tournaments = result.data.filter((row): row is TournamentChoice =>
        isUuid(row.id) && typeof row.title === "string" && typeof row.status === "string"
      );
    }
  } catch {
    choicesUnavailable = true;
  }

  const scopeNotice = query?.notice === "registration-scope-required" ||
    query?.notice === "registration-scope-mismatch";

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-semibold text-zinc-400 hover:text-white">
          Back to Admin
        </Link>
        <h1 className="mt-4 break-words text-3xl font-black sm:text-4xl">Choose a Tournament</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          Open a tournament to review its registrations, status counts and waitlist.
          Historical registrations stay in their original tournament.
        </p>
        {scopeNotice && (
          <p role="alert" className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
            This action needs a matching tournament workspace. Open the original tournament and review the registration before trying again.
          </p>
        )}
        {query?.selected !== undefined && (
          <p role="alert" className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
            This registration link could not be matched to an available tournament.
            Records with a missing tournament association remain retained and require administrator review; selecting a tournament here does not assign them to it.
          </p>
        )}
        {choicesUnavailable ? (
          <p role="alert" className="mt-6 text-sm text-red-200">Tournament choices could not be loaded. Open Tournaments to try again.</p>
        ) : tournaments.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-400">No tournaments are available.</p>
        ) : (
          <ul aria-label="Tournament registration workspaces" className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2">
            {tournaments.map((tournament) => (
              <li key={tournament.id} className="min-w-0">
                <Link href={registrationWorkspaceHref(tournament.id, query)} className="flex min-h-20 min-w-0 flex-col justify-center rounded-2xl border border-white/10 p-4 hover:border-orange-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                  <span className="break-words font-bold">{tournament.title}</span>
                  <span className="mt-1 text-xs text-zinc-400">{tournament.status.replaceAll("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/tournaments" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-orange-300 hover:text-orange-200">
          Open Tournaments
        </Link>
      </div>
    </main>
  );
}
