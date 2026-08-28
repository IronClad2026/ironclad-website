import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ChevronLeft, ShieldAlert, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminEloVerificationChecker from "@/components/AdminEloVerificationChecker";
import AdminLeaderboardControls from "@/components/AdminLeaderboardControls";
import {
  getCompletedLeaderboardTournaments,
  getRecentLeaderboardRecalculationRuns,
} from "@/lib/leaderboard/admin";
import {
  getEloVerificationSetting,
  getEloVerificationSupportLinkSetting,
} from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "System & Recovery | IronClad Admin",
  description: "Advanced recovery and legacy compatibility controls.",
};

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export default async function AdminSystemPage() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const [
    completedLeaderboardTournaments,
    leaderboardRecalculationRuns,
    eloVerificationSetting,
    eloVerificationSupportLinkSetting,
  ] = await Promise.all([
    getCompletedLeaderboardTournaments(),
    getRecentLeaderboardRecalculationRuns(8),
    getEloVerificationSetting(),
    getEloVerificationSupportLinkSetting(),
  ]);

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-orange-500/25 bg-[linear-gradient(135deg,rgba(24,24,27,0.96),rgba(67,20,7,0.42))] p-5 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Advanced Administration
              </p>
              <h1 className="mt-4 break-words text-4xl font-black tracking-tight sm:text-5xl">
                System &amp; Recovery
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
                Recovery and legacy compatibility controls for exceptional
                administrative work. Routine Tournament operations remain in
                their focused workspaces.
              </p>
            </div>

            <Link
              href="/admin"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-bold text-zinc-200 transition hover:border-orange-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 sm:w-fit xl:hidden"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Admin Dashboard
            </Link>
          </div>
        </header>

        <section
          aria-labelledby="leaderboard-recovery-heading"
          className="space-y-4"
        >
          <div className="border-l-2 border-orange-400 pl-4">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
              Recovery Tools
            </p>
            <h2
              id="leaderboard-recovery-heading"
              className="mt-2 flex items-center gap-2 text-2xl font-black text-white"
            >
              <Wrench className="h-5 w-5 text-orange-400" aria-hidden="true" />
              Leaderboard Recovery
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Use the existing recalculation workflow only after a verified
              scoring failure or an approved correction.
            </p>
          </div>

          <AdminLeaderboardControls
            completedTournaments={completedLeaderboardTournaments}
            recentRuns={leaderboardRecalculationRuns}
          />
        </section>

        <section
          aria-labelledby="legacy-compatibility-heading"
          className="space-y-4"
        >
          <div className="border-l-2 border-zinc-500 pl-4">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-400">
              Legacy Controls
            </p>
            <h2
              id="legacy-compatibility-heading"
              className="mt-2 text-2xl font-black text-white"
            >
              Legacy Compatibility
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Retained compatibility settings. Current Player registration
              continues to use the existing Steam and Relic verification
              workflow.
            </p>
          </div>

          <AdminEloVerificationChecker
            setting={eloVerificationSetting}
            supportLinkSetting={eloVerificationSupportLinkSetting}
          />
        </section>
      </div>
    </main>
  );
}
