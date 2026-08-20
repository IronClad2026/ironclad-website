import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Badge Collection | IronClad",
  description: "Review your IronClad badge collection.",
};

export default async function DashboardBadgeCollectionPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const dashboardBadgeData = buildDashboardBadgeData();

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-black bg-cover bg-center bg-fixed px-4 pt-32 pb-20 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.92),rgba(0,0,0,0.78) 44%,rgba(0,0,0,0.95)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.11),rgba(0,0,0,0.92)),url('/images/sfondi/7.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <DashboardBadgeCollection badgeData={dashboardBadgeData} />
    </main>
  );
}
