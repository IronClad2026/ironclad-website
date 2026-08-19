import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260818100000_phase15a_versioned_consent_discord.sql"
  ),
  "utf8"
);
const compactMigration = migration.toLowerCase().replace(/\s+/g, " ").trim();
const action = readFileSync(
  resolve(process.cwd(), "app/tournaments/actions.ts"),
  "utf8"
);
const tournamentUi = readFileSync(
  resolve(process.cwd(), "components/TournamentsExperience.tsx"),
  "utf8"
);

function between(startNeedle: string, endNeedle: string) {
  const start = compactMigration.indexOf(startNeedle);
  const end = compactMigration.indexOf(endNeedle, start + startNeedle.length);

  if (start < 0 || end < 0) {
    throw new Error(`Migration segment not found: ${startNeedle}`);
  }

  return compactMigration.slice(start, end);
}

describe("Phase 15A versioned consent and Discord database contract", () => {
  it("is one ordered transaction with no legal-document seed or acceptance backfill", () => {
    expect(compactMigration.startsWith("begin;")).toBe(true);
    expect(compactMigration.endsWith("commit;")).toBe(true);
    expect(compactMigration).not.toMatch(
      /insert into public\.legal_documents/
    );

    const acceptanceInserts = [
      ...compactMigration.matchAll(
        /insert into public\.registration_acceptances/g
      ),
    ];
    expect(acceptanceInserts).toHaveLength(1);
    expect(compactMigration).not.toMatch(
      /insert into public\.registration_acceptances[\s\S]*select[\s\S]*from public\.registrations/
    );
  });

  it("makes the participant-to-admin fallback atomic under concurrent requests", () => {
    expect(compactMigration).toContain(
      "create unique index notifications_match_admin_assistance_open_request_idx on public.notifications(actor_clerk_user_id, match_id)"
    );
    expect(compactMigration).toContain(
      "where recipient_role = 'admin' and type = 'match.admin_assistance_requested'"
    );
    expect(compactMigration).toContain("and in_app_hidden_at is null;");
  });

  it("creates the narrow authoritative document register", () => {
    const table = between(
      "create table public.legal_documents",
      "create unique index legal_documents_one_effective_kind_idx"
    );

    for (const field of [
      "document_kind text not null",
      "version text not null",
      "immutable_url text not null",
      "status text not null",
      "published_at timestamptz",
      "effective_at timestamptz",
      "sha256 text",
    ]) {
      expect(table).toContain(field);
    }

    expect(table).toContain(
      "document_kind in ('rulebook', 'ppa', 'terms', 'privacy')"
    );
    expect(table).toContain(
      "status in ('review_draft', 'effective', 'superseded')"
    );
    expect(table).toContain("sha256 ~ '^[0-9a-f]{64}$'");
    expect(table).toContain(
      "constraint legal_documents_kind_version_key unique (document_kind, version)"
    );
    expect(compactMigration).toContain(
      "where status = 'effective';"
    );
    expect(compactMigration).toContain(
      "versioned legal document identity is immutable"
    );
  });

  it("stores exactly one private immutable evidence snapshot per registration", () => {
    const table = between(
      "create table public.registration_acceptances",
      "create index registration_acceptances_tournament_id_idx"
    );

    expect(table).toContain("registration_id uuid not null unique");
    expect(table).toContain("tournament_id uuid not null");
    expect(table).toContain("clerk_user_id text not null");
    expect(table).toContain(
      "accepted_at timestamptz not null default clock_timestamp()"
    );
    expect(table).not.toContain("references public.registrations");
    expect(table).not.toContain("references public.tournaments");

    for (const prefix of ["rulebook", "ppa", "terms", "privacy"]) {
      expect(table).toContain(`${prefix}_document_id uuid not null`);
      expect(table).toContain(`${prefix}_version text not null`);
      expect(table).toContain(`${prefix}_url text not null`);
      expect(table).toContain(`${prefix}_sha256 text not null`);
    }

    for (const declaration of [
      "age_18_confirmed",
      "own_ironclad_account_confirmed",
      "linked_steam_account_confirmed",
    ]) {
      expect(table).toContain(`${declaration} boolean not null`);
      expect(table).toContain(`${declaration} is true`);
    }

    for (const forbidden of [
      "ip_address",
      "device_fingerprint",
      "browser_fingerprint",
      "user_agent",
    ]) {
      expect(table).not.toContain(forbidden);
    }
  });

  it("enforces both directions of atomic creation without breaking hard deletion", () => {
    expect(compactMigration).toContain(
      "create trigger registration_acceptances_guard_insert before insert on public.registration_acceptances"
    );
    expect(compactMigration).toContain(
      "where registration.id = new.registration_id for key share"
    );
    expect(compactMigration).toContain(
      "create constraint trigger registrations_require_acceptance after insert on public.registrations deferrable initially deferred"
    );
    expect(compactMigration).toContain(
      "every new registration requires one atomic acceptance"
    );
    expect(compactMigration).toContain(
      "registration acceptance cannot outlive a registration created in the same transaction"
    );
    expect(compactMigration).toContain(
      "registration acceptance evidence is immutable"
    );
    expect(compactMigration).toContain(
      "ironclad.legal_evidence_maintenance"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.close_ironclad_player_account"
    );
    expect(compactMigration).not.toContain(
      "create or replace function public.delete_tournament_data"
    );
  });

  it("keeps both tables private and the registration RPC as the only writer", () => {
    for (const table of ["legal_documents", "registration_acceptances"]) {
      expect(compactMigration).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(compactMigration).toContain(
        `alter table public.${table} force row level security`
      );
      expect(compactMigration).toContain(
        `revoke all on table public.${table} from public, anon, authenticated, service_role`
      );
      expect(compactMigration).toContain(
        `grant select on table public.${table} to service_role`
      );
    }

    expect(compactMigration).not.toContain("create policy");
    expect(compactMigration).toContain(
      ") from public, anon, authenticated, service_role; grant execute on function public.submit_verified_player_registration("
    );
    expect(compactMigration).toContain(") to service_role;");
  });

  it("loads exact document selectors and trusted facts before either atomic insert", () => {
    const rpc = between(
      "create function public.submit_verified_player_registration(",
      "alter function public.submit_verified_player_registration("
    );

    for (const selector of [
      "p_rulebook_document_id uuid",
      "p_ppa_document_id uuid",
      "p_terms_document_id uuid",
      "p_privacy_document_id uuid",
    ]) {
      expect(rpc).toContain(selector);
    }

    for (const control of [
      "p_rulebook_accepted is distinct from true",
      "p_ppa_accepted is distinct from true",
      "p_terms_accepted is distinct from true",
      "p_privacy_acknowledged is distinct from true",
      "p_age_18_confirmed is distinct from true",
      "p_account_and_steam_ownership_confirmed is distinct from true",
    ]) {
      expect(rpc).toContain(control);
    }

    const rpcSignature = rpc.slice(0, rpc.indexOf(") returns table"));
    expect(
      [
        ...rpcSignature.matchAll(/\b(p_[a-z0-9_]+)\s+(?:uuid|text|bigint|boolean)/g),
      ]
        .map((match) => match[1])
        .filter((name) => name !== "p_relic_calculation_version")
        .some((name) => /(version|url|sha256)/.test(name))
    ).toBe(false);
    expect(rpc.match(/for key share/g)).toHaveLength(4);
    expect(rpc).toContain("document.status = 'effective'");
    expect(rpc).toContain("document.effective_at <= v_consent_checked_at");

    const preliminaryReturn = rpc.indexOf(
      "waitlist_confirmation_required := true; return next; return;"
    );
    const registrationInsert = rpc.indexOf(
      "insert into public.registrations as inserted"
    );
    const acceptanceInsert = rpc.indexOf(
      "insert into public.registration_acceptances"
    );
    const playerUpdate = rpc.indexOf("update public.players as player");

    expect(preliminaryReturn).toBeGreaterThan(0);
    expect(preliminaryReturn).toBeLessThan(registrationInsert);
    expect(registrationInsert).toBeLessThan(acceptanceInsert);
    expect(acceptanceInsert).toBeLessThan(playerUpdate);
  });

  it("preserves the registration eligibility, Relic, division, duplicate, and waitlist guards", () => {
    const rpc = between(
      "create function public.submit_verified_player_registration(",
      "alter function public.submit_verified_player_registration("
    );

    for (const invariant of [
      "coalesce(auth.role(), '') <> 'service_role'",
      "player.clerk_user_id = p_clerk_user_id",
      "player.steam_id64 = p_steam_id64",
      "and player.profile_completed",
      "already registered for this tournament",
      "for update of bracket",
      "verified elo does not match the selected tournament division",
      "perform public.reconcile_tournament_waitlist",
      "v_waiting_count > 0",
      "elo_verification_source",
      "'relic'",
      "relic_elo_calculation_version = v_calculation_version",
    ]) {
      expect(rpc).toContain(invariant);
    }
  });

  it("removes Discord from database completion while normalizing blank visibility", () => {
    const profileFunction = between(
      "create or replace function public.protect_player_steam_id64()",
      "alter function public.protect_player_steam_id64()"
    );

    expect(profileFunction).toContain(
      "if nullif(btrim(new.discord_username), '') is null then new.discord_username = null; new.discord_public_enabled = false;"
    );
    const completion = profileFunction.slice(
      profileFunction.indexOf("new.profile_completed =")
    );
    expect(completion).not.toContain("discord_username");
    expect(completion).toContain("new.steam_id64");
    expect(compactMigration).toContain(
      "where nullif(btrim(player.discord_username), '') is null"
    );
  });

  it("the browser sends only untrusted IDs and six booleans, never authoritative facts", () => {
    expect(action).toContain(
      "p_rulebook_document_id: input.rulebookDocumentId"
    );
    expect(action).toContain("p_age_18_confirmed: input.age18Confirmation");
    const registrationRpcCall = action.match(
      /\.rpc\(\s*"submit_verified_player_registration"\s*,\s*\{([\s\S]*?)\}\s*\)/
    );
    expect(registrationRpcCall).not.toBeNull();
    expect(
      [
        ...(registrationRpcCall?.[1].matchAll(
          /\b(p_[A-Za-z0-9_]+)\s*:/g
        ) ?? []),
      ]
        .map((match) => match[1])
        .filter((name) => name !== "p_relic_calculation_version")
        .some((name) => /(version|url|sha256)/i.test(name))
    ).toBe(false);
    expect(tournamentUi).not.toContain("Admin Final Decision Agreement");

    for (const label of [
      "Player Participation Agreement",
      "Official Tournament Rulebook",
      "Terms of Service",
      "Privacy Policy",
    ]) {
      expect(tournamentUi).toContain(label);
    }
    expect(tournamentUi).toContain('t("registrationModal.ageConfirmation")');
    expect(tournamentUi).toContain(
      't("registrationModal.ownershipConfirmation")'
    );
    expect(competitionEnglish.registrationModal.ageConfirmation).toBe(
      "I confirm that I am at least 18 years old."
    );
    expect(competitionEnglish.registrationModal.ownershipConfirmation).toBe(
      "I confirm that I am using my own IronClad account and that the linked Steam account belongs to me."
    );
  });
});
