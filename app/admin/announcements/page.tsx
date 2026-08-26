import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdminAnnouncements from "@/components/AdminAnnouncements";
import { loadAdminAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Official Announcements | IronClad Admin",
  description: "Publish and withdraw official IronClad announcements.",
};

export default async function AdminAnnouncementsPage() {
  const { userId, sessionClaims } = await auth();
  const role = (
    sessionClaims as { metadata?: { role?: string } } | null
  )?.metadata?.role;

  if (!userId || role !== "admin") redirect("/");

  const result = await loadAdminAnnouncements();
  return (
    <AdminAnnouncements
      announcements={result.announcements}
      loadFailed={!result.ok}
    />
  );
}
