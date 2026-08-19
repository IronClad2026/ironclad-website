"use client";

import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import englishAccountDictionary from "@/lib/i18n/dictionaries/en/account-dashboard";

type SteamConnectionResult =
  | "connected"
  | "cancelled"
  | "already-connected"
  | "display-name-failed"
  | "duplicate"
  | "failed"
  | "refreshed";

type SteamConnectionCardProps = {
  connected: boolean;
  hasPlayer: boolean;
  result: SteamConnectionResult | null;
  statusAvailable: boolean;
};

const resultMessages: Record<
  SteamConnectionResult,
  { messageKey: string; tone: "success" | "error" | "neutral" }
> = {
  connected: {
    messageKey: "steam.connectedResult",
    tone: "success",
  },
  refreshed: {
    messageKey: "steam.refreshedResult",
    tone: "success",
  },
  "display-name-failed": {
    messageKey: "steam.displayNameFailed",
    tone: "neutral",
  },
  cancelled: {
    messageKey: "steam.cancelled",
    tone: "neutral",
  },
  "already-connected": {
    messageKey: "steam.alreadyConnected",
    tone: "neutral",
  },
  duplicate: {
    messageKey: "steam.duplicate",
    tone: "error",
  },
  failed: {
    messageKey: "steam.failed",
    tone: "error",
  },
};

const resultToneClasses = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  neutral: "border-white/10 bg-white/5 text-zinc-300",
};

export default function SteamConnectionCard({
  connected,
  hasPlayer,
  result,
  statusAvailable,
}: SteamConnectionCardProps) {
  const t = useOptionalTranslations(
    "account-dashboard",
    englishAccountDictionary
  );
  const resultRequiresConnection =
    result === "connected" ||
    result === "refreshed" ||
    result === "display-name-failed";
  const resultMessage =
    result && (!resultRequiresConnection || connected)
      ? resultMessages[result]
      : null;

  return (
    <section className="group relative isolate mt-8 overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(249,115,22,0.08),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35 md:p-8">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          {t("steam.eyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">
          {t("steam.title")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          {t("steam.description")}
        </p>

        {resultMessage ? (
          <div
            aria-live="polite"
            className={`mt-5 border p-4 text-sm ${resultToneClasses[resultMessage.tone]}`}
          >
            {t(resultMessage.messageKey)}
          </div>
        ) : null}

        <div className="mt-6">
          {!hasPlayer ? (
            <p className="text-sm font-semibold text-zinc-300">
              {t("steam.saveFirst")}
            </p>
          ) : !statusAvailable ? (
            <p className="text-sm font-semibold text-zinc-300">
              {t("steam.unavailable")}
            </p>
          ) : connected ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 self-start border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-emerald-400"
                />
                {t("steam.connected")}
              </div>
              <form action="/api/steam/connect" method="post">
                <button
                  type="submit"
                  className="border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-orange-400/50 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                >
                  {t("steam.refreshName")}
                </button>
              </form>
            </div>
          ) : (
            <form action="/api/steam/connect" method="post">
              <button
                type="submit"
                className="border border-orange-500 bg-orange-600 px-5 py-3 font-bold text-white transition hover:border-orange-400 hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                {t("steam.connect")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
