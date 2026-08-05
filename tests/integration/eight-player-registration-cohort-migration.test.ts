import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASE_FOUR_ACTIVE_COHORT_SIZE,
  hasReachedActiveReviewMinimum,
  isActiveReviewCohortStatus,
} from "@/lib/tournament-registration-cohort";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260805150000_eight_player_registration_cohort.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();

function extractFunctionBody(functionName: string) {
  const start = compactMigration.indexOf(
    `create or replace function public.${functionName}`
  );
  const end = compactMigration.indexOf("$$;", start);

  if (start < 0 || end < 0) {
    throw new Error(`${functionName} body was not found.`);
  }

  return compactMigration.slice(start, end + 3);
}

type ModelRegistration = {
  id: string;
  bracketId: string;
  createdAt: number;
  status: "pending" | "manual_review" | "approved" | "rejected" | "waitlisted";
};

function admitRegistration(
  registrations: ModelRegistration[],
  input: Pick<ModelRegistration, "id" | "bracketId" | "createdAt">
) {
  const bracketRows = registrations.filter(
    (registration) => registration.bracketId === input.bracketId
  );
  const activeCount = bracketRows.filter((registration) =>
    isActiveReviewCohortStatus(registration.status)
  ).length;
  const hasWaitlist = bracketRows.some(
    (registration) => registration.status === "waitlisted"
  );
  const registration: ModelRegistration = {
    ...input,
    status:
      activeCount >= PHASE_FOUR_ACTIVE_COHORT_SIZE || hasWaitlist
        ? "waitlisted"
        : "pending",
  };

  registrations.push(registration);
  return registration;
}

function sortedWaitlist(registrations: ModelRegistration[], bracketId: string) {
  return registrations
    .filter(
      (registration) =>
        registration.bracketId === bracketId &&
        registration.status === "waitlisted"
    )
    .sort(
      (left, right) =>
        left.createdAt - right.createdAt || left.id.localeCompare(right.id)
    );
}

class DeterministicBracketLock {
  private tail = Promise.resolve();

  async run<T>(operation: () => T | Promise<T>) {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await operation();
    } finally {
      release();
    }
  }
}

describe("eight-player registration cohort migration", () => {
  it("replaces the registration guard and disables approval-driven generation", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );

    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).toContain(
      "drop trigger if exists registrations_refresh_generated_bracket_insert_delete on public.registrations;"
    );
    expect(compactMigration).toContain(
      "drop trigger if exists registrations_refresh_generated_bracket_update on public.registrations;"
    );
    expect(compactMigration).not.toContain(
      "drop function public.refresh_generated_bracket_on_approval"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.generate_tournament_bracket"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.save_bracket_assignments"
    );
    expect(guard).not.toContain("update public.tournaments");
    expect(compactMigration).not.toContain("insert into public.generated_brackets");
  });

  it("lets the administrator persist or clear the configured closing time", () => {
    const saveTournament = extractFunctionBody("save_tournament(");

    expect(saveTournament).toContain(
      "registration_close_at = p_registration_close_at"
    );
    expect(saveTournament).not.toContain(
      "registration_close_at = coalesce( p_registration_close_at, registration_close_at )"
    );
    expect(saveTournament).toContain(
      "p_registration_open_at >= p_registration_close_at"
    );
  });

  it("locks one division bracket before timestamping, counting, and allocating", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );
    const lockIndex = guard.indexOf("for update of bracket;");
    const timestampIndex = guard.indexOf(
      "new.created_at := clock_timestamp();"
    );
    const cohortCountIndex = guard.indexOf(
      "v_active_cohort_players",
      timestampIndex
    );
    const allocationIndex = guard.indexOf(
      "v_active_cohort_players >= v_active_cohort_limit"
    );

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(timestampIndex).toBeGreaterThan(lockIndex);
    expect(cohortCountIndex).toBeGreaterThan(timestampIndex);
    expect(allocationIndex).toBeGreaterThan(cohortCountIndex);
    expect(guard).toContain(
      "where tournament_bracket_id = new.tournament_bracket_id and id <> new.id"
    );
    expect(guard).toContain(
      "v_active_cohort_limit constant integer := 8"
    );
  });

  it("defines the active cohort with exactly the three review statuses", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );

    expect(guard).toContain(
      "count(*) filter ( where registration_status in ( 'pending', 'manual_review', 'approved' ) )"
    );
    expect(guard).not.toContain(
      "where registration_status in ( 'pending', 'manual_review', 'approved', 'waitlisted' )"
    );
    expect(guard).not.toContain(
      "where registration_status in ( 'pending', 'manual_review', 'approved', 'rejected' )"
    );
  });

  it("routes the ninth pending registration to the existing waitlist", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );

    expect(guard).toContain(
      "new.registration_status = 'pending' and v_active_cohort_players >= v_active_cohort_limit"
    );
    expect(guard).toContain("new.registration_status := 'waitlisted'");
    expect(guard).toContain(
      "tg_op = 'insert' and v_waitlisted_players > 0"
    );
    expect(guard).not.toContain("new.registration_status := 'approved'");
  });

  it("retains deterministic FIFO and manual promotion safeguards", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );

    expect(guard).toContain(
      "registration.created_at < new.created_at or ( registration.created_at = new.created_at and registration.id::text < new.id::text )"
    );
    expect(guard).toContain(
      "cannot approve a manual registration insert while waitlisted registrations exist for the same bracket"
    );
    expect(guard).toContain(
      "cannot promote this registration before older waitlisted registrations for the same bracket"
    );
    expect(guard).toContain(
      "old.registration_status = 'waitlisted' and new.registration_status = 'approved'"
    );
  });

  it("preserves the inclusive registration window and roster locks", () => {
    const guard = extractFunctionBody(
      "enforce_tournament_registration_availability()"
    );

    expect(guard).toContain("now() >= v_registration_open_at");
    expect(guard).toContain("now() <= v_registration_close_at");
    expect(guard).toContain(
      "public.is_tournament_bracket_roster_locked"
    );
    expect(guard).toContain(
      "tournament bracket roster is locked after bracket generation"
    );
  });

  it("does not reverify or modify an immutable Relic snapshot at the threshold", () => {
    expect(compactMigration).not.toContain(
      "create or replace function public.submit_verified_player_registration"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.protect_relic_registration_snapshot"
    );
    expect(compactMigration).not.toContain("update public.registrations");
    expect(compactMigration).not.toContain("elo_verified_elo =");
    expect(compactMigration).not.toContain("elo_verified_division =");
    expect(compactMigration).not.toContain(
      "drop index registrations_user_tournament_unique"
    );
  });

  it("keeps the replacement trigger function service-role-only", () => {
    expect(compactMigration).toContain(
      "alter function public.enforce_tournament_registration_availability() owner to postgres;"
    );
    expect(compactMigration).toContain(
      "revoke execute on function public.enforce_tournament_registration_availability() from public, anon, authenticated;"
    );
    expect(compactMigration).toContain(
      "grant execute on function public.enforce_tournament_registration_availability() to service_role;"
    );
  });
});

describe("deterministic eight-player allocation model", () => {
  it("keeps registrations one through seven below minimum and accepts the eighth", () => {
    const registrations: ModelRegistration[] = [];

    for (let position = 1; position <= 7; position += 1) {
      expect(
        admitRegistration(registrations, {
          id: `academy-${position}`,
          bracketId: "academy",
          createdAt: position,
        }).status
      ).toBe("pending");
      expect(hasReachedActiveReviewMinimum(position)).toBe(false);
    }

    expect(
      admitRegistration(registrations, {
        id: "academy-8",
        bracketId: "academy",
        createdAt: 8,
      }).status
    ).toBe("pending");
    expect(hasReachedActiveReviewMinimum(8)).toBe(true);
  });

  it("waitlists the ninth and later registrations in created-at/id order", () => {
    const registrations: ModelRegistration[] = Array.from(
      { length: 8 },
      (_, index) => ({
        id: `challenge-${index + 1}`,
        bracketId: "challenge",
        createdAt: index + 1,
        status: "pending" as const,
      })
    );

    expect(
      admitRegistration(registrations, {
        id: "challenge-b",
        bracketId: "challenge",
        createdAt: 9,
      }).status
    ).toBe("waitlisted");
    expect(
      admitRegistration(registrations, {
        id: "challenge-a",
        bracketId: "challenge",
        createdAt: 9,
      }).status
    ).toBe("waitlisted");
    expect(
      admitRegistration(registrations, {
        id: "challenge-c",
        bracketId: "challenge",
        createdAt: 10,
      }).status
    ).toBe("waitlisted");
    expect(
      sortedWaitlist(registrations, "challenge").map(({ id }) => id)
    ).toEqual(["challenge-a", "challenge-b", "challenge-c"]);
  });

  it("keeps Academy, Challenge, and Main allocation independent", () => {
    const registrations: ModelRegistration[] = [];

    for (const bracketId of ["academy", "challenge", "main"]) {
      for (let position = 1; position <= 8; position += 1) {
        expect(
          admitRegistration(registrations, {
            id: `${bracketId}-${position}`,
            bracketId,
            createdAt: position,
          }).status
        ).toBe("pending");
      }

      expect(
        admitRegistration(registrations, {
          id: `${bracketId}-9`,
          bracketId,
          createdAt: 9,
        }).status
      ).toBe("waitlisted");
    }

    for (const bracketId of ["academy", "challenge", "main"]) {
      expect(
        registrations.filter(
          (registration) =>
            registration.bracketId === bracketId &&
            isActiveReviewCohortStatus(registration.status)
        )
      ).toHaveLength(8);
      expect(sortedWaitlist(registrations, bracketId)).toHaveLength(1);
    }
  });

  it("counts pending, manual review, and approved while excluding terminal and queued rows", () => {
    const registrations: ModelRegistration[] = [
      { id: "1", bracketId: "main", createdAt: 1, status: "pending" },
      {
        id: "2",
        bracketId: "main",
        createdAt: 2,
        status: "manual_review",
      },
      { id: "3", bracketId: "main", createdAt: 3, status: "approved" },
      { id: "4", bracketId: "main", createdAt: 4, status: "rejected" },
      { id: "5", bracketId: "main", createdAt: 5, status: "waitlisted" },
    ];

    expect(
      registrations.filter((registration) =>
        isActiveReviewCohortStatus(registration.status)
      )
    ).toHaveLength(3);
  });

  it("models lock-serialized eighth and ninth admissions with one active place", async () => {
    const registrations: ModelRegistration[] = Array.from(
      { length: 7 },
      (_, index) => ({
        id: `main-${index + 1}`,
        bracketId: "main",
        createdAt: index + 1,
        status: "pending" as const,
      })
    );
    const lock = new DeterministicBracketLock();
    let admissionClock = 8;
    const submit = (id: string) =>
      lock.run(() =>
        admitRegistration(registrations, {
          id,
          bracketId: "main",
          createdAt: admissionClock++,
        })
      );

    const results = await Promise.all([submit("main-8"), submit("main-9")]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "pending",
      "waitlisted",
    ]);
    expect(
      registrations.filter((registration) =>
        isActiveReviewCohortStatus(registration.status)
      )
    ).toHaveLength(8);
  });
});
