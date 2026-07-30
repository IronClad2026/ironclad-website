import { ArrowLeft, Globe2, MapPin, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import DiscordContactButton from "@/components/DiscordContactButton";
import ScrollReveal from "@/components/ScrollReveal";
import type { PublicPlayerProfile } from "@/lib/public-players";

type PublicPlayerProfileHeaderProps = {
  player: PublicPlayerProfile;
};

export default function PublicPlayerProfileHeader({
  player,
}: PublicPlayerProfileHeaderProps) {
  const displayName = player.playerName || player.displayName;
  const eloLabel =
    typeof player.currentElo === "number" ? String(player.currentElo) : "Unrated";

  return (
    <section className="relative overflow-hidden border-b border-orange-500/20 px-6 pt-32 pb-12">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-55"
        style={{
          backgroundImage: "url('/images/ironclad-background.jpg')",
        }}
      />
      <div className="absolute inset-0 bg-black/68" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94)),linear-gradient(108deg,rgba(0,0,0,0.96),rgba(0,0,0,0.64),rgba(249,115,22,0.16))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:64px_64px] opacity-20" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />

      <ScrollReveal className="relative z-10 mx-auto max-w-7xl">
        <Link
          href="/players"
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-4 py-2 text-sm font-bold text-zinc-300 shadow-xl shadow-black/10 backdrop-blur transition hover:border-orange-400/45 hover:bg-orange-500/10 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to Players
        </Link>

        <div className="mt-10 grid gap-8 lg:grid-cols-[auto_1fr_380px] lg:items-end">
          <div
            role="img"
            aria-label={`${displayName} avatar`}
            className="grid h-36 w-36 place-items-center overflow-hidden rounded-3xl border border-orange-400/35 bg-black/55 bg-cover bg-center shadow-[0_0_24px_rgba(249,115,22,0.16)]"
            style={
              player.avatarUrl
                ? { backgroundImage: `url("${player.avatarUrl}")` }
                : undefined
            }
          >
            {!player.avatarUrl && (
              <UserRound size={58} className="text-zinc-600" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-300">
              Public Player Profile
            </p>
            <h1 className="mt-4 break-words text-5xl font-black tracking-tight text-white md:text-7xl">
              {displayName}
            </h1>
            {player.displayName && player.displayName !== displayName && (
              <p className="mt-3 break-words text-xl font-bold text-zinc-300">
                {player.displayName}
              </p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <Pill icon={Shield} label={`ELO ${eloLabel}`} tone="orange" />
              <Pill
                icon={Globe2}
                label={player.country?.trim() || "Unknown country"}
              />
              {player.region?.trim() && (
                <Pill icon={MapPin} label={player.region} />
              )}
            </div>
          </div>

          <DiscordContactButton
            discordPublicEnabled={player.discordPublicEnabled}
            discordUsername={player.discordUsername}
          />
        </div>
      </ScrollReveal>
    </section>
  );
}

function Pill({
  icon: Icon,
  label,
  tone = "zinc",
}: {
  icon: typeof Shield;
  label: string;
  tone?: "orange" | "zinc";
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${
        tone === "orange"
          ? "border-orange-400/35 bg-orange-500/10 text-orange-200"
          : "border-white/12 bg-black/45 text-zinc-300"
      }`}
    >
      <Icon size={16} />
      {label}
    </span>
  );
}
