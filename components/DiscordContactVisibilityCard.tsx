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
  const [enabled, setEnabled] = useState(initialEnabled && hasDiscordUsername);
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState<
    "success" | "error" | null
  >(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggleVisibility = () => {
    if (pending || !hasDiscordUsername) return;

    const nextEnabled = !enabled;
    setMessage("");
    setMessageStatus(null);

    startTransition(async () => {
      const result = await updateDiscordPublicEnabled(nextEnabled);

      if (result.status === "success") {
        setEnabled(result.enabled);
        setMessage(result.message);
        setMessageStatus(result.status);
        router.refresh();
        return;
      }

      setEnabled(result.enabled);
      setMessage(result.message);
      setMessageStatus(result.status);
    });
  };

  return (
    <section className="border border-orange-500/25 bg-black/65 p-5 shadow-xl shadow-black/25 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
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
          Discord is optional but strongly recommended for coordination. If you
          add a username, you can separately choose whether it appears on your
          public IronClad profile.
        </p>
      </div>

      {!hasDiscordUsername && (
        <div className="mt-4 border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80">
          Discord contact is unavailable until you add an optional username to
          your player profile.
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={pending || !hasDiscordUsername}
        onClick={toggleVisibility}
        className="mt-5 flex w-full items-center justify-between gap-4 border border-white/10 bg-black/45 p-2 text-left transition hover:border-orange-400/45 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
      >
        <span className="flex items-center gap-3 px-2 text-sm font-bold text-zinc-200">
          {enabled ? (
            <Eye size={17} className="text-emerald-300" />
          ) : (
            <EyeOff size={17} className="text-zinc-500" />
          )}
          {pending
            ? "Updating..."
            : !hasDiscordUsername
              ? "Add Discord in Profile"
              : enabled
                ? "Turn Off"
                : "Turn On"}
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
            messageStatus === "error"
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
