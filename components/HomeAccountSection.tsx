import { auth } from "@clerk/nextjs/server";
import { UserRound } from "lucide-react";
import Link from "next/link";
import IronCladUserButton from "@/components/IronCladUserButton";
import ScrollReveal from "@/components/ScrollReveal";
import { getPlayerAvatarDisplayUrl } from "@/lib/avatar";
import { getLocalizedCountryName } from "@/lib/countries";
import {
  type PlayerProfile,
} from "@/lib/player-profile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-errors";
import { loadDictionary } from "@/lib/i18n/loaders";
import { formatNumber } from "@/lib/i18n/format";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";

const primaryActionClass =
  "inline-flex min-h-12 items-center justify-center border border-orange-400 bg-orange-500 px-5 py-3 text-center text-sm font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

const secondaryActionClass =
  "inline-flex min-h-12 items-center justify-center border border-white/15 bg-white/[0.04] px-5 py-3 text-center text-sm font-black text-white transition hover:border-orange-400/60 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

const orangeGhostActionClass =
  "inline-flex min-h-12 items-center justify-center border border-orange-400/45 bg-orange-500/10 px-5 py-3 text-center text-sm font-black text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300";

export default async function HomeAccountSection() {
  const { userId } = await auth();
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "account-dashboard");
  const t = (path: string, values?: Record<string, string | number>) =>
    translate(copy, path, values);

  if (!userId) {
    return (
      <AccountShell
        eyebrow={t("homeAccount.accountEyebrow")}
        title={t("homeAccount.createTitle")}
        description={t("homeAccount.createText")}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-in" className={primaryActionClass}>
            {t("homeAccount.signIn")}
          </Link>
          <Link href="/sign-up" className={secondaryActionClass}>
            {t("homeAccount.createAccount")}
          </Link>
        </div>
      </AccountShell>
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("players")
    .select(
      "id, clerk_user_id, display_name, in_game_name, discord_username, steam_username, coh3_player_card_url, country, region, timezone, current_elo, avatar_url, bio, profile_completed, created_at, updated_at"
    )
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("Home player profile load error:", error);

    return (
      <AccountShell
        eyebrow={t("homeAccount.accountEyebrow")}
        title={t("homeAccount.unavailableTitle")}
        description={t("homeAccount.unavailableText")}
      >
        <Link href="/profile" className={orangeGhostActionClass}>
          {t("homeAccount.openProfile")}
        </Link>
      </AccountShell>
    );
  }

  const profile = (data ?? null) as PlayerProfile | null;
  const profileComplete = profile?.profile_completed === true;

  if (!profile || !profileComplete) {
    return (
      <AccountShell
        eyebrow={t("homeAccount.profileEyebrow")}
        title={t("homeAccount.completeTitle")}
        description={t("homeAccount.completeText")}
        profileComplete={false}
        statusLabel={t("homeAccount.incomplete")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/profile" className={primaryActionClass}>
            {t("homeAccount.completeAction")}
          </Link>
          <IronCladUserButton />
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      eyebrow={t("homeAccount.profileEyebrow")}
      title={profile.display_name}
      description={t("homeAccount.readyText")}
      profileComplete
      statusLabel={t("homeAccount.complete")}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <PlayerAvatar
          avatarUrl={getPlayerAvatarDisplayUrl(profile)}
          avatarLabel={t("homeAccount.avatarLabel", {
            name: profile.display_name,
          })}
        />
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
          <ProfileValue
            label={t("homeAccount.inGameName")}
            value={profile.in_game_name}
          />
          <ProfileValue
            label={t("homeAccount.currentElo")}
            value={
              typeof profile.current_elo === "number"
                ? formatNumber(profile.current_elo, locale)
                : t("homeAccount.notAvailable")
            }
          />
          <ProfileValue
            label={t("homeAccount.country")}
            value={
              profile.country
                ? getLocalizedCountryName(profile.country, locale)
                : t("homeAccount.notAvailable")
            }
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/dashboard" className={orangeGhostActionClass}>
          {t("homeAccount.viewDashboard")}
        </Link>
        <Link href="/profile" className={secondaryActionClass}>
          {t("homeAccount.manageProfile")}
        </Link>
        <Link href="/tournaments" className={primaryActionClass}>
          {t("homeAccount.goTournaments")}
        </Link>
        <IronCladUserButton />
      </div>
    </AccountShell>
  );
}

function PlayerAvatar({
  avatarUrl,
  avatarLabel,
}: {
  avatarUrl: string | null;
  avatarLabel: string;
}) {
  return (
    <div
      role="img"
      aria-label={avatarLabel}
      className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-orange-500/50 bg-black/60 bg-cover bg-center shadow-[0_0_30px_rgba(249,115,22,0.18)]"
      style={
        avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined
      }
    >
      {!avatarUrl && <UserRound size={38} className="text-zinc-600" />}
    </div>
  );
}

function AccountShell({
  eyebrow,
  title,
  description,
  profileComplete,
  statusLabel = null,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  profileComplete?: boolean;
  statusLabel?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative isolate overflow-hidden border-b border-white/10 bg-cover bg-center px-5 py-24 sm:px-8 lg:px-12"
      style={{
        backgroundImage: "url('/images/sfondi/7.jpg')",
        backgroundPosition: "center 54%",
      }}
      aria-labelledby="home-account-heading"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.91),rgba(0,0,0,0.84)),linear-gradient(112deg,rgba(0,0,0,0.9),rgba(249,115,22,0.12),rgba(0,0,0,0.94))]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:64px_64px] opacity-25"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(115deg,transparent,rgba(249,115,22,0.1))]"
      />

      <ScrollReveal className="relative z-10 mx-auto max-w-7xl border border-orange-500/28 bg-black/70 p-6 shadow-2xl shadow-black/30 backdrop-blur md:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-black uppercase text-orange-300">
                {eyebrow}
              </p>

              {statusLabel && (
                <span
                  className={`border px-3 py-1 text-xs font-black uppercase ${
                    profileComplete
                      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                      : "border-orange-400/45 bg-orange-500/10 text-orange-200"
                  }`}
                >
                  {statusLabel}
                </span>
              )}
            </div>

            <h2
              id="home-account-heading"
              className="mt-4 text-3xl font-black leading-tight text-white md:text-4xl"
            >
              {title}
            </h2>
            <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
              {description}
            </p>
          </div>

          <div className="min-w-0 lg:min-w-[360px]">{children}</div>
        </div>
      </ScrollReveal>
    </section>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-white/10 bg-black/42 p-4">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 break-words font-black text-white">{value}</p>
    </div>
  );
}
