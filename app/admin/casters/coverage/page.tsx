import { notFound } from "next/navigation";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import CoverageWorkspace from "./CoverageWorkspace";

export const dynamic = "force-dynamic";

export default async function CasterCoverageAdminPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[]; tournamentPage?: string | string[]; tournamentQuery?: string | string[] }>;
}) {
  if (!isCasterProgramEnabled()) notFound();
  const { page, tournamentPage, tournamentQuery } = await searchParams;
  return <CoverageWorkspace page={page} tournamentPage={tournamentPage} tournamentQuery={tournamentQuery} />;
}
