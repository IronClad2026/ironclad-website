import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const GUARD_NAME = "requireCurrentAccountLegalAcceptance";
const GUARD_MODULE = "@/lib/account-legal-mutation-guard";

const ALWAYS_GUARDED_ACTIONS = {
  "app/admin/announcements/actions.ts": [
    "createAnnouncementMediaUpload",
    "publishAnnouncement",
    "withdrawAnnouncement",
  ],
  "app/admin/elo-verification-actions.ts": [
    "updateEloVerificationMode",
    "updateEloVerificationSupportLink",
  ],
  "app/admin/leaderboard-actions.ts": [
    "runLeaderboardRecalculation",
    "deleteLeaderboardRecalculationRunRecords",
  ],
  "app/admin/maps/actions.ts": ["saveCoh3Map"],
  "app/admin/polls/actions.ts": [
    "savePollDraft",
    "deletePollDraft",
    "publishPoll",
    "cancelPoll",
    "publishPollFinalDecision",
  ],
  "app/admin/registration-actions.ts": [
    "updateRegistrationStatus",
    "deleteSelectedRegistrations",
    "approveSelectedRegistrations",
  ],
  "app/admin/tournaments/actions.ts": [
    "createTournamentBannerUpload",
    "saveTournament",
    "generateTournamentBracket",
    "saveBracketAssignments",
    "launchTournamentDivision",
    "closeTournamentDivisionWithoutLaunch",
    "deleteTournament",
  ],
  "app/admin/tournaments/deadline-actions.ts": [
    "extendTournamentMatchDeadline",
    "holdTournamentMatchDeadline",
    "releaseTournamentMatchDeadline",
  ],
  "app/admin/tournaments/map-pool-actions.ts": [
    "publishTournamentMapPools",
    "correctTournamentMapPool",
  ],
  "app/admin/tournaments/media-actions.ts": [
    "createTournamentMedia",
    "updateTournamentMedia",
    "setTournamentMediaPublished",
    "removeTournamentMedia",
  ],
  "app/announcements/actions.ts": ["markAnnouncementSeen"],
  "app/dashboard/actions.ts": [
    "dismissDashboardNotifications",
    "confirmDashboardMatchResult",
    "disputeDashboardMatchResult",
  ],
  "app/notifications/actions.ts": [
    "saveWebPushSubscription",
    "markInAppNotificationRead",
    "markVisibleInAppNotificationsRead",
    "markAllInAppNotificationsRead",
  ],
  "app/polls/actions.ts": ["castPollBallot"],
  "app/profile/actions.ts": ["savePlayerProfile"],
  "app/profile/relic-elo-action.ts": ["verifyRelicProfileElo"],
  "app/tournaments/actions.ts": ["submitTournamentRegistration"],
  "app/tournaments/dice-actions.ts": ["rollMatchDice"],
  "app/tournaments/match-actions.ts": [
    "prepareMatchReplayUploads",
    "finalizeMatchResult",
    "submitNoShowReport",
    "confirmMatchResultReportGroup",
    "disputeMatchResultReportGroup",
    "reviewMatchResultReportGroup",
    "saveAdminMatchResult",
    "resetAdminMatch",
    "reviewMatchResult",
  ],
  "app/tournaments/support-actions.ts": ["requestMatchAdminAssistance"],
} as const;

const DELEGATED_GUARDED_ACTIONS = [
  {
    path: "app/admin/tournaments/actions.ts",
    action: "cancelTournamentAction",
    delegate: "mutateTournamentTerminalState",
  },
  {
    path: "app/admin/tournaments/actions.ts",
    action: "voidTournamentAction",
    delegate: "mutateTournamentTerminalState",
  },
] as const;

const CONDITIONAL_GUARDED_ACTIONS = [
  {
    path: "app/dashboard/actions.ts",
    action: "updateDiscordPublicEnabled",
    condition: "enabled",
    exemption: "disabling public Discord visibility",
  },
  {
    path: "app/dashboard/public-profile-actions.ts",
    action: "updatePublicProfileEnabled",
    condition: "enabled",
    exemption: "making a public profile private",
  },
  {
    path: "app/dashboard/registration-actions.ts",
    action: "respondToWaitlistOfferAction",
    condition: 'response === "accept"',
    exemption: "declining a waitlist offer",
  },
  {
    path: "app/notifications/actions.ts",
    action: "deleteSelectedInAppNotifications",
    condition: 'scope === "admin"',
    exemption: "a player deleting their own notifications",
  },
] as const;

const FULL_MUTATION_EXEMPTIONS = {
  "app/admin/announcements/actions.ts": ["discardAnnouncementMediaUpload"],
  "app/admin/tournaments/actions.ts": [
    "discardTournamentBannerUpload",
    "retryTournamentStorageCleanup",
  ],
  "app/dashboard/registration-actions.ts": [
    "withdrawTournamentRegistrationAction",
  ],
  "app/notifications/actions.ts": ["deleteWebPushSubscription"],
  "app/tournaments/match-actions.ts": ["cleanupPreparedReplayUploads"],
} as const;

const LEGAL_AND_PRIVACY_EXEMPTIONS = {
  "app/legal-update-actions.ts": ["acceptAccountLegalUpdate"],
  "app/locale-actions.ts": [
    "setLocalePreference",
    "syncLocalePreferenceAfterAuth",
  ],
  "app/profile/delete-account-action.ts": ["deleteIronCladAccount"],
} as const;

const READ_ONLY_ACTIONS = {
  "app/admin/polls/actions.ts": [
    "loadAdminPollSnapshot",
    "previewPollEligibility",
  ],
  "app/admin/tournaments/media-actions.ts": [
    "loadAdminTournamentMediaWorkspace",
  ],
  "app/announcements/actions.ts": ["loadAnnouncementNavigationState"],
  "app/notifications/actions.ts": [
    "getNotificationPushConfiguration",
    "checkWebPushSubscriptionOwnership",
    "loadAuthoritativeNotificationUnreadCount",
  ],
} as const;

type ActionMap = Readonly<Record<string, readonly string[]>>;

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(
    /\r\n?/g,
    "\n"
  );
}

function parseSource(path: string) {
  return ts.createSourceFile(
    path,
    readSource(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
  );
}

function exportedAsyncFunctionNames(source: ts.SourceFile) {
  return source.statements
    .filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        Boolean(statement.name) &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
        hasModifier(statement, ts.SyntaxKind.AsyncKeyword)
    )
    .map((statement) => statement.name!.text)
    .sort();
}

function functionDeclaration(source: ts.SourceFile, name: string) {
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );

  if (!declaration?.body) {
    throw new Error(`Missing function body for ${source.fileName}#${name}`);
  }

  return declaration;
}

function guardCalls(declaration: ts.FunctionDeclaration) {
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === GUARD_NAME
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(declaration.body!);
  return calls;
}

function importsGuard(source: ts.SourceFile) {
  return source.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== GUARD_MODULE
    ) {
      return false;
    }

    const bindings = statement.importClause?.namedBindings;
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => (element.propertyName ?? element.name).text === GUARD_NAME
      )
    );
  });
}

function nearestGuardCondition(
  source: ts.SourceFile,
  declaration: ts.FunctionDeclaration,
  call: ts.CallExpression
) {
  let current: ts.Node | undefined = call.parent;

  while (current && current !== declaration) {
    if (ts.isIfStatement(current)) {
      return current.expression.getText(source).replace(/\s+/g, " ").trim();
    }
    current = current.parent;
  }

  return null;
}

function flattenedInventory(map: ActionMap) {
  return Object.entries(map).flatMap(([path, actions]) =>
    actions.map((action) => `${path}#${action}`)
  );
}

function compact(source: string) {
  return source.replace(/\s+/g, " ").trim().toLowerCase();
}

function expectServiceRoleOnly(source: string, functionName: string) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(source).toMatch(
    new RegExp(
      `revoke all on function public\\.${escapedName}\\s*\\([^)]*\\)\\s*from public, anon, authenticated;`
    )
  );
  expect(source).toMatch(
    new RegExp(
      `grant execute on function public\\.${escapedName}\\s*\\([^)]*\\)\\s*to service_role;`
    )
  );
  expect(source).not.toMatch(
    new RegExp(
      `grant execute on function public\\.${escapedName}\\s*\\([^)]*\\)\\s*to [^;]*(?:public|anon|authenticated)[^;]*;`
    )
  );
}

describe("account legal mutation boundary architecture", () => {
  it("keeps every exported Server Action explicitly classified", () => {
    const expected = [
      ...flattenedInventory(ALWAYS_GUARDED_ACTIONS),
      ...DELEGATED_GUARDED_ACTIONS.map(
        ({ path, action }) => `${path}#${action}`
      ),
      ...CONDITIONAL_GUARDED_ACTIONS.map(
        ({ path, action }) => `${path}#${action}`
      ),
      ...flattenedInventory(FULL_MUTATION_EXEMPTIONS),
      ...flattenedInventory(LEGAL_AND_PRIVACY_EXEMPTIONS),
      ...flattenedInventory(READ_ONLY_ACTIONS),
    ];
    const paths = [...new Set(expected.map((entry) => entry.split("#")[0]))];
    const actual = paths.flatMap((path) =>
      exportedAsyncFunctionNames(parseSource(path)).map(
        (action) => `${path}#${action}`
      )
    );

    expect(new Set(expected).size).toBe(78);
    expect(expected).toHaveLength(78);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("guards all 57 ordinary authenticated mutations", () => {
    const directlyGuarded = flattenedInventory(ALWAYS_GUARDED_ACTIONS);

    expect(directlyGuarded).toHaveLength(55);
    expect(DELEGATED_GUARDED_ACTIONS).toHaveLength(2);

    for (const [path, actions] of Object.entries(ALWAYS_GUARDED_ACTIONS)) {
      const source = parseSource(path);
      expect(importsGuard(source), path).toBe(true);

      for (const action of actions) {
        const calls = guardCalls(functionDeclaration(source, action));
        expect(calls, `${path}#${action}`).toHaveLength(1);
        expect(
          calls.every((call) => ts.isAwaitExpression(call.parent)),
          `${path}#${action}`
        ).toBe(true);
      }
    }

    for (const { path, action, delegate } of DELEGATED_GUARDED_ACTIONS) {
      const source = parseSource(path);
      const actionBody = functionDeclaration(source, action).body!.getText(
        source
      );
      const delegateCalls = guardCalls(functionDeclaration(source, delegate));

      expect(importsGuard(source), path).toBe(true);
      expect(actionBody, `${path}#${action}`).toContain(`${delegate}(`);
      expect(delegateCalls, `${path}#${delegate}`).toHaveLength(1);
      expect(ts.isAwaitExpression(delegateCalls[0].parent)).toBe(true);
    }
  });

  it("keeps the four one-way privacy and withdrawal exemptions conditional", () => {
    expect(CONDITIONAL_GUARDED_ACTIONS).toHaveLength(4);

    for (const { path, action, condition, exemption } of
      CONDITIONAL_GUARDED_ACTIONS) {
      const source = parseSource(path);
      const declaration = functionDeclaration(source, action);
      const calls = guardCalls(declaration);

      expect(importsGuard(source), path).toBe(true);
      expect(calls, `${path}#${action}: ${exemption}`).toHaveLength(1);
      expect(ts.isAwaitExpression(calls[0].parent)).toBe(true);
      expect(nearestGuardCondition(source, declaration, calls[0])).toBe(
        condition
      );
    }
  });

  it("keeps cleanup, legal, privacy, language, and read-only exemptions unguarded", () => {
    expect(flattenedInventory(FULL_MUTATION_EXEMPTIONS)).toHaveLength(6);
    expect(flattenedInventory(LEGAL_AND_PRIVACY_EXEMPTIONS)).toHaveLength(4);
    expect(flattenedInventory(READ_ONLY_ACTIONS)).toHaveLength(7);

    for (const inventory of [
      FULL_MUTATION_EXEMPTIONS,
      LEGAL_AND_PRIVACY_EXEMPTIONS,
      READ_ONLY_ACTIONS,
    ] as const) {
      for (const [path, actions] of Object.entries(inventory)) {
        const source = parseSource(path);
        for (const action of actions) {
          expect(
            guardCalls(functionDeclaration(source, action)),
            `${path}#${action}`
          ).toHaveLength(0);
        }
      }
    }

    const legalShell = readSource(
      "components/legal/AccountLegalUpdateShell.tsx"
    );
    expect(legalShell).toContain('import { SignOutButton } from "@clerk/nextjs"');
    expect(legalShell).toContain('<SignOutButton redirectUrl="/">');
  });

  it("places the legal guard before the confirm and dispute service RPCs", () => {
    for (const { path, action, rpc } of [
      {
        path: "app/dashboard/actions.ts",
        action: "confirmDashboardMatchResult",
        rpc: "confirm_match_result_report_group_api",
      },
      {
        path: "app/dashboard/actions.ts",
        action: "disputeDashboardMatchResult",
        rpc: "dispute_match_result_report_group_api",
      },
      {
        path: "app/tournaments/match-actions.ts",
        action: "confirmMatchResultReportGroup",
        rpc: "confirm_match_result_report_group_api",
      },
      {
        path: "app/tournaments/match-actions.ts",
        action: "disputeMatchResultReportGroup",
        rpc: "dispute_match_result_report_group_api",
      },
    ]) {
      const source = parseSource(path);
      const body = functionDeclaration(source, action).body!.getText(source);
      const guardIndex = body.indexOf(`await ${GUARD_NAME}()`);
      const clientIndex = body.indexOf("createSupabaseAdminClient()");
      const rpcIndex = body.indexOf(`rpc(\"${rpc}\"`);

      expect(guardIndex, `${path}#${action}`).toBeGreaterThan(-1);
      expect(clientIndex, `${path}#${action}`).toBeGreaterThan(guardIndex);
      expect(rpcIndex, `${path}#${action}`).toBeGreaterThan(clientIndex);
    }
  });

  it("keeps confirm and dispute RPCs inaccessible to browser roles", () => {
    const coreMigration = compact(
      readSource(
        "supabase/migrations/20260823100000_match_result_transactional_trust.sql"
      )
    );
    const apiMigration = compact(
      readSource(
        "supabase/migrations/20260823110000_match_result_conflict_transport.sql"
      )
    );
    const permissionMigration = compact(
      readSource(
        "supabase/migrations/20260725090000_match_result_privacy_hardening.sql"
      )
    );

    for (const functionName of [
      "confirm_match_result_report_group",
      "dispute_match_result_report_group",
    ]) {
      expectServiceRoleOnly(coreMigration, functionName);
    }

    for (const functionName of [
      "confirm_match_result_report_group_api",
      "dispute_match_result_report_group_api",
    ]) {
      expectServiceRoleOnly(apiMigration, functionName);
    }

    expect(permissionMigration).toContain(
      "revoke all privileges on table public.match_result_submissions, public.match_result_report_groups, public.notifications from public, anon, authenticated;"
    );
    expect(permissionMigration).toContain(
      "grant all privileges on table public.match_result_submissions, public.match_result_report_groups, public.notifications to service_role;"
    );

    const adminClient = readSource("lib/supabase-admin.ts");
    const browserClient = readSource("lib/supabase-browser.ts");
    expect(adminClient).toContain('import "server-only"');
    expect(adminClient).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).toContain("supabasePublishableKey");
    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
