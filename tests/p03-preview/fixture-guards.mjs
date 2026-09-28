import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOptions, validateDedicatedAdmin, validateAdminAccountState, validateOutboundProof, validateFinalLayout,
} from "../../scripts/p03-preview/create-fixture.mjs";

// These tests never invoke main(), load environment files, or make requests.
const admin = {
  id: "user_testadmin", external_id: "ironclad:p03-preview-admin:v1",
  first_name: "P03PreviewAdmin", last_name: null, username: null,
  password_enabled: true, banned: false, locked: false,
  email_addresses: [{ id: "id_test", email_address: "admin+clerk_test@example.test", verification: { status: "verified" } }],
  primary_email_address_id: "id_test", public_metadata: { role: "admin" },
  private_metadata: { ironclad_fixture_source: "p03_preview_validation", ironclad_fixture_contract_version: 1, ironclad_fixture_alias: "P03PreviewAdmin" },
  phone_numbers: [], external_accounts: [], web3_wallets: [], unsafe_metadata: {},
};
const now = Date.parse("2026-09-23T12:00:00Z");
const proof = {
  schemaVersion: 1, projectRef: "zzbnneprhjicmajpjkdg",
  checkedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(),
  verifiedBy: "read-only-worker-environment-review", stagingCronWorkerVerified: true, emailMode: "disabled",
};
const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const rounds = [1, 2, 3].map((n) => ({ id: uuid(n), round_number: n }));
const registrations = Array.from({ length: 8 }, (_, i) => ({ id: uuid(10 + i), alias: "TestMain" + (i + 1) }));
const matches = Array.from({ length: 7 }, (_, i) => ({
  id: uuid(100 + i), round_id: rounds[i < 4 ? 0 : i < 6 ? 1 : 2].id,
  match_number: i < 4 ? i + 1 : i < 6 ? i - 3 : 1,
  status: i < 3 ? "completed" : i === 3 || i === 4 ? "in_progress" : "scheduled",
  player_one_registration_id: i < 4 ? registrations[i * 2].id : i === 4 ? registrations[0].id : i === 5 ? registrations[4].id : null,
  player_two_registration_id: i < 4 ? registrations[i * 2 + 1].id : i === 4 ? registrations[2].id : null,
  winner_registration_id: i < 3 ? registrations[i * 2].id : null,
  activated_at: i < 5 ? "2026-09-23T12:00:00Z" : null,
}));

test("defaults to planning with no mutation option", () => {
  assert.equal(parseOptions(["--run-id", "20260923-rehearsal"]).create, false);
});
test("create without exact scope and outbound evidence is rejected", () => {
  assert.throws(() => parseOptions(["--run-id", "20260923-rehearsal", "--create"]));
});
test("an approval literal cannot silently enable mutation", () => {
  assert.throws(() => parseOptions(["--run-id", "20260923-rehearsal", "--approval", "CREATE NEW STAGING P03 FIXTURE"]));
});
test("run identifier cannot traverse a local path", () => {
  assert.throws(() => parseOptions(["--run-id", "../unbounded"]));
});
test("caller cannot select an arbitrary existing tournament", () => {
  assert.throws(() => parseOptions(["--run-id", "20260923-rehearsal", "--tournament-id", uuid(1)]));
});
test("dedicated Development admin identity satisfies the exact contract", () => {
  assert.equal(validateDedicatedAdmin(admin, "admin+clerk_test@example.test"), admin);
});
test("an unrelated existing admin cannot be adopted", () => {
  assert.throws(() => validateDedicatedAdmin({ ...admin, external_id: "existing-admin" }, "admin+clerk_test@example.test"));
});
test("an ordinary player cannot perform fixture administration", () => {
  assert.throws(() => validateDedicatedAdmin({ ...admin, public_metadata: { role: "player" } }, "admin+clerk_test@example.test"));
});
test("a non-test admin email is rejected", () => {
  assert.throws(() => validateDedicatedAdmin(admin, "real-admin@example.test"));
});
test("real contact channels disqualify a dedicated admin fixture", () => {
  assert.throws(() => validateDedicatedAdmin({ ...admin, phone_numbers: [{ id: "phone_1" }] }, "admin+clerk_test@example.test"));
});
test("fresh verified disabled Staging worker is accepted", () => {
  assert.doesNotThrow(() => validateOutboundProof(proof, ["user_fixture"], now));
});
test("Production outbound evidence cannot authorize a Staging mutation", () => {
  assert.throws(() => validateOutboundProof({ ...proof, projectRef: "nsyjtqpvyxlzyujlbzos" }, ["user_fixture"], now));
});
test("stale worker evidence is rejected", () => {
  assert.throws(() => validateOutboundProof({ ...proof, checkedAt: new Date(now - 900_001).toISOString() }, ["user_fixture"], now));
});
test("enabled unrestricted email delivery is rejected", () => {
  assert.throws(() => validateOutboundProof({ ...proof, emailMode: "enabled" }, ["user_fixture"], now));
});
test("an allowlisted fixture actor prevents creation", () => {
  assert.throws(() => validateOutboundProof({ ...proof, emailMode: "allowlist", emailAllowedClerkUserIds: ["user_fixture"] }, ["user_fixture"], now));
});
test("an allowlist excluding every fixture actor is accepted", () => {
  assert.doesNotThrow(() => validateOutboundProof({ ...proof, emailMode: "allowlist", emailAllowedClerkUserIds: ["user_unrelated_test"] }, ["user_fixture"], now));
});
test("three completed QFs produce the intended active and TBD layout", () => {
  const result = validateFinalLayout(matches, rounds, registrations);
  assert.equal(result.firstAlias, "TestMain1");
  assert.equal(result.secondAlias, "TestMain3");
  assert.equal(result.onePlayerMatchId, matches[5].id);
});
test("an empty match cannot stand in for a one-player TBD match", () => {
  const empty = matches.map((row, i) => i === 5 ? { ...row, player_one_registration_id: null } : row);
  assert.throws(() => validateFinalLayout(empty, rounds, registrations));
});
test("a completed semifinal cannot stand in for the current active match", () => {
  const completed = matches.map((row, i) => i === 4 ? { ...row, status: "completed" } : row);
  assert.throws(() => validateFinalLayout(completed, rounds, registrations));
});
test("premature activation of the one-player match is rejected", () => {
  const activated = matches.map((row, i) => i === 5 ? { ...row, activated_at: "2026-09-23T12:00:00Z" } : row);
  assert.throws(() => validateFinalLayout(activated, rounds, registrations));
});

const legalAt = "2026-09-23T11:00:00.000Z";
function adminAccount() {
  return {
    profiles: [{ id: uuid(200), clerk_user_id: admin.id, account_closed_at: null }],
    documents: [
      { id: uuid(201), document_kind: "terms", status: "effective", published_at: legalAt, effective_at: legalAt, sha256: "a".repeat(64) },
      { id: uuid(202), document_kind: "privacy", status: "effective", published_at: legalAt, effective_at: legalAt, sha256: "b".repeat(64) },
    ],
    acceptances: [{
      clerk_user_id: admin.id, terms_document_id: uuid(201), privacy_document_id: uuid(202),
      terms_sha256: "a".repeat(64), privacy_sha256: "b".repeat(64),
      terms_accepted: true, privacy_acknowledged: true, accepted_at: "2026-09-23T11:30:00.000Z",
    }],
  };
}
test("existing active admin profile and genuine current legal evidence pass", () => {
  assert.doesNotThrow(() => validateAdminAccountState(adminAccount(), admin.id, now));
});
test("Clerk admin role alone cannot replace an IronClad profile", () => {
  assert.throws(() => validateAdminAccountState({ ...adminAccount(), profiles: [] }, admin.id, now), /admin_active_profile_required/);
});
test("a closed admin account cannot create the fixture", () => {
  const state = adminAccount();
  state.profiles[0].account_closed_at = legalAt;
  assert.throws(() => validateAdminAccountState(state, admin.id, now), /admin_active_profile_required/);
});
test("missing acceptance fails without creating or accepting anything", () => {
  assert.throws(() => validateAdminAccountState({ ...adminAccount(), acceptances: [] }, admin.id, now), /admin_current_legal_acceptance_required/);
});
test("acceptance by a different account cannot satisfy the admin guard", () => {
  const state = adminAccount();
  state.acceptances[0].clerk_user_id = "user_unrelated";
  assert.throws(() => validateAdminAccountState(state, admin.id, now), /admin_current_legal_acceptance_required/);
});
test("old document evidence cannot satisfy the current pair", () => {
  const state = adminAccount();
  state.acceptances[0].terms_document_id = uuid(203);
  assert.throws(() => validateAdminAccountState(state, admin.id, now), /admin_current_legal_acceptance_required/);
});
test("mismatched immutable document hashes reject copied acceptance evidence", () => {
  const state = adminAccount();
  state.acceptances[0].terms_sha256 = "c".repeat(64);
  assert.throws(() => validateAdminAccountState(state, admin.id, now), /admin_current_legal_acceptance_required/);
});
test("future-effective legal documents cannot authorize a current mutation", () => {
  const state = adminAccount();
  state.documents[0].effective_at = "2026-09-24T11:00:00.000Z";
  assert.throws(() => validateAdminAccountState(state, admin.id, now), /admin_current_legal_documents_unavailable/);
});
