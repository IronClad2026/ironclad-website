import { auth } from "@clerk/nextjs/server";
import { UserRound } from "lucide-react";
import Link from "next/link";
import IronCladUserButton from "@/components/IronCladUserButton";
import {
  isPlayerProfileComplete,
  type PlayerProfile,
} from "@/lib/player-profile";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-errors";

export default async function HomeAccountSection() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <AccountShell
        eyebrow="IronClad Account"
        title="Create your competitive identity"
        description="Sign in or create an account, complete your player profile once, and use it for faster tournament registration."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-in"
            className="rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white transition hover:bg-orange-400"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-center font-bold text-white transition hover:border-orange-500/60 hover:bg-orange-500/10"
          >
            Create Account
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
        eyebrow="IronClad Account"
        title="Profile status unavailable"
        description="Your account is signed in, but IronClad could not load your player profile. Refresh the page or open your profile to try again."
      >
        <Link
          href="/profile"
          className="inline-flex rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 font-bold text-orange-300 transition hover:bg-orange-500/20"
        >
          Open Player Profile
        </Link>
      </AccountShell>
    );
  }

  const profile = (data ?? null) as PlayerProfile | null;
  const profileComplete = isPlayerProfileComplete(profile);

  if (!profile || !profileComplete) {
    return (
      <AccountShell
        eyebrow="Player Profile"
        title="Complete your player profile"
        description="Tournament registration requires a completed IronClad player profile so your IGN, region, ELO, and verification details can be reused."
        profileComplete={false}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/profile"
            className="rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white transition hover:bg-orange-400"
          >
            Complete Player Profile
          </Link>
          <IronCladUserButton />
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      eyebrow="Player Profile"
      title={profile.display_name}
      description="Your IronClad competitive identity is ready for tournament participation."
      profileComplete
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <PlayerAvatar
          avatarUrl={profile.avatar_url}
          displayName={profile.display_name}
        />
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
          <ProfileValue label="IGN" value={profile.in_game_name} />
          <ProfileValue
            label="Current ELO"
            value={String(profile.current_elo ?? "N/A")}
          />
          <ProfileValue label="Country" value={profile.country ?? "N/A"} />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/dashboard"
          className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-center font-bold text-orange-300 transition hover:bg-orange-500/20"
        >
          Player Dashboard
        </Link>
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
        <IronCladUserButton />
      </div>
    </AccountShell>
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
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  profileComplete?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
      <div
        className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-cover bg-center p-7 shadow-2xl md:p-10"
        style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
      >
        <div className="absolute inset-0 bg-black/85" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-orange-950/40" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-3xl">
            <div className="group/profile-heading relative w-fit">
              <div className="relative w-fit">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-400">
                  {eyebrow}
                </p>

                {profileComplete !== undefined && (
                  <span
                    className={`pointer-events-none absolute top-1/2 left-full ml-3 -translate-y-1/2 whitespace-nowrap text-xs font-bold uppercase tracking-wider opacity-0 transition-opacity duration-300 group-hover/profile-heading:opacity-100 ${
                      profileComplete ? "text-emerald-300" : "text-orange-300"
                    }`}
                  >
                    {profileComplete
                      ? "✓ Profile Completed"
                      : "⚠ Profile Incomplete"}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-3xl font-bold md:text-4xl">{title}</h2>
            </div>
            <p className="mt-4 leading-7 text-zinc-300">{description}</p>
          </div>
          <div className="min-w-0 lg:min-w-[360px]">{children}</div>
        </div>
      </div>
    </section>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 font-bold text-white">{value}</p>
    </div>
  );
}
