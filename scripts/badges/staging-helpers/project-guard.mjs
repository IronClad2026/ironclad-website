import { randomBytes } from "node:crypto";

export const STAGING_PROJECT = Object.freeze({
  name: "ironclad-staging",
  ref: "zzbnneprhjicmajpjkdg",
});

export const PRODUCTION_PROJECT = Object.freeze({
  name: "ironclad-v2",
  ref: "nsyjtqpvyxlzyujlbzos",
});

export const REQUIRED_CONFIRMATION_FLAG = "--confirm-project-ref";
export const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;

export const GENERIC_SUPABASE_ENVIRONMENT_KEYS = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]);

export const REQUIRED_APPLY_ENVIRONMENT = Object.freeze([
  Object.freeze({
    name: "BADGE_E2E_STAGING_SUPABASE_URL",
    kind: "url",
    secret: false,
    purpose: "Exact staging Supabase API URL.",
  }),
  Object.freeze({
    name: "BADGE_E2E_STAGING_SERVICE_ROLE_KEY",
    kind: "service-role-key",
    secret: true,
    purpose: "Service-role key for staging fixture setup and evaluators.",
  }),
  Object.freeze({
    name: "BADGE_E2E_STAGING_ANON_KEY",
    kind: "anon-key",
    secret: true,
    purpose: "Anon key for runtime security assertions.",
  }),
  Object.freeze({
    name: "BADGE_E2E_STAGING_AUTHENTICATED_JWT",
    kind: "authenticated-jwt",
    secret: true,
    purpose: "A staging authenticated JWT used for authenticated RLS assertions.",
  }),
  Object.freeze({
    name: "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN",
    kind: "supabase-access-token",
    secret: true,
    purpose: "Supabase CLI token for read-only project and migration preflight.",
  }),
  Object.freeze({
    name: "BADGE_E2E_STAGING_SYNTHETIC_FIXTURE_SECRET",
    kind: "synthetic-fixture-secret",
    secret: true,
    purpose: "Vault-backed staging synthetic UAT fixture secret.",
  }),
]);

export function parseArguments(arguments_) {
  const options = {
    apply: false,
    badge20ByePhase: null,
    cleanupDryRun: false,
    cleanupManifestPath: null,
    confirmProjectRef: null,
    help: false,
    remotePreflight: true,
    resumeRunMarker: null,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--badge20-bye-phase-1") {
      setBadge20ByePhase(options, 1);
    } else if (argument === "--badge20-bye-phase-2") {
      setBadge20ByePhase(options, 2);
    } else if (argument === "--cleanup-dry-run") {
      options.cleanupDryRun = true;
    } else if (argument === "--manifest") {
      options.cleanupManifestPath = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === REQUIRED_CONFIRMATION_FLAG) {
      options.confirmProjectRef = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--run-marker") {
      options.resumeRunMarker = arguments_[index + 1] ?? null;
      index += 1;
    } else if (argument === "--skip-remote-preflight") {
      options.remotePreflight = false;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(
        `Unknown argument ${argument}. Use --help to inspect supported options.`
      );
    }
  }

  return options;
}

export function printHelp() {
  console.log(`Usage:
  npm run test:badges:staging -- \\
    --confirm-project-ref ${STAGING_PROJECT.ref} [--apply]

Default mode is dry-run. It validates the explicit staging target, prints the
planned scenarios, and performs no Supabase mutations. Applied staging execution
requires both:

  --confirm-project-ref ${STAGING_PROJECT.ref}
  --apply

Optional:
  --badge20-bye-phase-1  Create the real pending automatic-bye fixture and
                         persist its deadline-bound resume manifest.
  --badge20-bye-phase-2 --manifest <path> --run-marker <marker>
                         Resume the same fixture after its real deadline.
  --skip-remote-preflight   Dry-run only; suppress read-only Supabase preflight.
  --cleanup-dry-run --manifest <path>
                            Print a manifest-scoped cleanup plan without
                            mutating Supabase or Storage.

This harness has no production target and never falls back to .env.local.`);
}

function setBadge20ByePhase(options, phase) {
  if (options.badge20ByePhase !== null) {
    throw new Error("Select exactly one Badge 20 automatic-bye phase.");
  }
  options.badge20ByePhase = phase;
}

export function createRunMarker(date = new Date()) {
  const stamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/u, "Z");
  const suffix = randomBytes(4).toString("hex");

  return `badge-e2e-${stamp}-${suffix}`;
}

export function buildTargetContext(options, env = process.env) {
  if (!options.confirmProjectRef) {
    throw new Error(
      `${REQUIRED_CONFIRMATION_FLAG} ${STAGING_PROJECT.ref} is required.`
    );
  }

  const confirmedProjectRef = assertAllowedProjectRef(options.confirmProjectRef);

  const environment = readHarnessEnvironment(env);
  const projectRefFromUrl = inferSupabaseProjectRef(environment.supabaseUrl);
  const genericEnvironmentKeys = presentGenericSupabaseEnvironmentKeys(env);

  if (projectRefFromUrl && projectRefFromUrl !== confirmedProjectRef) {
    throw new Error(
      `Configured staging URL resolves to project ${projectRefFromUrl}, but confirmation was ${confirmedProjectRef}.`
    );
  }

  return {
    apply: options.apply,
    mode: options.apply ? "apply" : "dry-run",
    project: STAGING_PROJECT,
    environment,
    genericEnvironmentKeys,
    projectRefFromUrl,
    productionGuardStatus: "PASS: production ref is forbidden and target is fixed to staging",
  };
}

export function assertAllowedProjectRef(projectRef) {
  if (typeof projectRef !== "string" || projectRef.trim().length === 0) {
    throw new Error(
      `${REQUIRED_CONFIRMATION_FLAG} ${STAGING_PROJECT.ref} is required.`
    );
  }

  const normalizedProjectRef = projectRef.trim();

  if (!PROJECT_REF_PATTERN.test(normalizedProjectRef)) {
    throw new Error(
      `Malformed Supabase project ref ${normalizedProjectRef}. Expected a 20-character lowercase ref.`
    );
  }

  if (normalizedProjectRef === PRODUCTION_PROJECT.ref) {
    throw new Error(
      `Ref ${PRODUCTION_PROJECT.ref} is ${PRODUCTION_PROJECT.name}; production is forbidden.`
    );
  }

  if (normalizedProjectRef !== STAGING_PROJECT.ref) {
    throw new Error(
      `Unknown Supabase project ref ${normalizedProjectRef}. Only ${STAGING_PROJECT.ref} (${STAGING_PROJECT.name}) is allowed.`
    );
  }

  return normalizedProjectRef;
}

export function assertApplyEnvironment(targetContext) {
  if (targetContext.apply !== true) {
    throw new Error("--apply is required before any staging mutation helper can run.");
  }

  if (targetContext.project?.ref === PRODUCTION_PROJECT.ref) {
    throw new Error("Applied staging execution refuses the production project ref.");
  }

  if (targetContext.project?.ref !== STAGING_PROJECT.ref) {
    throw new Error("Applied staging execution is fixed to the staging project ref.");
  }

  const missing = missingRequiredEnvironment(targetContext.environment);

  if (missing.length > 0) {
    const genericKeys = targetContext.genericEnvironmentKeys ?? [];
    if (genericKeys.length > 0) {
      throw new Error(
        `Applied staging execution rejects generic Supabase fallback variables (${genericKeys.join(
          ", "
        )}). Set explicit BADGE_E2E_STAGING_* variables; generic values are ignored.`
      );
    }

    throw new Error(
      `Applied staging execution requires explicit staging environment variables: ${missing.join(
        ", "
      )}. Generic .env.local variables are intentionally ignored.`
    );
  }

  if (!targetContext.projectRefFromUrl) {
    throw new Error(
      "Project ref cannot be determined from BADGE_E2E_STAGING_SUPABASE_URL."
    );
  }

  if (targetContext.projectRefFromUrl === PRODUCTION_PROJECT.ref) {
    throw new Error(
      "BADGE_E2E_STAGING_SUPABASE_URL resolves to the production project ref."
    );
  }

  if (targetContext.projectRefFromUrl !== STAGING_PROJECT.ref) {
    throw new Error(
      `BADGE_E2E_STAGING_SUPABASE_URL resolves to ${targetContext.projectRefFromUrl}; expected ${STAGING_PROJECT.ref}.`
    );
  }
}

export function openMutationGate(targetContext, preflight) {
  assertApplyEnvironment(targetContext);
  assertPassedPreflight(preflight);

  return {
    ...targetContext,
    mutationGate: Object.freeze({
      state: "OPEN",
      projectRef: STAGING_PROJECT.ref,
      projectName: STAGING_PROJECT.name,
      preflightTargetRef: preflight.target_ref,
      preflightTargetEnvironment: preflight.target_environment,
      openedAt: new Date().toISOString(),
    }),
  };
}

export function assertMutationGateOpen(ctx) {
  const gate = ctx?.mutationGate;
  const projectRef = ctx?.project?.ref ?? ctx?.targetContext?.project?.ref;

  if (
    gate?.state !== "OPEN" ||
    gate.projectRef !== STAGING_PROJECT.ref ||
    gate.preflightTargetRef !== STAGING_PROJECT.ref ||
    projectRef !== STAGING_PROJECT.ref
  ) {
    throw new Error(
      "Mutation helper blocked: staging mutation gate is not open."
    );
  }
}

export function canRunRemotePreflight(targetContext) {
  const environment = targetContext.environment;
  const required = [
    "supabaseUrl",
    "serviceRoleKey",
    "anonKey",
    "authenticatedJwt",
    "supabaseAccessToken",
  ];

  return required.every((key) => typeof environment[key] === "string");
}

export function missingRequiredEnvironment(environment) {
  const pairs = [
    ["BADGE_E2E_STAGING_SUPABASE_URL", environment.supabaseUrl],
    ["BADGE_E2E_STAGING_SERVICE_ROLE_KEY", environment.serviceRoleKey],
    ["BADGE_E2E_STAGING_ANON_KEY", environment.anonKey],
    [
      "BADGE_E2E_STAGING_AUTHENTICATED_JWT",
      environment.authenticatedJwt,
    ],
    [
      "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN",
      environment.supabaseAccessToken,
    ],
  ];

  return pairs
    .filter(([, value]) => typeof value !== "string")
    .map(([name]) => name);
}

export function printTargetBanner({
  targetContext,
  runMarker,
  preflightStatus = "NOT RUN",
}) {
  console.log("TARGET PROJECT");
  console.log(targetContext.project.name);
  console.log("TARGET REF");
  console.log(targetContext.project.ref);
  console.log("ENVIRONMENT");
  console.log(targetContext.mode === "apply" ? "APPLIED STAGING" : "DRY-RUN");
  console.log("RUN MARKER");
  console.log(runMarker);
  console.log("PRODUCTION GUARD STATUS");
  console.log(targetContext.productionGuardStatus);
  console.log("PREFLIGHT STATUS");
  console.log(preflightStatus);
  console.log("");
}

export function printEnvironmentSummary(targetContext) {
  const environment = targetContext.environment;
  const presentByName = new Map([
    ["BADGE_E2E_STAGING_SUPABASE_URL", environment.supabaseUrl],
    ["BADGE_E2E_STAGING_SERVICE_ROLE_KEY", environment.serviceRoleKey],
    ["BADGE_E2E_STAGING_ANON_KEY", environment.anonKey],
    [
      "BADGE_E2E_STAGING_AUTHENTICATED_JWT",
      environment.authenticatedJwt,
    ],
    [
      "BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN",
      environment.supabaseAccessToken,
    ],
  ]);

  console.log("Required staging environment variables:");
  for (const spec of REQUIRED_APPLY_ENVIRONMENT) {
    const present = typeof presentByName.get(spec.name) === "string";
    const suffix = spec.secret ? "secret; value not printed" : "value not printed";
    console.log(`- ${spec.name}: ${present ? "present" : "absent"} (${suffix})`);
  }
  console.log("");
}

export function decodeJwtSubject(jwt) {
  if (typeof jwt !== "string") return null;

  const segments = jwt.split(".");
  if (segments.length < 2) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(base64UrlToBase64(segments[1]), "base64").toString("utf8")
    );

    return typeof payload.sub === "string" && payload.sub.trim()
      ? payload.sub.trim()
      : null;
  } catch {
    return null;
  }
}

function readHarnessEnvironment(env) {
  return {
    supabaseUrl: present(env.BADGE_E2E_STAGING_SUPABASE_URL),
    serviceRoleKey: present(env.BADGE_E2E_STAGING_SERVICE_ROLE_KEY),
    anonKey: present(env.BADGE_E2E_STAGING_ANON_KEY),
    authenticatedJwt: present(env.BADGE_E2E_STAGING_AUTHENTICATED_JWT),
    supabaseAccessToken: present(env.BADGE_E2E_STAGING_SUPABASE_ACCESS_TOKEN),
    syntheticFixtureSecret: present(env.BADGE_E2E_STAGING_SYNTHETIC_FIXTURE_SECRET),
  };
}

function presentGenericSupabaseEnvironmentKeys(env) {
  return GENERIC_SUPABASE_ENVIRONMENT_KEYS.filter((key) =>
    Boolean(present(env[key]))
  );
}

function inferSupabaseProjectRef(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const match = url.hostname.match(
      /^([a-z0-9]{20})\.supabase\.(?:co|in)$/iu
    );

    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    throw new Error(
      "BADGE_E2E_STAGING_SUPABASE_URL must be a valid absolute URL."
    );
  }
}

function present(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function base64UrlToBase64(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return padded.replaceAll("-", "+").replaceAll("_", "/");
}

function assertPassedPreflight(preflight) {
  if (!preflight || typeof preflight !== "object") {
    throw new Error("Applied staging execution requires a passed remote preflight.");
  }

  if (preflight.target_ref !== STAGING_PROJECT.ref) {
    throw new Error("Remote preflight did not target the staging project ref.");
  }

  if (preflight.target_environment !== STAGING_PROJECT.name) {
    throw new Error("Remote preflight did not target the staging environment.");
  }

  const failureEntries = Object.entries(preflight).filter(
    ([key, value]) =>
      /^(missing_|.*_issues$|unsafe_)/u.test(key) &&
      Array.isArray(value) &&
      value.length > 0
  );

  if (failureEntries.length > 0) {
    throw new Error("Applied staging execution requires a clean remote preflight.");
  }
}
