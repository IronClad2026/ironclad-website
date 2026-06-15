import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import AdminBracketManagement, {
  type AdminBracketTournamentOption,
} from "@/components/AdminBracketManagement";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Eye,
  GitBranch,
  Menu,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  X,
  XCircle,
} from "lucide-react";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RegistrationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected"
  | "waitlisted";
type FilterStatus = "all" | RegistrationStatus;
type AdminNotice =
  | "note-required"
  | "saved"
  | "save-failed"
  | "bracket-preserved";

type AdminPageProps = {
  searchParams?: Promise<{
    filter?: FilterStatus;
    selected?: string;
    notice?: AdminNotice;
    bracketNotice?: "population-saved" | "population-failed";
  }>;
};

type SupabaseRegistration = {
  id: string;
  player_name: string;
  discord_username: string;
  steam_name: string;
  country: string;
  region: string;
  timezone: string;
  submitted_elo: number;
  registration_status: RegistrationStatus;
  admin_notes: string | null;
  created_at: string;
  tournament_id: string | null;
  tournament_bracket_id: string | null;
};

const managementCards = [
  {
    title: "Manage Tournaments",
    description: "Create, edit, and monitor active IronClad tournaments.",
    icon: Trophy,
  },
  {
    title: "Manage Brackets",
    description: "Review Main, Challenge, and 4v4 bracket structures.",
    icon: GitBranch,
  },
  {
    title: "Player Database",
    description: "View player profiles, registration history, and admin notes.",
    icon: Database,
  },
  {
    title: "ELO Verification Queue",
    description: "Check player ELO before final admin approval.",
    icon: Search,
  },
];

function formatStatus(status: string) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSafeFilter(filter?: string): FilterStatus {
  const validFilters: FilterStatus[] = [
    "all",
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
  ];

  return validFilters.includes(filter as FilterStatus)
    ? (filter as FilterStatus)
    : "all";
}

function getStatusBadgeClass(status: RegistrationStatus) {
  if (status === "approved") {
    return "border-green-500/30 bg-green-500/10 text-green-400";
  }

  if (status === "rejected") {
    return "border-red-500/30 bg-red-500/10 text-red-400";
  }

  if (status === "manual_review") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  }

  if (status === "waitlisted") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function buildHref({
  filter,
  selected,
  notice,
}: {
  filter: FilterStatus;
  selected?: string;
  notice?: AdminNotice;
}) {
  const params = new URLSearchParams();
  params.set("filter", filter);

  if (selected) {
    params.set("selected", selected);
  }

  if (notice) {
    params.set("notice", notice);
  }

  return `/admin?${params.toString()}`;
}

async function updateRegistrationStatus(formData: FormData) {
  "use server";

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const registrationId = String(formData.get("registrationId") || "");
  const nextStatus = String(
    formData.get("nextStatus") || ""
  ) as RegistrationStatus;
  const activeFilter = getSafeFilter(
    String(formData.get("activeFilter") || "all")
  );
  const selected = String(formData.get("selected") || "");
  const adminNotes = String(formData.get("adminNotes") || "").trim();

  const validStatuses: RegistrationStatus[] = [
    "pending",
    "manual_review",
    "approved",
    "rejected",
    "waitlisted",
  ];

  if (!registrationId || !validStatuses.includes(nextStatus)) {
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || undefined,
      })
    );
  }

  if (
    (nextStatus === "rejected" || nextStatus === "manual_review") &&
    !adminNotes
  ) {
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "note-required",
      })
    );
  }

  if (adminNotes.length > 1000) {
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "save-failed",
      })
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: currentRegistration, error: registrationLookupError } =
    await supabase
      .from("registrations")
      .select("registration_status, tournament_bracket_id")
      .eq("id", registrationId)
      .maybeSingle();

  if (registrationLookupError || !currentRegistration) {
    console.error(
      "Registration status lookup error:",
      registrationLookupError?.message
    );
    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "save-failed",
      })
    );
  }

  const approvedRosterChanged =
    currentRegistration.registration_status !== nextStatus &&
    (currentRegistration.registration_status === "approved" ||
      nextStatus === "approved");
  let bracketPreserved = false;

  if (
    approvedRosterChanged &&
    currentRegistration.tournament_bracket_id
  ) {
    const { data: regenerationSafe, error: safetyError } =
      await supabase.rpc("is_tournament_bracket_regeneration_safe", {
        p_tournament_bracket_id:
          currentRegistration.tournament_bracket_id,
      });

    if (safetyError) {
      console.error(
        "Bracket regeneration safety lookup failed:",
        safetyError.message
      );
    } else {
      bracketPreserved = regenerationSafe === false;
    }
  }

  const { error } = await supabase
    .from("registrations")
    .update({
      registration_status: nextStatus,
      admin_notes: adminNotes,
    })
    .eq("id", registrationId);

  if (error) {
    console.error("Supabase status update error:", error.message);

    redirect(
      buildHref({
        filter: activeFilter,
        selected: selected || registrationId,
        notice: "save-failed",
      })
    );
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/tournaments");

  redirect(
    buildHref({
      filter: activeFilter,
      selected: selected || undefined,
      notice: bracketPreserved ? "bracket-preserved" : "saved",
    })
  );
}

function StatusActionButton({
  registrationId,
  nextStatus,
  activeFilter,
  selected,
  adminNotes,
  children,
  className,
}: {
  registrationId: string;
  nextStatus: RegistrationStatus;
  activeFilter: FilterStatus;
  selected?: string;
  adminNotes?: string | null;
  children: ReactNode;
  className: string;
}) {
  return (
    <form action={updateRegistrationStatus}>
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <input type="hidden" name="activeFilter" value={activeFilter} />
      <input type="hidden" name="selected" value={selected ?? ""} />
      <input type="hidden" name="adminNotes" value={adminNotes ?? ""} />

      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { userId, sessionClaims } = await auth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  if (!userId || !isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const activeFilter = getSafeFilter(params?.filter);

  const supabase = createSupabaseAdminClient();
  const [registrationResult, tournamentResult, generatedResult] =
    await Promise.all([
      supabase
        .from("registrations")
        .select(
          "id, player_name, discord_username, steam_name, country, region, timezone, submitted_elo, registration_status, admin_notes, created_at, tournament_id, tournament_bracket_id"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("tournaments")
        .select(
          "id, title, status, grand_final_at, tournament_brackets(id, name)"
        )
        .order("grand_final_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("generated_brackets")
        .select(
          "id, tournament_bracket_id, format, slot_count, tournament_matches(player_one_slot, player_two_slot, player_one_registration_id, player_two_registration_id)"
        ),
    ]);
  const registrationsData = registrationResult.data;
  const error = registrationResult.error;

  if (error) {
    console.error("Supabase registrations fetch error:", error.message);
  }

  const registrations = (registrationsData ?? []) as SupabaseRegistration[];
  const tournaments = (tournamentResult.data ?? []) as {
    id: string;
    title: string;
    status: string;
    tournament_brackets?: { id: string; name: string }[];
  }[];
  const generatedByBracket = new Map(
    (
      (generatedResult.data ?? []) as {
        id: string;
        tournament_bracket_id: string;
        format: "single_elimination" | "round_robin";
        slot_count: number;
        tournament_matches?: {
          player_one_slot: number | null;
          player_two_slot: number | null;
          player_one_registration_id: string | null;
          player_two_registration_id: string | null;
        }[];
      }[]
    ).map((generated) => [generated.tournament_bracket_id, generated])
  );
  const bracketManagementTournaments: AdminBracketTournamentOption[] =
    tournaments
      .map((tournament) => ({
        id: tournament.id,
        title: tournament.title,
        brackets: (tournament.tournament_brackets ?? [])
          .map((bracket) => {
            const generated = generatedByBracket.get(bracket.id);
            const assignments: Record<number, string | null> = {};
            for (const match of generated?.tournament_matches ?? []) {
              if (match.player_one_slot) {
                assignments[match.player_one_slot] =
                  match.player_one_registration_id;
              }
              if (match.player_two_slot) {
                assignments[match.player_two_slot] =
                  match.player_two_registration_id;
              }
            }

            return {
              generatedBracketId: generated?.id ?? null,
              bracketId: bracket.id,
              bracketName: `${bracket.name} Bracket`,
              format: generated?.format ?? null,
              slotCount: generated?.slot_count ?? 0,
              actualMatchCount: generated?.tournament_matches?.length ?? 0,
              expectedMatchCount: generated
                ? generated.format === "single_elimination"
                  ? generated.slot_count - 1
                  : (generated.slot_count * (generated.slot_count - 1)) / 2
                : 0,
              assignments,
              participants: registrations
                .filter(
                  (registration) =>
                    registration.registration_status === "approved" &&
                    registration.tournament_id === tournament.id &&
                    registration.tournament_bracket_id === bracket.id
                )
                .map((registration) => ({
                  id: registration.id,
                  name: registration.player_name,
                  country: registration.country || "N/A",
                  elo: registration.submitted_elo ?? 0,
                })),
            };
          }),
      }))
      .filter((tournament) => tournament.brackets.length > 0);

  if (tournamentResult.error) {
    console.error(
      "Admin tournament operations load failed:",
      tournamentResult.error.message
    );
  }

  if (generatedResult.error) {
    console.error(
      "Admin generated brackets load failed:",
      generatedResult.error.message
    );
  }

  const selectedRegistration = registrations.find(
    (registration) => registration.id === params?.selected
  );

  const filteredRegistrations =
    activeFilter === "all"
      ? registrations
      : registrations.filter(
          (registration) => registration.registration_status === activeFilter
        );

  const stats = [
    {
      label: "Pending Registrations",
      value: registrations.filter(
        (item) => item.registration_status === "pending"
      ).length,
      filter: "pending" as FilterStatus,
      icon: Clock,
    },
    {
      label: "Manual Reviews",
      value: registrations.filter(
        (item) => item.registration_status === "manual_review"
      ).length,
      filter: "manual_review" as FilterStatus,
      icon: ShieldAlert,
    },
    {
      label: "Approved Players",
      value: registrations.filter(
        (item) => item.registration_status === "approved"
      ).length,
      filter: "approved" as FilterStatus,
      icon: CheckCircle,
    },
    {
      label: "Rejected Players",
      value: registrations.filter(
        (item) => item.registration_status === "rejected"
      ).length,
      filter: "rejected" as FilterStatus,
      icon: XCircle,
    },
    {
      label: "Waitlisted Players",
      value: registrations.filter(
        (item) => item.registration_status === "waitlisted"
      ).length,
      filter: "waitlisted" as FilterStatus,
      icon: Clock,
    },
    {
      label: "Active Tournaments",
      value: tournaments.filter(
        (tournament) =>
          tournament.status === "registration_open" ||
          tournament.status === "in_progress"
      ).length,
      filter: "all" as FilterStatus,
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-16 text-white">
      <section className="mx-auto max-w-7xl space-y-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-8 shadow-2xl"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/75" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-orange-950/40" />

          <div className="relative z-10 max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
              Private Admin Area
            </p>

            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              IronClad Admin Command Center
            </h1>

            <p className="mt-5 max-w-3xl text-zinc-300">
              Control registrations, ELO checks, approvals, player verification,
              and the full IronClad tournament workflow.
            </p>
            <Link
              href="/admin/tournaments"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-400"
            >
              <Trophy className="h-4 w-4" />
              Create Or Manage Tournaments
            </Link>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const isActive =
              activeFilter === stat.filter && stat.filter !== "all";

            return (
              <Link
                key={stat.label}
                href={buildHref({ filter: stat.filter })}
                className={`rounded-2xl border p-5 backdrop-blur transition hover:-translate-y-1 ${
                  isActive
                    ? "border-orange-400 bg-orange-500/20 shadow-lg shadow-orange-500/10"
                    : "border-white/10 bg-white/[0.04] hover:border-orange-500/60 hover:bg-orange-500/10"
                }`}
              >
                <Icon className="h-6 w-6 text-orange-400" />
                <p className="mt-4 text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
              </Link>
            );
          })}
        </div>

        <div className="relative z-10 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Registration Review</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Showing {filteredRegistrations.length} registration(s).
            </p>
          </div>

          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-4">Player</th>
                  <th>Created</th>
                  <th>Region</th>
                  <th>ELO</th>
                  <th>Country</th>
                  <th>Discord</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRegistrations.map((registration) => (
                  <tr
                    key={registration.id}
                    className="border-b border-white/5 text-zinc-300 transition hover:bg-white/[0.03]"
                  >
                    <td className="py-4 font-semibold text-white">
                      {registration.player_name || "N/A"}
                    </td>

                    <td>
                      {registration.created_at
                        ? new Date(registration.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>

                    <td>{registration.region || "N/A"}</td>
                    <td>{registration.submitted_elo ?? "N/A"}</td>
                    <td>{registration.country || "N/A"}</td>
                    <td>{registration.discord_username || "N/A"}</td>

                    <td>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          registration.registration_status || "pending"
                        )}`}
                      >
                        {formatStatus(
                          registration.registration_status || "pending"
                        )}
                      </span>
                    </td>

                    <td className="relative">
                      <div className="relative z-[80]">
                        <details className="group relative inline-block">
                          <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded-xl bg-orange-500/10 p-2 text-orange-300 ring-1 ring-orange-500/20 transition hover:bg-orange-500/20 hover:ring-orange-400/40 [&::-webkit-details-marker]:hidden">
                            <Menu className="h-4 w-4" />
                          </summary>

                          <div className="fixed right-10 z-[9999] mt-2 w-48 origin-top-right scale-95 rounded-2xl bg-zinc-950/95 p-2 opacity-0 shadow-2xl shadow-orange-950/60 ring-1 ring-orange-500/20 backdrop-blur-xl transition-all duration-200 group-open:scale-100 group-open:opacity-100">
                            <div className="space-y-1.5">
                              <Link
                                href={buildHref({
                                  filter: activeFilter,
                                  selected: registration.id,
                                })}
                                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/10"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View Details
                              </Link>

                              <StatusActionButton
                                registrationId={registration.id}
                                nextStatus="approved"
                                activeFilter={activeFilter}
                                adminNotes={registration.admin_notes}
                                className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-green-400 transition hover:bg-green-500/10"
                              >
                                Approve
                              </StatusActionButton>

                              <StatusActionButton
                                registrationId={registration.id}
                                nextStatus="rejected"
                                activeFilter={activeFilter}
                                selected={registration.id}
                                adminNotes={registration.admin_notes}
                                className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-red-400 transition hover:bg-red-500/10"
                              >
                                Reject
                              </StatusActionButton>

                              <StatusActionButton
                                registrationId={registration.id}
                                nextStatus="manual_review"
                                activeFilter={activeFilter}
                                selected={registration.id}
                                adminNotes={registration.admin_notes}
                                className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-orange-300 transition hover:bg-orange-500/10"
                              >
                                Review
                              </StatusActionButton>

                              <StatusActionButton
                                registrationId={registration.id}
                                nextStatus="waitlisted"
                                activeFilter={activeFilter}
                                selected={registration.id}
                                adminNotes={registration.admin_notes}
                                className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-amber-300 transition hover:bg-amber-500/10"
                              >
                                Waitlist
                              </StatusActionButton>
                            </div>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRegistrations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-zinc-500">
                      No registrations found for this status.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              Could not load registrations from Supabase. Check your table name,
              column names, and Row Level Security policy.
            </div>
          )}
        </div>

        <div className="relative z-0 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <AdminBracketManagement
            tournaments={bracketManagementTournaments}
            notice={params?.bracketNotice}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            {managementCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-orange-500/60 hover:bg-orange-500/10"
                >
                  <Icon className="h-8 w-8 text-orange-400" />

                  <h3 className="mt-5 text-xl font-bold">{card.title}</h3>

                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {card.description}
                  </p>

                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-300">
                    Preview module
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selectedRegistration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-orange-500/30 bg-zinc-950 p-6 shadow-2xl shadow-orange-950/40">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
                  Registration Details
                </p>

                <h2 className="mt-3 text-3xl font-bold">
                  {selectedRegistration.player_name || "N/A"}
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  Full player registration review and admin decision panel.
                </p>
              </div>

              <Link
                href={buildHref({ filter: activeFilter })}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Player Name", selectedRegistration.player_name],
                ["Discord", selectedRegistration.discord_username],
                ["Steam Name", selectedRegistration.steam_name],
                ["Country", selectedRegistration.country],
                ["Region", selectedRegistration.region],
                ["Timezone", selectedRegistration.timezone],
                ["Submitted ELO", selectedRegistration.submitted_elo],
                [
                  "Registration Status",
                  formatStatus(
                    selectedRegistration.registration_status || "pending"
                  ),
                ],
                [
                  "Created At",
                  selectedRegistration.created_at
                    ? new Date(selectedRegistration.created_at).toLocaleString()
                    : "N/A",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>

                  <p className="mt-2 font-semibold text-white">
                    {value || "N/A"}
                  </p>
                </div>
              ))}
            </div>

            <form action={updateRegistrationStatus} className="mt-4">
              <input
                type="hidden"
                name="registrationId"
                value={selectedRegistration.id}
              />
              <input
                type="hidden"
                name="activeFilter"
                value={activeFilter}
              />
              <input
                type="hidden"
                name="selected"
                value={selectedRegistration.id}
              />

              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                <label
                  htmlFor="adminNotes"
                  className="text-xs font-bold uppercase tracking-wider text-orange-300"
                >
                  Admin Notes
                </label>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  Required when rejecting a registration or marking it for
                  manual review. This note is shown to the player.
                </p>
                <textarea
                  id="adminNotes"
                  name="adminNotes"
                  defaultValue={selectedRegistration.admin_notes ?? ""}
                  maxLength={1000}
                  rows={5}
                  className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400"
                  placeholder="Explain the decision or information needed from the player."
                />
              </div>

              {params?.notice && (
                <div
                  className={`mt-4 rounded-xl border p-4 text-sm ${
                    params.notice === "saved" ||
                    params.notice === "bracket-preserved"
                      ? "border-green-500/30 bg-green-500/10 text-green-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {params.notice === "note-required"
                    ? "Add an admin note before rejecting or marking this registration for manual review."
                    : params.notice === "saved"
                      ? "Registration decision and admin note saved."
                      : params.notice === "bracket-preserved"
                        ? "Registration saved. The populated or active bracket was preserved and was not regenerated. Use an explicit administrator reset before rebuilding it."
                      : "The registration decision could not be saved. Check the note length and try again."}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="nextStatus"
                  value={selectedRegistration.registration_status || "pending"}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.08]"
                >
                  Save Note
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="approved"
                  className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="rejected"
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="manual_review"
                  className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Mark Manual Review
                </button>

                <button
                  type="submit"
                  name="nextStatus"
                  value="waitlisted"
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
                >
                  <Clock className="h-4 w-4" />
                  Waitlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
