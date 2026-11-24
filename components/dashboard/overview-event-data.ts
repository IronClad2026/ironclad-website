import "server-only";

import { createNoStoreSupabaseClient } from "@/lib/supabase";
import type { TournamentStatus } from "@/lib/tournaments";
import type { DashboardOverviewTournament } from "./overview-event-presentation";

type EventRow = {
  id: string;
  slug: string;
  title: string;
  banner_image_url: string | null;
  status: TournamentStatus;
  registration_enabled: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  tournament_brackets: { id: string; launched_at: string | null }[];
};

/** Public fields only, through the existing public RLS policies. No player records. */
export async function loadDashboardOverviewEvents(): Promise<{ events: DashboardOverviewTournament[]; error: boolean }> {
  try {
    const client = createNoStoreSupabaseClient();
    const [result, notHeld] = await Promise.all([
      client.from("tournaments")
        .select("id,slug,title,banner_image_url,status,registration_enabled,registration_open_at,registration_close_at,start_date,tournament_brackets(id,launched_at)")
        .in("status", ["upcoming", "registration_open", "in_progress"])
        .order("start_date", { ascending: false }).limit(80),
      client.rpc("get_tournament_division_not_held_states"),
    ]);
    if (result.error || !Array.isArray(result.data) || notHeld.error || !Array.isArray(notHeld.data)) {
      throw new Error("Public event overview unavailable");
    }
    const notHeldIds = new Set(notHeld.data.map((row: { tournament_bracket_id?: unknown }) => row.tournament_bracket_id));
    return {
      events: (result.data as EventRow[])
        .filter(row => /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(row.slug) && row.title.trim() && Array.isArray(row.tournament_brackets))
        .map(row => ({
          id: row.id, slug: row.slug, title: row.title, bannerImageUrl: row.banner_image_url,
          status: row.status, registrationEnabled: row.registration_enabled,
          registrationOpenAt: row.registration_open_at, registrationCloseAt: row.registration_close_at,
          startDate: row.start_date,
          brackets: row.tournament_brackets.map(bracket => ({
            id: bracket.id, launchedAt: bracket.launched_at, notHeld: notHeldIds.has(bracket.id),
          })),
        })),
      error: false,
    };
  } catch {
    console.error("Dashboard public event overview load failed.");
    return { events: [], error: true };
  }
}
