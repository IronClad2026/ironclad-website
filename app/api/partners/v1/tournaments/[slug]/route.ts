import { loadTournamentCompetitionView } from "@/lib/competition-read-models/tournaments";
import { PartnerApiError, runPartnerRead } from "@/lib/partner-api/http";
import { readPartnerQuery, readPartnerSlug } from "@/lib/partner-api/input";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return runPartnerRead(request, "tournaments.detail", async (measure) => {
    readPartnerQuery(request, []);
    const slug = readPartnerSlug((await context.params).slug);
    const tournament = await measure(() =>
      loadTournamentCompetitionView(createSupabaseAdminClient(), slug),
    );
    // Native direct-reference history retains cancelled/voided event facts.
    // Discovery filtering belongs to the bounded list selector.
    if (!tournament) throw new PartnerApiError(404, "tournament_not_available");
    return { data: tournament };
  });
}
