import { describe, expect, it } from "vitest";
import { validateHostedAdmin } from "../../preview/p03/admin-identity";

const email = "p03+clerk_test@example.com";
function approved() {
  return {
    id: "user_P03Test", external_id: "ironclad:p03-preview-admin:v1", first_name: "P03PreviewAdmin",
    last_name: null, username: null, password_enabled: true, banned: false, locked: false,
    email_addresses: [{id: "idn_test", email_address: email, verification: {status: "verified"}}],
    primary_email_address_id: "idn_test", public_metadata: {role: "admin"}, private_metadata: {
      ironclad_fixture_source: "p03_preview_validation", ironclad_fixture_contract_version: 1,
      ironclad_fixture_alias: "P03PreviewAdmin",
    }, phone_numbers: [], external_accounts: [], web3_wallets: [], unsafe_metadata: {},
  };
}

describe("dedicated hosted admin boundary", () => {
  it("accepts only the dedicated active verified test identity", () => {
    expect(() => validateHostedAdmin(approved(), email)).not.toThrow();
  });
  it.each([
    ["ordinary administrator", {external_id: "another-admin"}],
    ["player", {public_metadata: {role: "player"}}],
    ["missing provenance", {private_metadata: {}}],
    ["unverified email", {email_addresses: [{id: "idn_test", email_address: email, verification: {status: "unverified"}}]}],
    ["linked real identity", {external_accounts: [{provider: "oauth_steam"}]}],
    ["unsafe metadata", {unsafe_metadata: {role: "admin"}}],
    ["banned identity", {banned: true}],
  ])("rejects %s", (_name, change) => {
    expect(() => validateHostedAdmin({...approved(), ...change}, email)).toThrow("BLOCKED:");
  });
  it("rejects a non-test email even when other metadata matches", () => {
    expect(() => validateHostedAdmin(approved(), "person@example.com")).toThrow("BLOCKED:");
  });
});
