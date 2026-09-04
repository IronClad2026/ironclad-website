import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260903190000_not_held_next_event_invitations.sql";
const previousMigrationName = "20260903160000_division_accounting_cutover.sql";
const migration = readSource("supabase/migrations", migrationName);
const compact = migration.toLowerCase().replace(/\s+/g, " ").trim();
const adminActions = readSource("app/admin/tournaments/actions.ts");
const playerActions = readSource("app/dashboard/registration-actions.ts");
const tournamentExperience = readSource("components/TournamentsExperience.tsx");
const notifications = readSource("lib/notifications.ts");

function readSource(...path: string[]) {
  return readFileSync(resolve(process.cwd(), ...path), "utf8").replaceAll(
    "\r\n",
    "\n"
  );
}

function extractFunction(name: string) {
  const markers = [
    `create function public.${name}(`,
    `create or replace function public.${name}(`,
  ];
  const start = markers.reduce((found, marker) => {
    const index = compact.indexOf(marker);
    return found < 0 || (index >= 0 && index < found) ? index : found;
  }, -1);
  const end = compact.indexOf("$$;", start);
  if (start < 0 || end < 0) throw new Error(`${name} was not found.`);
  return compact.slice(start, end + 3);
}

const createInvitation = extractFunction(
  "create_tournament_division_invitation"
);
const respondToInvitation = extractFunction(
  "respond_to_tournament_division_invitation"
);
const reconcileInvitations = extractFunction(
  "reconcile_tournament_division_invitations"
);

describe("Not Held next-event invitation migration", () => {
  it("adds one protected durable record without a parallel queue, worker, or registration writer", () => {
    const migrations = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrations.indexOf(migrationName)).toBeGreaterThan(
      migrations.indexOf(previousMigrationName)
    );
    expect(compact.startsWith("begin;")).toBe(true);
    expect(compact.endsWith("commit;")).toBe(true);
    expect(compact).toContain(
      "create table public.tournament_division_invitations"
    );
    expect(compact).toContain(
      "alter table public.tournament_division_invitations force row level security"
    );
    expect(compact).toContain(
      "grant select on table public.tournament_division_invitations to service_role"
    );
    expect(compact).not.toMatch(/create table[^;]*(?:queue|worker)/);
    expect(compact).not.toContain("insert into public.registrations");
    expect(compact).not.toContain("submit_verified_player_registration(");
    expect(compact).toContain(
      "references public.registrations(id) on delete cascade"
    );
    expect(compact).toContain(
      "references public.players(id) on delete cascade"
    );
  });

  it("requires a legitimate preserved Not Held source and one explicit matching target", () => {
    expect(createInvitation).toContain(
      "join public.tournament_division_not_held_closures as closure"
    );
    expect(createInvitation).toContain(
      "v_source_registration.registration_status not in ( 'pending', 'manual_review', 'approved', 'waitlisted' )"
    );
    expect(createInvitation).toContain(
      "v_recipient.account_closed_at is not null"
    );
    expect(createInvitation).toContain(
      "p_target_tournament_bracket_id = v_source_registration.tournament_bracket_id or v_target_bracket_name is distinct from v_source_bracket_name"
    );
    expect(createInvitation).toContain(
      "v_target_tournament_status not in ('registration_open', 'in_progress')"
    );
    expect(createInvitation).toContain(
      "player already has a registration in the target event"
    );
    expect(createInvitation).toContain(
      "the matching division has another unresolved ranked cycle"
    );
  });

  it("deduplicates active invitations and their independent notification type", () => {
    expect(compact).toContain(
      "create unique index tournament_division_invitations_one_pending_target_idx"
    );
    expect(createInvitation).toContain(
      "on conflict (recipient_player_id, target_tournament_bracket_id) where status = 'pending' do nothing"
    );
    expect(createInvitation).toContain("'tournament.division_invitation'");
    expect(createInvitation).toContain("'division-invitation:%s'");
    expect(createInvitation).toContain(
      "on conflict (recipient_clerk_user_id, event_key) where event_key is not null do nothing"
    );
    expect(createInvitation).not.toContain("badge.unlocked");
  });

  it("records only the invitation decision and returns the target to the existing registration UX", () => {
    expect(respondToInvitation).toContain("v_response not in ('accept', 'decline')");
    expect(respondToInvitation).toContain(
      "player.clerk_user_id = v_actor and player.account_closed_at is null"
    );
    expect(respondToInvitation).toContain(
      "perform public.reconcile_tournament_division_invitations("
    );
    expect(respondToInvitation).toContain(
      "status = case when v_response = 'accept' then 'accepted' else 'declined' end"
    );
    expect(respondToInvitation).toContain("'targettournamentslug'");
    expect(respondToInvitation).not.toContain("public.registrations");
  });

  it("locks recipient, target, then invitation to avoid lifecycle deadlocks", () => {
    const recipientLock = respondToInvitation.indexOf("select player.*");
    const targetLock = respondToInvitation.indexOf(
      "select tournament.id, tournament.slug"
    );
    const invitationLock = respondToInvitation.indexOf(
      "-- lifecycle writers lock the target before invalidating invitations"
    );

    expect(recipientLock).toBeGreaterThan(0);
    expect(targetLock).toBeGreaterThan(recipientLock);
    expect(invitationLock).toBeGreaterThan(targetLock);
    expect(respondToInvitation.slice(0, recipientLock)).not.toContain(
      "for update"
    );
  });

  it("invalidates pending records through existing lifecycle facts and read-time reconciliation", () => {
    for (const reason of [
      "account_closed",
      "already_registered",
      "target_division_launched",
      "target_division_not_held",
      "target_event_terminal",
      "target_registration_unavailable",
    ]) {
      expect(reconcileInvitations).toContain(`'${reason}'`);
    }

    expect(compact).toContain(
      "create trigger tournaments_sync_division_invitation_availability"
    );
    expect(compact).toContain(
      "create trigger tournament_brackets_sync_division_invitation_availability"
    );
    expect(compact).toContain(
      "create trigger not_held_sync_division_invitation_availability"
    );
    expect(compact).toContain(
      "create trigger registrations_sync_division_invitation_availability"
    );
    expect(compact).toContain(
      "create trigger players_sync_division_invitation_availability"
    );
    expect(reconcileInvitations).toContain(
      "registration.tournament_id = target_tournament.id"
    );
    expect(compact).toContain(
      "elsif tg_table_name = 'registrations' then perform public.reconcile_tournament_division_invitations( new.tournament_id, null, new.profile_id )"
    );
  });

  it("keeps Badge, Reveal, point, season, and Not Held authorities untouched", () => {
    expect(compact).not.toMatch(
      /(?:insert into|update|delete from) public\.player_badge_(?:awards|reveals)\b/
    );
    expect(compact).not.toMatch(
      /(?:insert into|update|delete from) public\.leaderboard_(?:point_events|tournament_season_memberships)\b/
    );
    expect(compact).not.toMatch(
      /create(?: or replace)? function public\.close_tournament_division_without_launch\(/
    );
    expect(compact).not.toMatch(
      /create(?: or replace)? function public\.(?:cancel|void)_tournament\(/
    );
  });

  it("keeps every mutation authority service-role only", () => {
    for (const signature of [
      "public.create_tournament_division_invitation( uuid, uuid, text )",
      "public.respond_to_tournament_division_invitation( uuid, text, text )",
      "public.reconcile_tournament_division_invitations( uuid, uuid, uuid )",
    ]) {
      expect(compact).toContain(
        `revoke all on function ${signature} from public, anon, authenticated, service_role`
      );
      expect(compact).toContain(
        `grant execute on function ${signature} to service_role`
      );
    }
  });

  it("connects acceptance to the existing registration UX without another writer", () => {
    expect(adminActions).toContain(
      'supabase.rpc(\n    "create_tournament_division_invitation"'
    );
    expect(playerActions).toContain(
      '"respond_to_tournament_division_invitation"'
    );
    expect(playerActions).toContain(
      '`/tournaments?tournament=${encodeURIComponent(tournament)}&register=1`'
    );
    expect(tournamentExperience).toContain(
      'const rawRegisterParam = searchParams.get("register")'
    );
    expect(tournamentExperience).toContain("void handleRegisterClick()");
    expect(notifications).toContain(
      'row.type === "tournament.division_invitation"'
    );
    expect(notifications).toContain('return "/dashboard#division-invitations"');
  });
});
