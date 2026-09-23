type Entry = Record<string, unknown>;
function object(value: unknown): Entry | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Entry : null;
}
function exact(value: unknown, expected: Entry) {
  const record = object(value);
  return record && Object.keys(record).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, item]) => record[key] === item);
}

/** Pure browser-test counterpart of the fixture creator's admin contract. */
export function validateHostedAdmin(value: unknown, email: string): void {
  const user = object(value);
  const emails = user?.email_addresses;
  const entry = Array.isArray(emails) && emails.length === 1 ? object(emails[0]) : null;
  if (!user || !entry || !/^[^@\s]+\+clerk_test@[^@\s]+$/i.test(email) ||
    !/^user_[A-Za-z0-9]+$/.test(String(user.id)) ||
    user.external_id !== "ironclad:p03-preview-admin:v1" || user.first_name !== "P03PreviewAdmin" ||
    user.last_name || user.username || user.password_enabled !== true || user.banned || user.locked ||
    String(entry.email_address).toLowerCase() !== email.toLowerCase() ||
    object(entry.verification)?.status !== "verified" || user.primary_email_address_id !== entry.id ||
    !exact(user.public_metadata, {role: "admin"}) || !exact(user.private_metadata, {
      ironclad_fixture_source: "p03_preview_validation", ironclad_fixture_contract_version: 1,
      ironclad_fixture_alias: "P03PreviewAdmin",
    }) || ![user.phone_numbers, user.external_accounts, user.web3_wallets].every((items) => Array.isArray(items) && items.length === 0) ||
    (user.unsafe_metadata && !exact(user.unsafe_metadata, {}))) {
    throw new Error("BLOCKED: the supplied administrator does not match the dedicated Development test identity contract.");
  }
}
