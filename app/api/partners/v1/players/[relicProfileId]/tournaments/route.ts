import {
  loadPlayerCompetitionHistory,
  projectPublicPlayerCompetitionLookup,
} from "@/lib/competition-read-models/players";
import { PartnerApiError, runPartnerRead } from "@/lib/partner-api/http";
import {
  readPartnerPagination,
  readPartnerQuery,
  readPartnerRelicId,
} from "@/lib/partner-api/input";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ relicProfileId: string }> },
) {
  return runPartnerRead(request, "players.tournaments", async (measure) => {
    const query = readPartnerQuery(request, ["limit", "offset"]);
    const pagination = readPartnerPagination(query, 10);
    const relicId = readPartnerRelicId((await context.params).relicProfileId);
    const result = await measure(() =>
      loadPlayerCompetitionHistory(
        createSupabaseAdminClient(),
        relicId,
        pagination,
      ),
    );
    const disclosure = projectPublicPlayerCompetitionLookup(result);
    if (
      disclosure.outcome !== "FOUND_VISIBLE" ||
      result.outcome !== "FOUND_VISIBLE"
    )
      throw new PartnerApiError(404, "player_not_available");
    return {
      data: disclosure.player,
      // Do not reveal internal candidate totals/progress, including withdrawn
      // registrations that have no public competitive history.
      pagination,
    };
  });
}
