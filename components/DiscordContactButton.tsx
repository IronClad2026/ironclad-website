"use client";

import { Check, Copy, MessageCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";

type DiscordContactButtonProps = {
  discordUsername: string | null;
  discordPublicEnabled: boolean;
};

export default function DiscordContactButton({
  discordUsername,
  discordPublicEnabled,
}: DiscordContactButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const canContact = discordPublicEnabled && Boolean(discordUsername?.trim());

  async function copyDiscordUsername() {
    if (!discordUsername) return;

    try {
      await navigator.clipboard.writeText(discordUsername);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  if (!canContact) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
        <div className="flex items-center gap-3 text-zinc-400">
          <ShieldAlert size={18} />
          <p className="text-sm font-bold">Discord contact not available.</p>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          This player has not opted into public Discord contact.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-sky-200">
            <MessageCircle size={18} />
            Discord Contact
          </p>
          <p className="mt-2 text-xs leading-5 text-sky-100/75">
            This player has opted into public Discord contact.
          </p>
        </div>

        <button
          type="button"
          onClick={copyDiscordUsername}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300/35 bg-sky-400/15 px-4 py-3 text-sm font-black text-sky-100 transition hover:border-sky-200/70 hover:bg-sky-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
        >
          {status === "copied" ? <Check size={17} /> : <Copy size={17} />}
          Contact Player
        </button>
      </div>

      {status !== "idle" && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
            Discord Username
          </p>
          <p className="mt-1 break-words font-bold text-white">
            {discordUsername}
          </p>
          <p className="mt-2 text-xs text-sky-100/70">
            {status === "copied"
              ? "Copied to clipboard."
              : "Clipboard access was unavailable. Copy the username manually."}
          </p>
        </div>
      )}
    </div>
  );
}
