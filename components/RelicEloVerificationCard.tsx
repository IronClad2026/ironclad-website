"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  type RelicEloActionResult,
  type RelicEloSnapshot,
  verifyRelicProfileElo,
} from "@/app/profile/relic-elo-action";

type RelicEloVerification = Omit<
  RelicEloSnapshot,
  "faction" | "division"
> & {
  faction: string;
  division: string;
};

export type RelicEloVerificationCardProps = {
  hasPlayer: boolean;
  steamConnected: boolean;
  statusAvailable: boolean;
  initialVerification: RelicEloVerification | null;
  initialRefreshAvailableAt: string | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "Australia/Sydney",
  timeZoneName: "short",
  year: "numeric",
});

function formatDateTime(value: string) {
  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime())
    ? "Time unavailable"
    : dateTimeFormatter.format(timestamp);
}

function getRefreshAvailableAt(result: RelicEloActionResult) {
  return "refreshAvailableAt" in result
    ? result.refreshAvailableAt ?? null
    : null;
}

export default function RelicEloVerificationCard({
  hasPlayer,
  steamConnected,
  statusAvailable,
  initialVerification,
  initialRefreshAvailableAt,
}: RelicEloVerificationCardProps) {
  const [verification, setVerification] =
    useState<RelicEloVerification | null>(initialVerification);
  const [refreshAvailableAt, setRefreshAvailableAt] = useState(
    initialRefreshAvailableAt
  );
  const [feedback, setFeedback] = useState<{
    message: string;
    status: RelicEloActionResult["status"];
  } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const requestInFlight = useRef(false);

  const refreshAvailableAtMs = refreshAvailableAt
    ? Date.parse(refreshAvailableAt)
    : Number.NaN;
  const cooldownActive =
    Number.isFinite(refreshAvailableAtMs) && refreshAvailableAtMs > clock;

  useEffect(() => {
    if (!cooldownActive) return;

    const remaining = Math.max(0, refreshAvailableAtMs - Date.now());
    const timer = window.setTimeout(() => {
      setClock(Date.now());
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [cooldownActive, refreshAvailableAtMs]);

  const requestVerification = () => {
    if (
      requestInFlight.current ||
      pending ||
      cooldownActive ||
      !hasPlayer ||
      !steamConnected ||
      !statusAvailable
    ) {
      return;
    }

    requestInFlight.current = true;
    setFeedback(null);

    startTransition(async () => {
      try {
        const result = await verifyRelicProfileElo();
        const nextRefreshAvailableAt = getRefreshAvailableAt(result);

        if (result.status === "success") {
          setVerification(result.snapshot);
        }

        if (nextRefreshAvailableAt) {
          setClock(Date.now());
          setRefreshAvailableAt(nextRefreshAvailableAt);
        }

        setFeedback({
          message: result.message,
          status: result.status,
        });
      } catch {
        setFeedback({
          message: "ELO verification could not be completed right now.",
          status: "error",
        });
      } finally {
        requestInFlight.current = false;
      }
    });
  };

  const buttonLabel = verification ? "Refresh ELO" : "Verify ELO";
  const pendingLabel = verification ? "Refreshing..." : "Verifying...";
  const feedbackTone =
    feedback?.status === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : feedback?.status === "cooldown"
        ? "border-white/10 bg-white/5 text-zinc-300"
        : "border-red-500/30 bg-red-500/10 text-red-300";

  return (
    <section className="group relative isolate mt-8 overflow-hidden border border-white/12 bg-[linear-gradient(145deg,rgba(249,115,22,0.08),rgba(8,8,8,0.86))] p-6 shadow-2xl shadow-black/30 backdrop-blur transition hover:border-orange-400/35 md:p-8">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:56px_56px] opacity-10" />

      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          Competitive Rating
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">
          Verified Profile ELO
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Verify your current rated 1v1 ELO with Relic using your connected
          Steam game identity.
        </p>

        {!hasPlayer ? (
          <p className="mt-6 text-sm font-semibold text-zinc-300">
            Save your profile before verifying ELO.
          </p>
        ) : !statusAvailable ? (
          <p className="mt-6 text-sm font-semibold text-zinc-300">
            ELO verification status is temporarily unavailable.
          </p>
        ) : !steamConnected ? (
          <p className="mt-6 text-sm font-semibold text-zinc-300">
            Connect Steam before verifying ELO.
          </p>
        ) : (
          <>
            {verification ? (
              <div className="mt-6 border border-emerald-500/25 bg-emerald-500/5 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Verified ELO
                    </p>
                    <p className="mt-1 text-4xl font-black text-white">
                      {verification.elo.toLocaleString("en-AU")}
                    </p>
                  </div>
                  <span className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Relic verified
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-zinc-500">Faction</dt>
                    <dd className="mt-1 font-semibold text-zinc-200">
                      {verification.faction}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Division</dt>
                    <dd className="mt-1 font-semibold text-zinc-200">
                      {verification.division}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Source</dt>
                    <dd className="mt-1 font-semibold text-zinc-200">Relic</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Calculation version</dt>
                    <dd className="mt-1 font-semibold text-zinc-200">
                      {verification.calculationVersion}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500">Last verified</dt>
                    <dd className="mt-1 font-semibold text-zinc-200">
                      <time dateTime={verification.verifiedAt}>
                        {formatDateTime(verification.verifiedAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {feedback ? (
              <div
                aria-live="polite"
                className={`mt-5 border p-4 text-sm ${feedbackTone}`}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={pending || cooldownActive}
                onClick={requestVerification}
                className="border border-orange-500 bg-orange-600 px-5 py-3 font-bold text-white transition hover:border-orange-400 hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {pending ? pendingLabel : buttonLabel}
              </button>

              {cooldownActive && refreshAvailableAt ? (
                <p className="text-sm text-zinc-400">
                  Available again at{" "}
                  <time dateTime={refreshAvailableAt}>
                    {formatDateTime(refreshAvailableAt)}
                  </time>
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
