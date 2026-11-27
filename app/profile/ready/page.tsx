import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WardrobePilot from "@/components/ready/WardrobePilot";
import { getWardrobeState } from "@/lib/wardrobe/access";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";

export const metadata: Metadata = {
  title: "Ready Wardrobe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReadyWardrobePage() {
  if (!isReadyWardrobePilotEnabled()) notFound();
  return <WardrobePilot initial={await getWardrobeState()} />;
}
