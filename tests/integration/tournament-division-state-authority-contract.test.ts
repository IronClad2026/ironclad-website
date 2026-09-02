import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const loaderSource = compact(
  readFileSync(
    resolve(process.cwd(), "lib/tournament-division-state-data.ts"),
    "utf8"
  )
);
const publicPageSource = compact(
  readFileSync(resolve(process.cwd(), "app/tournaments/page.tsx"), "utf8")
);

describe("Tournament division-state authority contract", () => {
  it("keeps batch readiness evidence equivalent to the existing readiness RPC", () => {
    const capacity = latestFunction("get_tournament_bracket_capacity");
    const readiness = latestFunction("get_tournament_bracket_readiness");

    expect(basename(capacity.path)).toBe(
      "20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
    );
    expect(basename(readiness.path)).toBe(
      "20260806130000_phase4_withdrawal_waitlist_division_launch.sql"
    );
    expect(capacity.sql).toContain(
      "count(registration.id) filter ( where registration.registration_status = 'approved' )"
    );
    expect(capacity.sql).toContain(
      "where registration.registration_status in ( 'pending', 'manual_review', 'approved' )"
    );
    expect(capacity.sql).toContain(
      "registration.registration_status = 'waitlisted' and registration.waitlist_offer_status = 'offered'"
    );
    expect(capacity.sql).toContain("least(bracket.max_players, 8)");
    expect(readiness.sql).toContain(
      "count(registration.id) filter ( where registration.registration_status = 'approved' ) = least(bracket.max_players, 8)"
    );
    expect(readiness.sql).toContain(
      "registration.registration_status in ( 'pending', 'manual_review' )"
    );
    expect(readiness.sql).toContain(
      "registration.registration_status = 'waitlisted' and registration.waitlist_offer_status = 'offered'"
    );
    expect(readiness.sql).toContain(") = 0");
    expect(loaderSource).toContain(
      'supabase.rpc("get_tournament_bracket_capacity")'
    );
    expect(loaderSource).toContain(
      "approvedcount === requiredcount && activecohortcount === approvedcount"
    );
    expect(loaderSource).not.toContain(
      'supabase.rpc("get_tournament_bracket_readiness"'
    );
  });

  it("locks the read-only completion projection to the existing lifecycle authority", () => {
    const completion = latestFunction("is_generated_bracket_complete");

    expect(basename(completion.path)).toBe(
      "20260808100000_matchup_deadlines_double_forfeit.sql"
    );
    expect(completion.sql).toContain("if v_format = 'round_robin' then");
    expect(completion.sql).toContain(
      "where match.status <> 'completed' or match.winner_registration_id is null"
    );
    expect(completion.sql).toContain(
      "return v_match_count > 0 and v_incomplete_count = 0"
    );
    expect(completion.sql).toContain(
      "order by round.round_number desc, match.match_number desc limit 1"
    );
    expect(completion.sql).toContain(
      "match.status = 'completed' and ( match.winner_registration_id is not null or match.outcome_type in ( 'deadline_double_forfeit', 'empty_feeder' ) )"
    );
    expect(loaderSource).toContain(
      "tournament_matches(id, generated_bracket_id, match_number, status, outcome_type, winner_registration_id)"
    );
    expect(loaderSource).toContain(
      "matchgeneratedbracketid !== generatedbracketid"
    );
    expect(loaderSource).toContain('generated.format === "round_robin"');
    expect(loaderSource).toContain("matches.length > 0");
    expect(loaderSource).toContain('match.status === "completed"');
    expect(loaderSource).toContain("match.winnerregistrationid !== null");
    expect(loaderSource).toContain(
      'finalmatch.outcometype === "deadline_double_forfeit"'
    );
    expect(loaderSource).toContain(
      'finalmatch.outcometype === "empty_feeder"'
    );
    expect(loaderSource).not.toContain(
      'supabase.rpc("is_generated_bracket_complete"'
    );
  });

  it("reuses the public page's existing capacity and official-match snapshot", () => {
    expect(publicPageSource).toContain(
      "readinessrows: capacityresult.data"
    );
    expect(publicPageSource).toContain(
      "generatedbracketrows: generatedbracketresult.data"
    );
  });
});

function latestFunction(name: string) {
  const definitionPattern = new RegExp(
    `create(?: or replace)? function public\\.${name}\\s*\\(`,
    "g"
  );
  const migrations = readdirSync(migrationDirectory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .map((entry) => {
      const path = resolve(migrationDirectory, entry);
      return { path, sql: compact(readFileSync(path, "utf8")) };
    })
    .filter(({ sql }) => {
      definitionPattern.lastIndex = 0;
      return definitionPattern.test(sql);
    });
  const latest = migrations.at(-1);

  if (!latest) {
    throw new Error(`Latest ${name} authority definition was not found.`);
  }

  definitionPattern.lastIndex = 0;
  const definitions = [...latest.sql.matchAll(definitionPattern)];
  const start = definitions.at(-1)?.index ?? -1;
  const end = latest.sql.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`Latest ${name} authority definition was malformed.`);
  }

  return {
    path: latest.path,
    sql: latest.sql.slice(start, end + 3),
  };
}

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
