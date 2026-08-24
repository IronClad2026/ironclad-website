import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const STAGING_SUPABASE_REF = "zzbnneprhjicmajpjkdg";
export const PRODUCTION_SUPABASE_REF = "nsyjtqpvyxlzyujlbzos";
export const FIXTURE_SOURCE = "staging_synthetic_uat";
export const FIXTURE_CONTRACT_VERSION = "staging-synthetic-v1";

const AVATAR_BUCKET = "player-avatars";
const AVATAR_OBJECT_NAME = "avatar";
const CLERK_API_BASE_URL = "https://api.clerk.com/v1";
const CLERK_API_VERSION = "2025-11-10";
const REQUEST_TIMEOUT_MS = 20_000;
const SAFE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RPC_NAMES = Object.freeze({
  provision: "provision_staging_synthetic_uat_player",
  inspect: "inspect_staging_synthetic_uat_player",
  enrol: "enrol_staging_synthetic_uat_player",
  cleanup: "cleanup_staging_synthetic_uat_enrolment",
});

const SAFE_ERROR_CODES = new Set([
  "alias_rejected",
  "arguments_rejected",
  "avatar_rejected",
  "avatar_unavailable",
  "avatar_upload_failed",
  "clerk_environment_rejected",
  "clerk_password_rejected",
  "clerk_request_failed",
  "clerk_test_identity_rejected",
  "command_rejected",
  "environment_file_rejected",
  "environment_file_unavailable",
  "fixture_secret_rejected",
  "operation_failed",
  "operation_rejected",
  "rollback_failed",
  "rpc_rejected",
  "rpc_response_rejected",
  "runtime_environment_rejected",
  "runtime_unavailable",
  "service_role_rejected",
  "supabase_project_rejected",
]);

const COMMAND_OPTIONS = Object.freeze({
  provision: Object.freeze({ required: ["alias"], optional: [] }),
  inspect: Object.freeze({ required: ["alias"], optional: [] }),
  enrol: Object.freeze({
    required: ["alias", "tournament-id", "bracket-id"],
    optional: ["confirm-waitlist"],
  }),
  "cleanup-enrolment": Object.freeze({
    required: ["alias", "tournament-id"],
    optional: [],
  }),
  "verify-login": Object.freeze({ required: ["alias"], optional: [] }),
});

export const SUPPORTED_COMMANDS = Object.freeze(Object.keys(COMMAND_OPTIONS));

export class FixtureContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "FixtureContractError";
    this.code = code;
  }
}

function fixtureError(code) {
  return new FixtureContractError(code);
}

function freezeFixture(alias, syntheticElo, syntheticDivision) {
  return Object.freeze({
    alias,
    syntheticElo,
    syntheticDivision,
    source: FIXTURE_SOURCE,
    contractVersion: FIXTURE_CONTRACT_VERSION,
  });
}

export function buildFixtureCatalogue() {
  const divisions = [
    [
      "TestAcademy",
      "Academy",
      [700, 750, 800, 850, 900, 950, 1000, 1050, 1075, 1099],
    ],
    [
      "TestChallenge",
      "Challenge",
      [1100, 1150, 1200, 1225, 1250, 1275, 1300, 1350, 1375, 1399],
    ],
    [
      "TestMain",
      "Main / Pro",
      [1400, 1450, 1500, 1550, 1600, 1700, 1800, 1900, 2000, 2200],
    ],
  ];

  return Object.freeze(
    Object.fromEntries(
      divisions.flatMap(([prefix, division, ratings]) =>
        ratings.map((rating, index) => {
          const alias = `${prefix}${index + 1}`;
          return [alias, freezeFixture(alias, rating, division)];
        })
      )
    )
  );
}

export const APPROVED_FIXTURES = buildFixtureCatalogue();

export function getFixtureDefinition(alias) {
  if (typeof alias !== "string") {
    throw fixtureError("alias_rejected");
  }

  const fixture = Object.hasOwn(APPROVED_FIXTURES, alias)
    ? APPROVED_FIXTURES[alias]
    : null;

  if (!fixture || fixture.alias !== alias) {
    throw fixtureError("alias_rejected");
  }

  return fixture;
}

export function normalizeAliasForEnv(alias) {
  return getFixtureDefinition(alias).alias
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
}

export function buildClerkFixtureIdentity(alias) {
  const fixture = getFixtureDefinition(alias);

  return Object.freeze({
    externalId: `ironclad:${FIXTURE_SOURCE}:${FIXTURE_CONTRACT_VERSION}:${fixture.alias}`,
    firstName: fixture.alias,
    publicMetadata: Object.freeze({ role: "player" }),
    privateMetadata: Object.freeze({
      ironclad_fixture_alias: fixture.alias,
      ironclad_fixture_source: FIXTURE_SOURCE,
      ironclad_fixture_contract_version: FIXTURE_CONTRACT_VERSION,
    }),
  });
}

export function parseDotEnv(source) {
  if (typeof source !== "string") {
    throw fixtureError("environment_file_rejected");
  }

  const parsed = {};
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
    );

    if (!assignment) {
      throw fixtureError("environment_file_rejected");
    }

    const [, key, rawValue] = assignment;

    if (Object.hasOwn(parsed, key)) {
      throw fixtureError("environment_file_rejected");
    }

    parsed[key] = parseDotEnvValue(rawValue);
  }

  return parsed;
}

function parseDotEnvValue(rawValue) {
  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
    const quote = rawValue[0];
    let closingIndex = -1;
    let escaped = false;

    for (let index = 1; index < rawValue.length; index += 1) {
      const character = rawValue[index];

      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }

      if (character === quote && !escaped) {
        closingIndex = index;
        break;
      }

      escaped = false;
    }

    if (closingIndex === -1) {
      throw fixtureError("environment_file_rejected");
    }

    const remainder = rawValue.slice(closingIndex + 1).trim();

    if (remainder && !remainder.startsWith("#")) {
      throw fixtureError("environment_file_rejected");
    }

    const value = rawValue.slice(1, closingIndex);

    if (quote === "'") {
      return value;
    }

    return value.replace(/\\([nrt"\\])/g, (_match, character) => {
      const replacements = {
        n: "\n",
        r: "\r",
        t: "\t",
        '"': '"',
        "\\": "\\",
      };
      return replacements[character];
    });
  }

  const commentIndex = rawValue.indexOf("#");
  return (commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex)).trim();
}

export async function loadFixtureEnvironment({
  rootDir,
  processEnv = process.env,
  readFileImpl = readFile,
}) {
  if (typeof rootDir !== "string" || !rootDir) {
    throw fixtureError("environment_file_rejected");
  }

  let baseSource;
  let stagingSource;

  try {
    [baseSource, stagingSource] = await Promise.all([
      readFileImpl(resolve(rootDir, ".env.local"), "utf8"),
      readFileImpl(resolve(rootDir, ".env.staging-uat.local"), "utf8"),
    ]);
  } catch {
    throw fixtureError("environment_file_unavailable");
  }

  return {
    ...parseDotEnv(baseSource),
    ...parseDotEnv(stagingSource),
    ...processEnv,
  };
}

export function decodeJwtPayload(token) {
  if (typeof token !== "string") {
    throw fixtureError("service_role_rejected");
  }

  const parts = token.split(".");

  if (
    parts.length !== 3 ||
    parts.some((part) => !part || !/^[A-Za-z0-9_-]+$/.test(part)) ||
    parts[2].length < 32
  ) {
    throw fixtureError("service_role_rejected");
  }

  let header;
  let payload;

  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw fixtureError("service_role_rejected");
  }

  if (
    !header ||
    typeof header !== "object" ||
    Array.isArray(header) ||
    header.alg !== "HS256" ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw fixtureError("service_role_rejected");
  }

  return payload;
}

export function estimateEntropyBits(value) {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  const frequencies = new Map();

  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  let entropyPerCharacter = 0;

  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropyPerCharacter -= probability * Math.log2(probability);
  }

  return entropyPerCharacter * value.length;
}

export function isHighEntropySecret(value) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(value) ||
    /^(?:change[-_ ]?me|placeholder|secret|test|staging)+$/i.test(value)
  ) {
    return false;
  }

  for (let blockLength = 1; blockLength <= value.length / 2; blockLength += 1) {
    if (
      value.length % blockLength === 0 &&
      value.slice(0, blockLength).repeat(value.length / blockLength) === value
    ) {
      return false;
    }
  }

  return new Set(value).size >= 10 && estimateEntropyBits(value) >= 128;
}

export function isOfficialClerkTestEmail(value) {
  if (typeof value !== "string" || value.length > 254) {
    return false;
  }

  const match = value.match(
    /^([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Z0-9-]+(?:\.[A-Z0-9-]+)+)$/i
  );

  return Boolean(match && match[1].toLowerCase().endsWith("+clerk_test"));
}

function requireEnvironmentValue(env, name, errorCode) {
  const value = env?.[name];

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\r\n\u0000]/.test(value)
  ) {
    throw fixtureError(errorCode);
  }

  return value;
}

export function validateRuntimeGuards(env, alias, now = Date.now()) {
  const fixture = getFixtureDefinition(alias);
  const normalizedAlias = normalizeAliasForEnv(alias);
  const supabaseUrlValue = requireEnvironmentValue(
    env,
    "NEXT_PUBLIC_SUPABASE_URL",
    "supabase_project_rejected"
  );
  const serviceRoleKey = requireEnvironmentValue(
    env,
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role_rejected"
  );
  const clerkPublishableKey = requireEnvironmentValue(
    env,
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "clerk_environment_rejected"
  );
  const clerkSecretKey = requireEnvironmentValue(
    env,
    "CLERK_SECRET_KEY",
    "clerk_environment_rejected"
  );
  const fixtureSecret = requireEnvironmentValue(
    env,
    "STAGING_SYNTHETIC_UAT_FIXTURE_SECRET",
    "fixture_secret_rejected"
  );
  const email = requireEnvironmentValue(
    env,
    `STAGING_SYNTHETIC_UAT_${normalizedAlias}_EMAIL`,
    "clerk_test_identity_rejected"
  );
  const password = requireEnvironmentValue(
    env,
    `STAGING_SYNTHETIC_UAT_${normalizedAlias}_PASSWORD`,
    "clerk_test_identity_rejected"
  );

  let supabaseUrl;

  try {
    supabaseUrl = new URL(supabaseUrlValue);
  } catch {
    throw fixtureError("supabase_project_rejected");
  }

  if (
    supabaseUrl.protocol !== "https:" ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.port ||
    supabaseUrl.hostname !== `${STAGING_SUPABASE_REF}.supabase.co` ||
    supabaseUrl.pathname !== "/" ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    supabaseUrl.hostname.includes(PRODUCTION_SUPABASE_REF)
  ) {
    throw fixtureError("supabase_project_rejected");
  }

  const serviceRolePayload = decodeJwtPayload(serviceRoleKey);

  if (
    serviceRolePayload.role !== "service_role" ||
    serviceRolePayload.ref !== STAGING_SUPABASE_REF ||
    serviceRolePayload.iss !== "supabase" ||
    (typeof serviceRolePayload.exp === "number" &&
      serviceRolePayload.exp * 1000 <= now)
  ) {
    throw fixtureError("service_role_rejected");
  }

  if (
    !clerkPublishableKey.startsWith("pk_test_") ||
    clerkPublishableKey.startsWith("pk_live_") ||
    clerkPublishableKey.length < 20 ||
    !clerkSecretKey.startsWith("sk_test_") ||
    clerkSecretKey.startsWith("sk_live_") ||
    clerkSecretKey.length < 20
  ) {
    throw fixtureError("clerk_environment_rejected");
  }

  if (!isHighEntropySecret(fixtureSecret)) {
    throw fixtureError("fixture_secret_rejected");
  }

  if (
    !isOfficialClerkTestEmail(email) ||
    password.length < 12 ||
    password.length > 256 ||
    /[\r\n\u0000]/.test(password)
  ) {
    throw fixtureError("clerk_test_identity_rejected");
  }

  if (
    (typeof env?.VERCEL_ENV === "string" &&
      !["preview", "development", "staging"].includes(env.VERCEL_ENV)) ||
    (typeof env?.NODE_ENV === "string" &&
      !["development", "test", "staging"].includes(env.NODE_ENV))
  ) {
    throw fixtureError("runtime_environment_rejected");
  }

  return Object.freeze({
    fixture,
    supabaseUrl: supabaseUrl.origin,
    serviceRoleKey,
    clerkPublishableKey,
    clerkSecretKey,
    fixtureSecret,
    email,
    password,
    clerkIdentity: buildClerkFixtureIdentity(alias),
  });
}

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw fixtureError("command_rejected");
  }

  const [command, ...tokens] = argv;
  const contract = COMMAND_OPTIONS[command];

  if (!contract) {
    throw fixtureError("command_rejected");
  }

  const allowedOptions = new Set([...contract.required, ...contract.optional]);
  const options = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (typeof token !== "string" || !token.startsWith("--")) {
      throw fixtureError("arguments_rejected");
    }

    const separatorIndex = token.indexOf("=");
    const optionName = token.slice(
      2,
      separatorIndex === -1 ? undefined : separatorIndex
    );

    if (!allowedOptions.has(optionName) || Object.hasOwn(options, optionName)) {
      throw fixtureError("arguments_rejected");
    }

    if (optionName === "confirm-waitlist") {
      if (separatorIndex !== -1) {
        throw fixtureError("arguments_rejected");
      }

      options[optionName] = true;
      continue;
    }

    let optionValue;

    if (separatorIndex !== -1) {
      optionValue = token.slice(separatorIndex + 1);
    } else {
      index += 1;
      optionValue = tokens[index];
    }

    if (
      typeof optionValue !== "string" ||
      !optionValue ||
      optionValue.startsWith("--") ||
      /[\r\n\u0000]/.test(optionValue)
    ) {
      throw fixtureError("arguments_rejected");
    }

    options[optionName] = optionValue;
  }

  for (const requiredOption of contract.required) {
    if (!Object.hasOwn(options, requiredOption)) {
      throw fixtureError("arguments_rejected");
    }
  }

  const fixture = getFixtureDefinition(options.alias);

  for (const identifierName of ["tournament-id", "bracket-id"]) {
    if (
      Object.hasOwn(options, identifierName) &&
      !SAFE_UUID_PATTERN.test(options[identifierName])
    ) {
      throw fixtureError("arguments_rejected");
    }
  }

  return Object.freeze({
    command,
    alias: fixture.alias,
    tournamentId: options["tournament-id"],
    bracketId: options["bracket-id"],
    confirmWaitlist: options["confirm-waitlist"] === true,
  });
}

export function hasAdminMetadata(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasAdminMetadata);
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();

    if (
      normalizedKey === "role" &&
      typeof nestedValue === "string" &&
      nestedValue.toLowerCase() === "admin"
    ) {
      return true;
    }

    if (normalizedKey.includes("admin") && Boolean(nestedValue)) {
      return true;
    }

    return hasAdminMetadata(nestedValue);
  });
}

export function validateClerkFixtureUser(user, config) {
  if (!user || typeof user !== "object" || Array.isArray(user)) {
    throw fixtureError("clerk_test_identity_rejected");
  }

  const publicMetadata = user.public_metadata;
  const privateMetadata = user.private_metadata;
  const unsafeMetadata = user.unsafe_metadata;
  const expected = config.clerkIdentity;
  const emails = Array.isArray(user.email_addresses)
    ? user.email_addresses
    : [];
  const onlyEmail = emails.length === 1 ? emails[0] : null;
  const emailValues = emails
    .map((entry) => entry?.email_address)
    .filter((value) => typeof value === "string");

  if (
    user.external_id !== expected.externalId ||
    user.first_name !== expected.firstName ||
    (user.last_name !== null && user.last_name !== undefined) ||
    (user.username !== null && user.username !== undefined) ||
    user.password_enabled !== true ||
    user.banned === true ||
    user.locked === true ||
    emailValues.length !== 1 ||
    typeof onlyEmail?.id !== "string" ||
    user.primary_email_address_id !== onlyEmail.id ||
    onlyEmail?.verification?.status !== "verified" ||
    emailValues[0].toLowerCase() !== config.email.toLowerCase() ||
    !isOfficialClerkTestEmail(emailValues[0]) ||
    !publicMetadata ||
    publicMetadata.role !== "player" ||
    Object.keys(publicMetadata).length !== 1 ||
    (Array.isArray(user.phone_numbers) && user.phone_numbers.length !== 0) ||
    (Array.isArray(user.web3_wallets) && user.web3_wallets.length !== 0) ||
    (Array.isArray(user.external_accounts) &&
      user.external_accounts.length !== 0) ||
    !privateMetadata ||
    privateMetadata.ironclad_fixture_alias !==
      expected.privateMetadata.ironclad_fixture_alias ||
    privateMetadata.ironclad_fixture_source !==
      expected.privateMetadata.ironclad_fixture_source ||
    privateMetadata.ironclad_fixture_contract_version !==
      expected.privateMetadata.ironclad_fixture_contract_version ||
    hasAdminMetadata(publicMetadata) ||
    hasAdminMetadata(privateMetadata) ||
    hasAdminMetadata(unsafeMetadata)
  ) {
    throw fixtureError("clerk_test_identity_rejected");
  }

  if (typeof user.id !== "string" || !/^user_[A-Za-z0-9]+$/.test(user.id)) {
    throw fixtureError("clerk_test_identity_rejected");
  }

  return user;
}

function unwrapRpcResult(value) {
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw fixtureError("rpc_response_rejected");
    }

    return value[0];
  }

  return value;
}

function requireRpcObject(value) {
  const result = unwrapRpcResult(value);

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw fixtureError("rpc_response_rejected");
  }

  return result;
}

function validateCommonRpcFixture(result, fixture, requireNullCurrentElo) {
  if (
    result.alias !== fixture.alias ||
    result.synthetic_elo !== fixture.syntheticElo ||
    result.synthetic_division !== fixture.syntheticDivision ||
    result.provenance !== FIXTURE_SOURCE ||
    result.contract_version !== FIXTURE_CONTRACT_VERSION ||
    !SAFE_UUID_PATTERN.test(String(result.player_id ?? "")) ||
    (requireNullCurrentElo && result.current_elo !== null)
  ) {
    throw fixtureError("rpc_response_rejected");
  }
}

export function buildRedactedResult(operation, fixture, rawResult, extras = {}) {
  const result = requireRpcObject(rawResult);
  const base = {
    alias: fixture.alias,
    operation,
    status: "ok",
    syntheticElo: fixture.syntheticElo,
    syntheticDivision: fixture.syntheticDivision,
    contractVersion: FIXTURE_CONTRACT_VERSION,
  };

  if (operation === "provision" || operation === "inspect") {
    validateCommonRpcFixture(result, fixture, true);

    if (
      result.profile_complete !== true ||
      result.profile_public !== false ||
      result.has_steam_identity !== false ||
      result.has_provider_facts !== false ||
      (operation === "provision" && typeof result.created !== "boolean") ||
      (operation === "inspect" &&
        (!Number.isInteger(result.active_registration_count) ||
          result.active_registration_count < 0))
    ) {
      throw fixtureError("rpc_response_rejected");
    }

    return {
      ...base,
      profileComplete: true,
      profilePrivate: true,
      steamIdentityClaimed: false,
      providerFactsClaimed: false,
      provenanceVerified: true,
      ...(operation === "provision"
        ? {
            fixtureCreated: result.created,
            clerkUserCreated: extras.clerkUserCreated === true,
            passwordVerified: extras.passwordVerified === true,
            avatarUploaded: extras.avatarUploaded === true,
          }
        : {
            hasActiveEnrolment: result.active_registration_count > 0,
          }),
    };
  }

  if (operation === "enrol") {
    validateCommonRpcFixture(result, fixture, false);

    const existingStatuses = [
      "pending",
      "manual_review",
      "approved",
      "rejected",
      "waitlisted",
      "withdrawn",
    ];
    const confirmationRequired =
      result.registration_status === null &&
      result.waitlist_confirmation_required === true;
    const registrationPresent = existingStatuses.includes(
      result.registration_status
    );

    if (
      typeof result.created !== "boolean" ||
      (!confirmationRequired && !registrationPresent) ||
      (confirmationRequired &&
        (result.created !== false ||
          result.registration_id !== null ||
          result.queue_position !== null)) ||
      (registrationPresent &&
        !SAFE_UUID_PATTERN.test(String(result.registration_id ?? ""))) ||
      (result.created === true &&
        !["pending", "waitlisted"].includes(result.registration_status)) ||
      (result.queue_position !== null &&
        (!Number.isInteger(result.queue_position) || result.queue_position < 1))
    ) {
      throw fixtureError("rpc_response_rejected");
    }

    return {
      ...base,
      enrolmentPresent: registrationPresent,
      pending: result.registration_status === "pending",
      manualReview: result.registration_status === "manual_review",
      approved: result.registration_status === "approved",
      rejected: result.registration_status === "rejected",
      waitlisted: result.registration_status === "waitlisted",
      withdrawn: result.registration_status === "withdrawn",
      waitlistConfirmationRequired: confirmationRequired,
      fixtureEnrolmentCreated: result.created,
      provenanceVerified: true,
    };
  }

  if (operation === "cleanup-enrolment") {
    if (
      result.alias !== fixture.alias ||
      !SAFE_UUID_PATTERN.test(String(result.player_id ?? "")) ||
      typeof result.deleted !== "boolean" ||
      (result.registration_id !== null &&
        !SAFE_UUID_PATTERN.test(String(result.registration_id ?? ""))) ||
      (result.promoted_registration_id !== null &&
        !SAFE_UUID_PATTERN.test(String(result.promoted_registration_id ?? "")))
    ) {
      throw fixtureError("rpc_response_rejected");
    }

    return {
      ...base,
      enrolmentDeleted: result.deleted,
      waitlistPromotionOccurred: result.promoted_registration_id !== null,
    };
  }

  throw fixtureError("operation_rejected");
}

export function buildRedactedLoginResult(fixture) {
  return {
    alias: fixture.alias,
    operation: "verify-login",
    status: "ok",
    syntheticElo: fixture.syntheticElo,
    syntheticDivision: fixture.syntheticDivision,
    contractVersion: FIXTURE_CONTRACT_VERSION,
    loginVerified: true,
    passwordEnabled: true,
    provenanceVerified: true,
    adminMetadataPresent: false,
  };
}

export function buildRedactedFailure(error, parsedCommand) {
  const code =
    error instanceof FixtureContractError && SAFE_ERROR_CODES.has(error.code)
      ? error.code
      : "operation_failed";
  const operation = SUPPORTED_COMMANDS.includes(parsedCommand?.command)
    ? parsedCommand.command
    : "unknown";
  const fixture =
    parsedCommand?.alias && Object.hasOwn(APPROVED_FIXTURES, parsedCommand.alias)
    ? APPROVED_FIXTURES[parsedCommand.alias]
    : null;

  return {
    ...(fixture ? { alias: fixture.alias } : {}),
    operation,
    status: code,
    ...(fixture
      ? {
          syntheticElo: fixture.syntheticElo,
          syntheticDivision: fixture.syntheticDivision,
          contractVersion: FIXTURE_CONTRACT_VERSION,
        }
      : {}),
    succeeded: false,
  };
}

function createRequestSignal() {
  return typeof globalThis.AbortSignal?.timeout === "function"
    ? globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

async function requestJson(fetchImpl, url, init, errorCode) {
  let response;

  try {
    response = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? createRequestSignal(),
    });
  } catch {
    throw fixtureError(errorCode);
  }

  if (!response || response.ok !== true) {
    throw fixtureError(errorCode);
  }

  if (response.status === 204) {
    return null;
  }

  try {
    if (typeof response.text === "function") {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    if (typeof response.json === "function") {
      return await response.json();
    }
  } catch {
    throw fixtureError(errorCode);
  }

  throw fixtureError(errorCode);
}

function createFixtureService({ config, fetchImpl, readFileImpl, rootDir }) {
  if (typeof fetchImpl !== "function") {
    throw fixtureError("runtime_unavailable");
  }

  const clerkHeaders = {
    Authorization: `Bearer ${config.clerkSecretKey}`,
    "Clerk-API-Version": CLERK_API_VERSION,
    "Content-Type": "application/json",
  };
  const supabaseHeaders = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function clerkRequest(path, init, errorCode = "clerk_request_failed") {
    return requestJson(
      fetchImpl,
      `${CLERK_API_BASE_URL}${path}`,
      {
        ...init,
        headers: {
          ...clerkHeaders,
          ...init.headers,
        },
      },
      errorCode
    );
  }

  async function findClerkFixtureUser() {
    const response = await clerkRequest(
      `/users?external_id=${encodeURIComponent(
        config.clerkIdentity.externalId
      )}&limit=2`,
      { method: "GET", headers: {} }
    );
    const users = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : null;

    if (!users || users.length > 1) {
      throw fixtureError("clerk_test_identity_rejected");
    }

    return users[0] ?? null;
  }

  async function createClerkFixtureUser() {
    return clerkRequest("/users", {
      method: "POST",
      headers: {},
      body: JSON.stringify({
        email_address: [config.email],
        password: config.password,
        first_name: config.clerkIdentity.firstName,
        external_id: config.clerkIdentity.externalId,
        public_metadata: config.clerkIdentity.publicMetadata,
        private_metadata: config.clerkIdentity.privateMetadata,
        unsafe_metadata: {},
      }),
    });
  }

  async function verifyClerkPassword(userId) {
    const result = await clerkRequest(
      `/users/${encodeURIComponent(userId)}/verify_password`,
      {
        method: "POST",
        headers: {},
        body: JSON.stringify({ password: config.password }),
      }
    );

    if (!result || result.verified !== true) {
      throw fixtureError("clerk_password_rejected");
    }
  }

  async function deleteClerkUser(userId) {
    await clerkRequest(
      `/users/${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: {} },
      "rollback_failed"
    );
  }

  async function supabaseRpc(name, body) {
    return requestJson(
      fetchImpl,
      `${config.supabaseUrl}/rest/v1/rpc/${name}`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      },
      "rpc_rejected"
    );
  }

  function avatarObjectPath(userId) {
    return `${userId}/${AVATAR_OBJECT_NAME}`;
  }

  async function uploadAvatar(userId) {
    let avatar;

    try {
      avatar = await readFileImpl(
        resolve(rootDir, "public", "images", "ironclad-logo.png")
      );
    } catch {
      throw fixtureError("avatar_unavailable");
    }

    if (
      !avatar ||
      avatar.length < 8 ||
      !Buffer.from(avatar.subarray(0, 8)).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ) {
      throw fixtureError("avatar_rejected");
    }

    const encodedPath = avatarObjectPath(userId)
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    await requestJson(
      fetchImpl,
      `${config.supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "image/png",
          "Cache-Control": "3600",
          "x-upsert": "true",
        },
        body: avatar,
      },
      "avatar_upload_failed"
    );
  }

  async function removeAvatar(userId) {
    await requestJson(
      fetchImpl,
      `${config.supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}`,
      {
        method: "DELETE",
        headers: supabaseHeaders,
        body: JSON.stringify({ prefixes: [avatarObjectPath(userId)] }),
      },
      "rollback_failed"
    );
  }

  async function rollbackNewUser(userId) {
    let rollbackFailed = false;

    try {
      await removeAvatar(userId);
    } catch {
      rollbackFailed = true;
    }

    try {
      await deleteClerkUser(userId);
    } catch {
      rollbackFailed = true;
    }

    if (rollbackFailed) {
      throw fixtureError("rollback_failed");
    }
  }

  return Object.freeze({
    async provision() {
      let clerkUser = await findClerkFixtureUser();
      let clerkUserCreated = false;

      if (!clerkUser) {
        clerkUser = await createClerkFixtureUser();
        clerkUserCreated = true;
      }

      let validatedUser;

      try {
        validatedUser = validateClerkFixtureUser(clerkUser, config);
        await verifyClerkPassword(validatedUser.id);
        await uploadAvatar(validatedUser.id);
      } catch (error) {
        if (clerkUserCreated && typeof clerkUser?.id === "string") {
          await rollbackNewUser(clerkUser.id);
        }

        throw error;
      }

      let rpcResult;

      try {
        rpcResult = await supabaseRpc(RPC_NAMES.provision, {
          p_fixture_secret: config.fixtureSecret,
          p_alias: config.fixture.alias,
          p_clerk_user_id: validatedUser.id,
        });
      } catch (error) {
        if (clerkUserCreated) {
          await rollbackNewUser(validatedUser.id);
        }

        throw error;
      }

      return buildRedactedResult(
        "provision",
        config.fixture,
        rpcResult,
        {
          clerkUserCreated,
          passwordVerified: true,
          avatarUploaded: true,
        }
      );
    },

    async inspect() {
      const result = await supabaseRpc(RPC_NAMES.inspect, {
        p_fixture_secret: config.fixtureSecret,
        p_alias: config.fixture.alias,
      });

      return buildRedactedResult("inspect", config.fixture, result);
    },

    async enrol(tournamentId, bracketId, confirmWaitlist) {
      const result = await supabaseRpc(RPC_NAMES.enrol, {
        p_fixture_secret: config.fixtureSecret,
        p_alias: config.fixture.alias,
        p_tournament_id: tournamentId,
        p_tournament_bracket_id: bracketId,
        p_waitlist_confirmed: confirmWaitlist,
      });

      return buildRedactedResult("enrol", config.fixture, result);
    },

    async cleanupEnrolment(tournamentId) {
      const result = await supabaseRpc(RPC_NAMES.cleanup, {
        p_fixture_secret: config.fixtureSecret,
        p_alias: config.fixture.alias,
        p_tournament_id: tournamentId,
      });

      return buildRedactedResult(
        "cleanup-enrolment",
        config.fixture,
        result
      );
    },

    async verifyLogin() {
      const clerkUser = await findClerkFixtureUser();

      if (!clerkUser) {
        throw fixtureError("clerk_test_identity_rejected");
      }

      const validatedUser = validateClerkFixtureUser(clerkUser, config);
      await verifyClerkPassword(validatedUser.id);
      return buildRedactedLoginResult(config.fixture);
    },
  });
}

export async function executeFixtureCommand(
  parsedCommand,
  {
    env,
    rootDir,
    fetchImpl = globalThis.fetch,
    readFileImpl = readFile,
    now = Date.now(),
  }
) {
  const config = validateRuntimeGuards(env, parsedCommand.alias, now);
  const service = createFixtureService({
    config,
    fetchImpl,
    readFileImpl,
    rootDir,
  });

  switch (parsedCommand.command) {
    case "provision":
      return service.provision();
    case "inspect":
      return service.inspect();
    case "enrol":
      return service.enrol(
        parsedCommand.tournamentId,
        parsedCommand.bracketId,
        parsedCommand.confirmWaitlist
      );
    case "cleanup-enrolment":
      return service.cleanupEnrolment(parsedCommand.tournamentId);
    case "verify-login":
      return service.verifyLogin();
    default:
      throw fixtureError("command_rejected");
  }
}
