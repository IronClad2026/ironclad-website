import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260812100000_tournament_hard_delete_guard.sql";
const previousMigrationName =
  "20260613108000_deletion_tracks_report_group_replays.sql";
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const functionStart = compactMigration.indexOf(
  "create or replace function public.delete_tournament_data("
);
const functionEnd = compactMigration.indexOf("$$;", functionStart);
const deleteFunction = compactMigration.slice(functionStart, functionEnd);
const guardMessage =
  "tournament has launched or contains competitive history and cannot be permanently deleted.";
const guardEnd = deleteFunction.indexOf(guardMessage);
const bracketLock = deleteFunction.indexOf(
  "from public.tournament_brackets as bracket where bracket.tournament_id = p_tournament_id order by bracket.id for update"
);
const registrationLock = deleteFunction.indexOf(
  "from public.registrations as registration where registration.tournament_id = p_tournament_id or registration.tournament_bracket_id in"
);
const guard = deleteFunction.slice(bracketLock, guardEnd);
const previousMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", previousMigrationName),
  "utf8"
)
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const previousFunctionStart = previousMigration.indexOf(
  "create or replace function public.delete_tournament_data("
);
const previousFunctionEnd = previousMigration.indexOf(
  "$$;",
  previousFunctionStart
);
const previousDeleteFunction = previousMigration.slice(
  previousFunctionStart,
  previousFunctionEnd
);

const actionsSource = readFileSync(
  resolve(process.cwd(), "app/admin/tournaments/actions.ts"),
  "utf8"
);
const pageSource = readFileSync(
  resolve(
    process.cwd(),
    "app/admin/tournaments/[tournamentId]/page.tsx"
  ),
  "utf8"
);
const editorSource = readFileSync(
  resolve(
    process.cwd(),
    "components/admin/tournaments/TournamentEditor.tsx"
  ),
  "utf8"
);

describe("competitive tournament hard-delete guard migration", () => {
  it("is ordered after the current RPC and replaces the existing signature", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    ).sort();

    expect(migrationNames.indexOf(previousMigrationName)).toBeGreaterThan(-1);
    expect(migrationNames.indexOf(migrationName)).toBeGreaterThan(
      migrationNames.indexOf(previousMigrationName)
    );
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(functionStart).toBeGreaterThan(-1);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(deleteFunction).toContain(
      "p_tournament_id uuid, p_deleted_by text ) returns jsonb language plpgsql security definer set search_path = public"
    );
    expect(
      compactMigration.match(
        /create or replace function public\.delete_tournament_data\(/g
      )
    ).toHaveLength(1);
    expect(deleteFunction).not.toMatch(
      /p_(force|override|skip_guard)|force\s*=|skip_guard\s*=/
    );
  });

  it("locks the target and its divisions before every guard and side effect", () => {
    const tournamentLock = deleteFunction.indexOf(
      "from public.tournaments where id = p_tournament_id for update"
    );
    const preview = deleteFunction.indexOf(
      "v_counts := public.get_tournament_deletion_preview(p_tournament_id)"
    );
    const deletionJob = deleteFunction.indexOf(
      "insert into public.tournament_deletion_jobs"
    );
    const deletionGuc = deleteFunction.indexOf(
      "perform set_config('ironclad.tournament_deletion', 'on', true)"
    );

    expect(tournamentLock).toBeGreaterThan(-1);
    expect(bracketLock).toBeGreaterThan(tournamentLock);
    expect(registrationLock).toBeGreaterThan(bracketLock);
    expect(deleteFunction.slice(registrationLock, guardEnd)).toContain(
      "order by registration.id for update"
    );
    expect(guardEnd).toBeGreaterThan(registrationLock);
    expect(preview).toBeGreaterThan(guardEnd);
    expect(deletionJob).toBeGreaterThan(preview);
    expect(deletionGuc).toBeGreaterThan(deletionJob);
  });

  it("blocks launched divisions and generated competition brackets", () => {
    expect(guard).toContain("bracket.launched_at is not null");
    expect(guard).toContain("from public.generated_brackets as generated");
    expect(guard).toContain(
      "on bracket.id = generated.tournament_bracket_id"
    );
    expect(guard).toContain(
      "where bracket.tournament_id = p_tournament_id"
    );
  });

  it("blocks authoritative match and result history", () => {
    for (const marker of [
      "match.status <> 'scheduled'",
      "match.player_one_score is not null",
      "match.player_two_score is not null",
      "match.winner_registration_id is not null",
      "match.official_result_submission_id is not null",
      "match.official_result_decided_by is not null",
      "match.official_result_decided_at is not null",
      "match.outcome_type is not null",
      "from public.match_result_submissions as submission",
      "from public.match_result_report_groups as report_group",
    ]) {
      expect(guard).toContain(marker);
    }

    expect(guard).toContain(
      "report_group.tournament_id = p_tournament_id or report_group.match_id in"
    );
  });

  it("blocks every tournament or division-linked point event", () => {
    const pointGuard = guard.slice(
      guard.indexOf("from public.leaderboard_point_events as event")
    );

    expect(pointGuard).toContain("event.tournament_id = p_tournament_id");
    expect(pointGuard).toContain("event.tournament_bracket_id in");
    expect(pointGuard).toContain("event.registration_id in");
    expect(pointGuard).toContain(
      "registration.tournament_id = p_tournament_id or registration.tournament_bracket_id in"
    );
    expect(pointGuard).not.toContain("event.source");
    expect(pointGuard).not.toContain("event.event_type");
    expect(pointGuard).not.toContain("event.points");
  });

  it("returns one stable safe refusal and preserves the service-role boundary", () => {
    expect(deleteFunction).toContain("errcode = 'p0001'");
    expect(deleteFunction).toContain(`message = '${guardMessage}'`);
    expect(compactMigration).toContain(
      "revoke all on function public.delete_tournament_data(uuid, text) from public, anon, authenticated"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.delete_tournament_data(uuid, text) to service_role"
    );
  });

  it("preserves the existing database and Storage-cleanup result contract", () => {
    const cleanupStart = "if position(v_banner_marker";

    expect(deleteFunction.slice(deleteFunction.indexOf(cleanupStart))).toBe(
      previousDeleteFunction.slice(previousDeleteFunction.indexOf(cleanupStart))
    );

    for (const contract of [
      "submission.replay_storage_path",
      "submission.screenshot_storage_path",
      "report_group.replay_storage_path",
      "insert into public.tournament_deletion_jobs",
      "delete from public.match_result_submissions",
      "delete from public.generated_brackets",
      "delete from public.registrations",
      "delete from public.tournament_brackets",
      "delete from public.tournaments",
      "'job_id', v_job_id",
      "'proof_paths', to_jsonb(v_proof_paths)",
      "'banner_paths', to_jsonb(v_banner_paths)",
      "'deleted_counts', v_counts",
    ]) {
      expect(deleteFunction).toContain(contract);
    }
  });
});

describe("competitive hard-delete application contract", () => {
  it("recognizes only the exact safe database refusal", () => {
    expect(actionsSource).toContain(
      'const TOURNAMENT_HARD_DELETE_GUARD_CODE = "P0001";'
    );
    expect(actionsSource).toContain(
      `"${guardMessage.charAt(0).toUpperCase()}${guardMessage.slice(1)}";`
    );
    expect(actionsSource).toContain(
      "if (isTournamentHardDeleteGuardError(error))"
    );
    expect(actionsSource).toContain(
      "error.code === TOURNAMENT_HARD_DELETE_GUARD_CODE"
    );
    expect(actionsSource).toContain(
      "error.message === TOURNAMENT_HARD_DELETE_GUARD_MESSAGE"
    );
  });

  it("posts no bypass and shows the dedicated safe admin notice", () => {
    const deleteAction = actionsSource.slice(
      actionsSource.indexOf("export async function deleteTournament"),
      actionsSource.indexOf(
        "export async function retryTournamentStorageCleanup"
      )
    );

    expect(deleteAction).toContain(
      'supabase.rpc("delete_tournament_data", {'
    );
    expect(deleteAction).toContain("p_tournament_id: tournamentId");
    expect(deleteAction).toContain("p_deleted_by: userId");
    expect(deleteAction).not.toMatch(/force|override|skip_guard/i);
    expect(editorSource).toContain('| "delete-protected"');
    expect(pageSource).toContain(
      "This tournament has launched or contains competitive history and can no longer be permanently deleted. Use the tournament recovery workflow instead."
    );
  });
});
