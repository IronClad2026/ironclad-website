import {
  loadTournamentCompetitionList,
  type PublicTournamentListStatus,
} from "@/lib/competition-read-models/tournament-list";
import { runPartnerRead } from "@/lib/partner-api/http";
import {
  invalidPartnerRequest,
  readPartnerPagination,
  readPartnerQuery,
} from "@/lib/partner-api/input";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runPartnerRead(request, "tournaments.list", async (measure) => {
    const query = readPartnerQuery(request, ["status", "limit", "offset"]);
    const pagination = readPartnerPagination(query, 5);
    const status = query.get("status");
    if (
      status !== null &&
      !["upcoming", "registration_open", "in_progress", "completed"].includes(
        status,
      )
    )
      invalidPartnerRequest();
    const result = await measure(() =>
      loadTournamentCompetitionList(createSupabaseAdminClient(), {
        ...pagination,
        status: (status ?? undefined) as PublicTournamentListStatus | undefined,
      }),
    );
    return { data: result.data, pagination: result.pagination };
  });
}
