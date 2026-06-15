import { auth } from "@clerk/nextjs/server";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldAlert,
  Target,
  Trophy,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardChampionHistory from "@/components/DashboardChampionHistory";
import DashboardMatchHistory from "@/components/DashboardMatchHistory";
import DashboardNotifications from "@/components/DashboardNotifications";
import {
  loadPlayerCareerDashboard,
  type PlayerStatistics,
} from "@/lib/player-dashboard";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "manual_review";

type PlayerRegistration = {
  id: string;
  tournament_title: string;
  bracket_name: string;
  registration_status: RegistrationStatus;
  elo_status: string;
  submitted_elo: number | null;
  admin_notes: string | null;
  created_at: string;
};

export default async function PlayerDashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const [profileResult, registrationsResult, career] = await Promise.all([
    supabase
      .from("players")
      .select(
        "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
      )
      .eq("clerk_user_id", userId)
      .maybeSingle(),
    supabase
      .from("registrations")
      .select(
        "id, tournament_title, bracket_name, registration_status, elo_status, submitted_elo, admin_notes, created_at"
      )
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false }),
    loadPlayerCareerDashboard(userId),
  ]);

  if (profileResult.error) {
    console.error("Dashboard profile load error:", profileResult.error);
  }

  if (registrationsResult.error) {
    console.error(
      "Dashboard registrations load error:",
      registrationsResult.error
    );
  }

  const profile = (profileResult.data ?? null) as PlayerProfile | null;
  const registrations = (registrationsResult.data ??
    []) as PlayerRegistration[];
  const profileComplete = isPlayerProfileComplete(profile);

  return (
    <main className="min-h-screen bg-black px-6 pt-32 pb-20 text-white">
      <div className="mx-auto max-w-7xl">
        <header
          className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-8 shadow-2xl md:p-10"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        >
          <div className="absolute inset-0 bg-black/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-orange-950/40" />

          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-orange-400">
              IronClad Command Center
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              Player Dashboard
            </h1>
            <p className="mt-5 max-w-2xl leading-7 text-zinc-300">
              Review your competitive profile and track every IronClad
              tournament registration.
            </p>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur md:p-8">
          {profileResult.error ? (
            <DashboardError message="Your player profile could not be loaded." />
          ) : profile ? (
            <div className="grid gap-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <PlayerAvatar
                avatarUrl={profile.avatar_url}
                displayName={profile.display_name}
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black text-white">
                    {profile.display_name}
                  </h2>
                  <CompletionBadge complete={profileComplete} />
                </div>
                <p className="mt-2 text-lg font-bold text-orange-300">
                  {profile.in_game_name}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ProfileValue label="Country" value={profile.country} />
                  <ProfileValue label="Region" value={profile.region} />
                  <ProfileValue label="Timezone" value={profile.timezone} />
                  <ProfileValue
                    label="Current ELO"
                    value={String(profile.current_elo ?? "N/A")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/profile"
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-center font-bold text-white transition hover:border-orange-500/60 hover:bg-orange-500/10"
                >
                  View/Edit Profile
                </Link>
                <Link
                  href="/tournaments"
                  className="rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white transition hover:bg-orange-400"
                >
                  Go to Tournaments
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Player profile required
                </h2>
                <p className="mt-2 text-zinc-400">
                  Complete your IronClad profile before registering for events.
                </p>
              </div>
              <Link
                href="/profile"
                className="rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white transition hover:bg-orange-400"
              >
                Complete Player Profile
              </Link>
            </div>
          )}
        </section>

        <DashboardNotifications
          key={career.notifications
            .map((notification) => `${notification.id}:${notification.status}`)
            .join("|")}
          notifications={career.notifications}
        />

        {career.error && (
          <div className="mt-6">
            <DashboardError message={career.error} />
          </div>
        )}

        <PlayerStatisticsSection statistics={career.statistics} />
        <DashboardChampionHistory champions={career.champions} />
        <DashboardMatchHistory matches={career.matchHistory} />

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
                Tournament Activity
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">
                Registration Status
              </h2>
            </div>
            <p className="text-sm text-zinc-500">
              {registrations.length}{" "}
              {registrations.length === 1 ? "registration" : "registrations"}
            </p>
          </div>

          {registrationsResult.error ? (
            <div className="mt-6">
              <DashboardError message="Your tournament registrations could not be loaded." />
            </div>
          ) : registrations.length === 0 ? (
            <EmptyRegistrations />
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {registrations.map((registration) => (
                <RegistrationCard
                  key={registration.id}
                  registration={registration}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PlayerStatisticsSection({
  statistics,
}: {
  statistics: PlayerStatistics;
}) {
  const values = [
    { label: "Matches Played", value: statistics.matchesPlayed },
    { label: "Matches Won", value: statistics.matchesWon },
    { label: "Matches Lost", value: statistics.matchesLost },
    { label: "Win Rate", value: `${statistics.winRate}%` },
    {
      label: "Tournaments Participated",
      value: statistics.tournamentsParticipated,
    },
    { label: "Tournaments Won", value: statistics.tournamentsWon },
  ];

  return (
    <section className="mt-10">
      <SectionHeading
        eyebrow="Competitive Record"
        title="Player Statistics"
        icon={Target}
      />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {values.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
          >
            <p className="text-2xl font-black text-white">{item.value}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: typeof Trophy;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
        <Icon size={15} />
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold text-white">{title}</h2>
    </div>
  );
}

function PlayerAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${displayName} avatar`}
      className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-orange-500/50 bg-black/60 bg-cover bg-center shadow-[0_0_35px_rgba(249,115,22,0.2)]"
      style={
        avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined
      }
    >
      {!avatarUrl && <UserRound size={48} className="text-zinc-600" />}
    </div>
  );
}

function CompletionBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
        complete
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-orange-500/40 bg-orange-500/10 text-orange-300"
      }`}
    >
      {complete ? "Profile Complete" : "Profile Incomplete"}
    </span>
  );
}

function ProfileValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 break-words font-bold text-white">{value || "N/A"}</p>
    </div>
  );
}

function RegistrationCard({
  registration,
}: {
  registration: PlayerRegistration;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#111318] p-6 shadow-2xl shadow-black/20 transition hover:border-orange-500/30">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-orange-300">
            <Trophy size={18} />
            <p className="text-xs font-black uppercase tracking-[0.22em]">
              Tournament Registration
            </p>
          </div>
          <h3 className="mt-3 break-words text-xl font-black text-white">
            {registration.tournament_title}
          </h3>
          <p className="mt-2 text-sm font-semibold text-zinc-400">
            {registration.bracket_name}
          </p>
        </div>
        <StatusBadge status={registration.registration_status} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <RegistrationValue
          label="ELO Status"
          value={formatStatus(registration.elo_status || "pending")}
        />
        <RegistrationValue
          label="Submitted ELO"
          value={String(registration.submitted_elo ?? "N/A")}
        />
        <RegistrationValue
          label="Submitted"
          value={formatDate(registration.created_at)}
        />
      </div>

      <RegistrationDecision registration={registration} />
    </article>
  );
}

function RegistrationDecision({
  registration,
}: {
  registration: PlayerRegistration;
}) {
  const content = {
    approved: {
      title: "Registration approved",
      message:
        "Your place has been approved. Monitor IronClad for bracket and schedule updates.",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    },
    rejected: {
      title: "Registration rejected",
      message:
        "Your registration was not approved for this event. Review the admin note below when available.",
      className: "border-red-500/30 bg-red-500/10 text-red-200",
    },
    manual_review: {
      title: "Manual review required",
      message:
        "An administrator needs additional review before making a final decision.",
      className:
        "border-orange-500/30 bg-orange-500/10 text-orange-200",
    },
    pending: {
      title: "Pending review",
      message:
        "Your registration has been received and is waiting for administrator review.",
      className: "border-white/10 bg-white/[0.04] text-zinc-300",
    },
  }[registration.registration_status] ?? {
    title: "Registration status",
    message: "Your registration status will be updated after admin review.",
    className: "border-white/10 bg-white/[0.04] text-zinc-300",
  };
  const showAdminNote =
    (registration.registration_status === "rejected" ||
      registration.registration_status === "manual_review") &&
    Boolean(registration.admin_notes?.trim());

  return (
    <div className={`mt-4 rounded-xl border p-4 ${content.className}`}>
      <p className="text-sm font-black uppercase tracking-wider">
        {content.title}
      </p>
      <p className="mt-2 text-sm leading-6 opacity-90">{content.message}</p>

      {showAdminNote && (
        <div className="mt-3 border-t border-current/20 pt-3">
          <p className="text-xs font-black uppercase tracking-wider opacity-70">
            Admin Note
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {registration.admin_notes}
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  const content = {
    approved: {
      label: "Approved",
      icon: CheckCircle2,
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    rejected: {
      label: "Rejected",
      icon: XCircle,
      className: "border-red-500/40 bg-red-500/10 text-red-300",
    },
    manual_review: {
      label: "Manual Review",
      icon: ShieldAlert,
      className: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    },
    pending: {
      label: "Pending",
      icon: Clock3,
      className: "border-white/15 bg-white/5 text-zinc-300",
    },
  }[status] ?? {
    label: formatStatus(status || "pending"),
    icon: Clock3,
    className: "border-white/15 bg-white/5 text-zinc-300",
  };
  const Icon = content.icon;

  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wider ${content.className}`}
    >
      <Icon size={14} />
      {content.label}
    </span>
  );
}

function RegistrationValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function EmptyRegistrations() {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-300">
        <CalendarDays size={25} />
      </div>
      <h3 className="mt-5 text-xl font-bold text-white">
        No tournament registrations yet
      </h3>
      <p className="mx-auto mt-2 max-w-lg leading-7 text-zinc-400">
        When you register for an IronClad tournament, its approval and ELO
        verification status will appear here.
      </p>
      <Link
        href="/tournaments"
        className="mt-6 inline-flex rounded-xl bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-400"
      >
        Explore Tournaments
      </Link>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
      <MapPin size={20} className="shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  if (!value) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
