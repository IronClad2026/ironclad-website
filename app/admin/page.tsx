import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Eye,
  Filter,
  GitBranch,
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

type RegistrationStatus = "pending" | "manual_review" | "approved" | "rejected";

type FilterStatus = "all" | RegistrationStatus;

type AdminPageProps = {
  searchParams?: Promise<{
    filter?: FilterStatus;
    selected?: string;
    overrides?: string;
  }>;
};

const registrations = [
  {
    id: "reg-001",
    player: "IronWolf",
    discord: "@ironwolf",
    steamName: "IronWolf_91",
    country: "Australia",
    region: "Oceania",
    timezone: "AEST / Sydney",
    tournament: "Operation Skyfall",
    bracket: "Main",
    elo: 1425,
    verifiedElo: 1418,
    eloStatus: "Verified",
    status: "pending" as RegistrationStatus,
    adminNotes:
      "Player submitted complete details. ELO is close to submitted value and suitable for Main bracket.",
  },
  {
    id: "reg-002",
    player: "AxisBreaker",
    discord: "@axisbreaker",
    steamName: "AxisBreakerCOH",
    country: "Germany",
    region: "Europe",
    timezone: "CET / Berlin",
    tournament: "Operation Skyfall",
    bracket: "Challenge",
    elo: 1180,
    verifiedElo: 1296,
    eloStatus: "Needs Review",
    status: "manual_review" as RegistrationStatus,
    adminNotes:
      "Submitted ELO is lower than verified ELO. Admin should confirm if Challenge bracket is still correct.",
  },
  {
    id: "reg-003",
    player: "SteelFox",
    discord: "@steelfox",
    steamName: "SteelFox_IT",
    country: "Italy",
    region: "Europe",
    timezone: "CET / Rome",
    tournament: "4v4 Beta Tournament",
    bracket: "4v4",
    elo: 1310,
    verifiedElo: 1312,
    eloStatus: "Verified",
    status: "approved" as RegistrationStatus,
    adminNotes:
      "Approved for 4v4 beta. Player information looks consistent.",
  },
  {
    id: "reg-004",
    player: "RangerNine",
    discord: "@rangernine",
    steamName: "RangerNineUS",
    country: "United States",
    region: "North America",
    timezone: "EST / New York",
    tournament: "Operation Skyfall",
    bracket: "Challenge",
    elo: 980,
    verifiedElo: 1460,
    eloStatus: "Mismatch",
    status: "rejected" as RegistrationStatus,
    adminNotes:
      "Large ELO mismatch. Registration rejected until player provides correct information.",
  },
];

const filters = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Manual Review", value: "manual_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
] as const;

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
  ];

  return validFilters.includes(filter as FilterStatus)
    ? (filter as FilterStatus)
    : "all";
}

function parseOverrides(overrides?: string) {
  const result: Record<string, RegistrationStatus> = {};

  if (!overrides) return result;

  overrides.split(",").forEach((item) => {
    const [id, status] = item.split(":");

    if (
      id &&
      ["pending", "manual_review", "approved", "rejected"].includes(status)
    ) {
      result[id] = status as RegistrationStatus;
    }
  });

  return result;
}

function buildHref({
  filter,
  selected,
  overrides,
}: {
  filter: FilterStatus;
  selected?: string;
  overrides?: string;
}) {
  const params = new URLSearchParams();

  params.set("filter", filter);

  if (selected) params.set("selected", selected);
  if (overrides) params.set("overrides", overrides);

  return `/admin?${params.toString()}`;
}

function buildStatusOverrideHref({
  registrationId,
  nextStatus,
  activeFilter,
  selected,
  currentOverrides,
}: {
  registrationId: string;
  nextStatus: RegistrationStatus;
  activeFilter: FilterStatus;
  selected?: string;
  currentOverrides: Record<string, RegistrationStatus>;
}) {
  const nextOverrides = {
    ...currentOverrides,
    [registrationId]: nextStatus,
  };

  const overridesString = Object.entries(nextOverrides)
    .map(([id, status]) => `${id}:${status}`)
    .join(",");

  return buildHref({
    filter: activeFilter,
    selected,
    overrides: overridesString,
  });
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { sessionClaims } = await auth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  if (!isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const activeFilter = getSafeFilter(params?.filter);
  const statusOverrides = parseOverrides(params?.overrides);

  const registrationsWithState = registrations.map((registration) => ({
    ...registration,
    status: statusOverrides[registration.id] ?? registration.status,
  }));

  const selectedRegistration = registrationsWithState.find(
    (registration) => registration.id === params?.selected
  );

  const filteredRegistrations =
    activeFilter === "all"
      ? registrationsWithState
      : registrationsWithState.filter(
          (registration) => registration.status === activeFilter
        );

  const stats = [
    {
      label: "Pending Registrations",
      value: registrationsWithState.filter((item) => item.status === "pending")
        .length,
      filter: "pending",
      icon: Clock,
    },
    {
      label: "Manual Reviews",
      value: registrationsWithState.filter(
        (item) => item.status === "manual_review"
      ).length,
      filter: "manual_review",
      icon: ShieldAlert,
    },
    {
      label: "Approved Players",
      value: registrationsWithState.filter((item) => item.status === "approved")
        .length,
      filter: "approved",
      icon: CheckCircle,
    },
    {
      label: "Rejected Players",
      value: registrationsWithState.filter((item) => item.status === "rejected")
        .length,
      filter: "rejected",
      icon: XCircle,
    },
    {
      label: "Active Tournaments",
      value: 2,
      filter: "all",
      icon: Trophy,
    },
  ] as const;

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-16 text-white">
      <section className="mx-auto max-w-7xl space-y-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-8 shadow-2xl"
          style={{
            backgroundImage: "url('/images/ironclad-background.jpg')",
          }}
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
                href={buildHref({
                  filter: stat.filter,
                  overrides: params?.overrides,
                })}
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
          <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Registration Review</h2>

              <p className="mt-1 text-sm text-zinc-400">
                Showing {filteredRegistrations.length} registration(s).
              </p>
            </div>

            <div className="relative z-50 flex flex-col gap-3 sm:items-end">
              <div className="rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm text-orange-300">
                Current Filter: {formatStatus(activeFilter)}
              </div>

              <details className="group relative z-50">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-full border border-orange-500/30 bg-black/60 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/10">
                  <Filter className="h-4 w-4" />

                  <span>Filters</span>

                  <span className="flex flex-col gap-1">
                    <span className="h-0.5 w-4 rounded-full bg-orange-300" />
                    <span className="h-0.5 w-4 rounded-full bg-orange-300" />
                    <span className="h-0.5 w-4 rounded-full bg-orange-300" />
                  </span>
                </summary>

                <div className="absolute right-0 top-full z-50 mt-3 w-56 rounded-2xl border border-orange-500/30 bg-black/95 p-3 shadow-2xl shadow-orange-950/40 backdrop-blur">
                  <div className="space-y-2">
                    {filters.map((filter) => {
                      const isActive = activeFilter === filter.value;

                      return (
                        <Link
                          key={filter.value}
                          href={buildHref({
                            filter: filter.value,
                            overrides: params?.overrides,
                          })}
                          className={`block rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? "border-orange-400 bg-orange-500/20 text-orange-300"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-orange-500/50 hover:text-orange-300"
                          }`}
                        >
                          {filter.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </details>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-4">Player</th>
                  <th>Tournament</th>
                  <th>Bracket</th>
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
                      {registration.player}
                    </td>

                    <td>{registration.tournament}</td>
                    <td>{registration.bracket}</td>
                    <td>{registration.elo}</td>
                    <td>{registration.country}</td>
                    <td>{registration.discord}</td>

                    <td>
                      <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-300">
                        {formatStatus(registration.status)}
                      </span>
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildHref({
                            filter: activeFilter,
                            selected: registration.id,
                            overrides: params?.overrides,
                          })}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-500/30 px-3 py-1 text-xs text-orange-300 hover:bg-orange-500/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </Link>

                        <Link
                          href={buildStatusOverrideHref({
                            registrationId: registration.id,
                            nextStatus: "approved",
                            activeFilter,
                            currentOverrides: statusOverrides,
                          })}
                          className="rounded-lg border border-green-500/30 px-3 py-1 text-xs text-green-400 hover:bg-green-500/10"
                        >
                          Approve
                        </Link>

                        <Link
                          href={buildStatusOverrideHref({
                            registrationId: registration.id,
                            nextStatus: "rejected",
                            activeFilter,
                            currentOverrides: statusOverrides,
                          })}
                          className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          Reject
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRegistrations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-zinc-500">
                      No registrations found for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="relative z-0 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
            <h2 className="text-2xl font-bold">Registration Workflow</h2>

            <div className="mt-6 space-y-4">
              {[
                "Submitted",
                "ELO Check",
                "Admin Review",
                "Approved / Rejected",
                "Player Confirmed",
              ].map((step, index) => (
                <div key={step} className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-sm font-bold text-orange-300">
                    {index + 1}
                  </div>

                  <div className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-300">
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                  {selectedRegistration.player}
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  Full player registration review and admin decision panel.
                </p>
              </div>

              <Link
                href={buildHref({
                  filter: activeFilter,
                  overrides: params?.overrides,
                })}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-zinc-400 transition hover:border-orange-500/50 hover:text-orange-300"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Player Name", selectedRegistration.player],
                ["Discord", selectedRegistration.discord],
                ["Steam Name", selectedRegistration.steamName],
                ["Country", selectedRegistration.country],
                ["Region", selectedRegistration.region],
                ["Timezone", selectedRegistration.timezone],
                ["Tournament", selectedRegistration.tournament],
                ["Bracket", selectedRegistration.bracket],
                ["Submitted ELO", selectedRegistration.elo],
                ["Verified ELO", selectedRegistration.verifiedElo],
                ["ELO Status", selectedRegistration.eloStatus],
                ["Registration Status", formatStatus(selectedRegistration.status)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>
                  <p className="mt-2 font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
              <p className="text-xs uppercase tracking-wider text-orange-300">
                Admin Notes
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {selectedRegistration.adminNotes}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={buildStatusOverrideHref({
                  registrationId: selectedRegistration.id,
                  nextStatus: "approved",
                  activeFilter,
                  selected: selectedRegistration.id,
                  currentOverrides: statusOverrides,
                })}
                className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20"
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </Link>

              <Link
                href={buildStatusOverrideHref({
                  registrationId: selectedRegistration.id,
                  nextStatus: "rejected",
                  activeFilter,
                  selected: selectedRegistration.id,
                  currentOverrides: statusOverrides,
                })}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Link>

              <Link
                href={buildStatusOverrideHref({
                  registrationId: selectedRegistration.id,
                  nextStatus: "manual_review",
                  activeFilter,
                  selected: selectedRegistration.id,
                  currentOverrides: statusOverrides,
                })}
                className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
              >
                <AlertTriangle className="h-4 w-4" />
                Mark Manual Review
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}