type SteamConnectionResult =
  | "connected"
  | "cancelled"
  | "already-connected"
  | "duplicate"
  | "failed";

type SteamConnectionCardProps = {
  connected: boolean;
  hasPlayer: boolean;
  result: SteamConnectionResult | null;
  statusAvailable: boolean;
};

const resultMessages: Record<
  SteamConnectionResult,
  { message: string; tone: "success" | "error" | "neutral" }
> = {
  connected: {
    message: "Your Steam account is now connected.",
    tone: "success",
  },
  cancelled: {
    message: "Steam connection was cancelled.",
    tone: "neutral",
  },
  "already-connected": {
    message: "A Steam account is already connected to this IronClad account.",
    tone: "neutral",
  },
  duplicate: {
    message:
      "This Steam account is already connected to another IronClad account.",
    tone: "error",
  },
  failed: {
    message: "Steam could not be connected. Please try again.",
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
  const resultMessage =
    result && (result !== "connected" || connected)
      ? resultMessages[result]
      : null;

  return (
    <section className="group relative isolate mt-8 overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(249,115,22,0.08),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35 md:p-8">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          Verified Game Identity
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Steam Connection</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Connect Steam to prove ownership of your game identity. Your Steam
          account is not used to sign in to IronClad.
        </p>

        {resultMessage ? (
          <div
            aria-live="polite"
            className={`mt-5 border p-4 text-sm ${resultToneClasses[resultMessage.tone]}`}
          >
            {resultMessage.message}
          </div>
        ) : null}

        <div className="mt-6">
          {!hasPlayer ? (
            <p className="text-sm font-semibold text-zinc-300">
              Save your profile before connecting Steam.
            </p>
          ) : !statusAvailable ? (
            <p className="text-sm font-semibold text-zinc-300">
              Steam connection status is temporarily unavailable.
            </p>
          ) : connected ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex items-center gap-2 self-start border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-emerald-400"
                />
                Steam connected
              </div>
              <form action="/api/steam/connect" method="post">
                <button
                  type="submit"
                  className="border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-orange-400/50 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                >
                  Refresh Steam Display Name
                </button>
              </form>
            </div>
          ) : (
            <form action="/api/steam/connect" method="post">
              <button
                type="submit"
                className="border border-orange-500 bg-orange-600 px-5 py-3 font-bold text-white transition hover:border-orange-400 hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              >
                Connect Steam Account
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
