"use client";

import { Eye, EyeOff, MessageCircle, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDiscordPublicEnabled } from "@/app/dashboard/actions";

type DiscordContactVisibilityCardProps = {
  initialEnabled: boolean;
  hasDiscordUsername: boolean;
};

export default function DiscordContactVisibilityCard({
  initialEnabled,
  hasDiscordUsername,
}: DiscordContactVisibilityCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggleVisibility = () => {
    if (pending) return;

    const nextEnabled = !enabled;
    setMessage("");

    startTransition(async () => {
      const result = await updateDiscordPublicEnabled(nextEnabled);

      if (result.status === "success") {
        setEnabled(result.enabled);
        setMessage(result.message);
        router.refresh();
        return;
      }

      setMessage(result.message);
    });
  };

  return (
    <section className="rounded-2xl border border-orange-500/25 bg-[linear-gradient(135deg,rgba(249,115,22,0.09),rgba(255,255,255,0.03))] p-5 shadow-xl shadow-black/20 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
          <MessageCircle size={20} />
        </span>

        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
            enabled
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300"
              : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-white">
          Discord Contact
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Allow other players to contact you through Discord from your public
          IronClad profile.
        </p>
      </div>

      {!hasDiscordUsername && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">
          Add a Discord username to your player profile before this can appear
          publicly.
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending}
        onClick={toggleVisibility}
        className="mt-5 flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-2 text-left transition hover:border-orange-400/35 disabled:cursor-wait disabled:opacity-70"
      >
        <span className="flex items-center gap-3 px-2 text-sm font-bold text-zinc-200">
          {enabled ? (
            <Eye size={17} className="text-emerald-300" />
          ) : (
            <EyeOff size={17} className="text-zinc-500" />
          )}
          {pending ? "Updating..." : enabled ? "Turn Off" : "Turn On"}
        </span>

        <span
          className={`relative h-8 w-14 rounded-full border transition ${
            enabled
              ? "border-emerald-400/45 bg-emerald-500/25"
              : "border-white/10 bg-zinc-800"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-lg transition ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </span>
      </button>

      {message && (
        <p
          className={`mt-4 flex items-start gap-2 text-xs leading-5 ${
            message.includes("could not") || message.includes("Complete")
              ? "text-red-300"
              : "text-emerald-300"
          }`}
        >
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
    </section>
  );
}
