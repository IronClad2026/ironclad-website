import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedSha256(value: string) {
  return createHash("sha256")
    .update(value.replace(/\r\n?/g, "\n"))
    .digest("hex");
}

function migrationTreeSha256(names: string[]) {
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(name);
    hash.update("\0");
    hash.update(read(`supabase/migrations/${name}`).replace(/\r\n?/g, "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const source = {
  actions: read("app/admin/tournaments/actions.ts"),
  admin: read("app/admin/page.tsx"),
  announcements: read("app/announcements/page.tsx"),
  announcementsAdmin: read("app/admin/announcements/page.tsx"),
  banner: read("components/TournamentBannerPicker.tsx"),
  bracket: read("components/AdminBracketManagement.tsx"),
  bracketPopulation: read("components/AdminBracketPopulation.tsx"),
  bracketStructure: read(
    "components/admin/tournaments/TournamentBracketStructureControls.tsx"
  ),
  controls: read("components/admin/tournaments/TournamentControls.tsx"),
  deadlineActions: read("app/admin/tournaments/deadline-actions.ts"),
  deadlineControls: read("components/AdminMatchDeadlineControls.tsx"),
  deleteControl: read("components/DeleteTournamentControl.tsx"),
  editor: read("components/admin/tournaments/TournamentEditor.tsx"),
  experience: read("components/TournamentsExperience.tsx"),
  list: read("app/admin/tournaments/page.tsx"),
  mapPool: read("components/AdminTournamentMapPools.tsx"),
  mapPoolActions: read("app/admin/tournaments/map-pool-actions.ts"),
  media: read("components/admin/tournaments/AdminTournamentMedia.tsx"),
  mediaActions: read("app/admin/tournaments/media-actions.ts"),
  matchActions: read("app/tournaments/match-actions.ts"),
  matchControls: read("components/MatchResultControls.tsx"),
  matches: read("components/admin/tournaments/AdminTournamentMatches.tsx"),
  menu: read(
    "components/admin/tournaments/TournamentManagementMenu.tsx"
  ),
  navbar: read("components/Navbar.tsx"),
  newRoute: read("app/admin/tournaments/new/page.tsx"),
  overview: read("components/admin/tournaments/TournamentOverview.tsx"),
  recovery: read("components/TournamentRecoveryControl.tsx"),
  registrationActions: read("app/admin/registration-actions.ts"),
  registrationDialog: read(
    "components/admin/tournaments/AdminRegistrationDetailDialog.tsx"
  ),
  registrations: read(
    "components/admin/tournaments/AdminTournamentRegistrations.tsx"
  ),
  registrationRows: read("components/AdminRegistrationReviewRows.tsx"),
  system: read("app/admin/system/page.tsx"),
  registrationWorkspace: read(
    "lib/admin-tournament-registration-workspace.ts"
  ),
  workspace: read("app/admin/tournaments/[tournamentId]/page.tsx"),
  workspaceData: read("lib/admin-tournament-workspace.ts"),
  workspaceHeader: read(
    "components/admin/tournaments/TournamentWorkspaceHeader.tsx"
  ),
  matchWorkspace: read("lib/admin-tournament-match-workspace.ts"),
} as const;

type SourceKey = keyof typeof source;
type WorkspaceSection =
  | "overview"
  | "edit"
  | "registrations"
  | "players-waitlist"
  | "bracket"
  | "matches"
  | "media"
  | "map-pool"
  | "controls"
  | "outside-workspace";

type Capability = {
  id: number;
  label: string;
  section: WorkspaceSection;
  evidence: Array<{
    file: SourceKey;
    includes: string[];
  }>;
};

const capabilities: Capability[] = [
  {
    id: 1,
    label: "list/selection",
    section: "overview",
    evidence: [
      {
        file: "list",
        includes: [
          "Select one Tournament to open its focused management workspace.",
          "?section=overview",
        ],
      },
    ],
  },
  {
    id: 2,
    label: "new draft restore",
    section: "edit",
    evidence: [
      { file: "newRoute", includes: ["EMPTY_TOURNAMENT_VALUES"] },
      {
        file: "editor",
        includes: ["<TournamentFormDraft", "enabled={!values.id}"],
      },
    ],
  },
  {
    id: 3,
    label: "banner upload/preview/validation/discard",
    section: "edit",
    evidence: [
      { file: "editor", includes: ["<TournamentBannerPicker"] },
      {
        file: "actions",
        includes: [
          "export async function createTournamentBannerUpload",
          "export async function discardTournamentBannerUpload",
          "isVerifiedTournamentBanner",
        ],
      },
      { file: "banner", includes: ["preview", "discardTournamentBannerUpload"] },
    ],
  },
  {
    id: 4,
    label: "all create/edit fields",
    section: "edit",
    evidence: [
      {
        file: "editor",
        includes: [
          'label="Title"',
          "Description",
          'label="Status"',
          'label="Format"',
          'label="Rule Format"',
          'label="Result Confirmation Window"',
          'label="Registration Opens (optional)"',
          'label="Registration Closes (optional)"',
          "data-event-scheduling-policy",
          "data-registration-window-controls",
          'label="Prize Pool (optional)"',
          'label="Rules URL (optional)"',
          'label="Battlefy URL (optional)"',
        ],
      },
    ],
  },
  {
    id: 5,
    label: "Closed/Open",
    section: "edit",
    evidence: [
      {
        file: "editor",
        includes: [
          '["upcoming", "Closed"]',
          '["registration_open", "Open"]',
        ],
      },
    ],
  },
  {
    id: 6,
    label: "lifecycle status read-only",
    section: "edit",
    evidence: [
      {
        file: "editor",
        includes: [
          "In Progress — managed by division launch",
          "Completed — managed by match lifecycle",
        ],
      },
      {
        file: "actions",
        includes: [
          "Tournament lifecycle status is managed by Launch Division and match completion",
        ],
      },
    ],
  },
  {
    id: 7,
    label: "divisions config",
    section: "edit",
    evidence: [
      {
        file: "editor",
        includes: ["TOURNAMENT_BRACKET_CONFIGS.map", "<BracketFields"],
      },
    ],
  },
  {
    id: 8,
    label: "fixed capacity",
    section: "edit",
    evidence: [
      {
        file: "editor",
        includes: [
          'name={`${prefix}MaxPlayers`}',
          'value="8"',
          "Fixed at exactly eight players",
        ],
      },
      { file: "actions", includes: ["maxPlayers !== 8"] },
    ],
  },
  {
    id: 9,
    label: "private bracket generate",
    section: "bracket",
    evidence: [
      {
        file: "bracketStructure",
        includes: ["action={generateTournamentBracket}", "Generate Private Structure"],
      },
      { file: "actions", includes: ['rpc("generate_tournament_bracket"'] },
    ],
  },
  {
    id: 10,
    label: "regenerate/repair",
    section: "bracket",
    evidence: [
      {
        file: "bracketStructure",
        includes: ["Regenerate Private Structure"],
      },
      {
        file: "bracket",
        includes: [
          "Bracket synchronization repair required",
          "Regenerate the private structure",
          "?section=bracket",
        ],
      },
    ],
  },
  {
    id: 11,
    label: "drag/drop seed",
    section: "bracket",
    evidence: [
      {
        file: "bracketPopulation",
        includes: ["draggable", "dropIntoSlot", "dataTransfer.dropEffect"],
      },
    ],
  },
  {
    id: 12,
    label: "touch/select seed",
    section: "bracket",
    evidence: [
      {
        file: "bracketPopulation",
        includes: ["or use the slot selectors", "<select"],
      },
    ],
  },
  {
    id: 13,
    label: "reset/save assignments",
    section: "bracket",
    evidence: [
      {
        file: "bracketPopulation",
        includes: ["Reset Changes", "Save Private Bracket Assignments"],
      },
      { file: "actions", includes: ['rpc("save_bracket_assignments"'] },
    ],
  },
  {
    id: 14,
    label: "launch readiness gates",
    section: "bracket",
    evidence: [
      {
        file: "bracket",
        includes: [
          "const canLaunch",
          "selectedBracket.isReady",
          "assignmentsComplete",
          "mapPoolReady",
        ],
      },
    ],
  },
  {
    id: 15,
    label: "launch",
    section: "bracket",
    evidence: [
      {
        file: "bracket",
        includes: ["action={launchTournamentDivision}", "Launch Division"],
      },
      { file: "actions", includes: ['rpc("launch_tournament_division"'] },
    ],
  },
  {
    id: 16,
    label: "public bracket link",
    section: "bracket",
    evidence: [
      { file: "bracket", includes: ['href="/tournaments"', "View Public Bracket"] },
    ],
  },
  {
    id: 17,
    label: "registration filters",
    section: "registrations",
    evidence: [
      {
        file: "registrations",
        includes: [
          '["all", "pending", "manual_review", "approved", "rejected", "withdrawn"]',
          "aria-current={data.activeFilter === filter ? \"page\" : undefined}",
        ],
      },
    ],
  },
  {
    id: 18,
    label: "cohort/readiness summaries",
    section: "registrations",
    evidence: [
      {
        file: "registrations",
        includes: [
          "data.cohortSummaries.map",
          "Active cohort:",
          "formatTournamentDivisionState(summary.divisionState)",
        ],
      },
      {
        file: "registrationWorkspace",
        includes: ["divisionStates", "divisionStateByBracket"],
      },
      {
        file: "workspaceData",
        includes: ["loadTournamentDivisionStates", "divisionStates"],
      },
    ],
  },
  {
    id: 19,
    label: "evidence/details",
    section: "registrations",
    evidence: [
      {
        file: "registrationDialog",
        includes: ["getEvidenceFacts", "Frozen Tournament registration ELO", "Eligibility rules version"],
      },
    ],
  },
  {
    id: 20,
    label: "private notes",
    section: "registrations",
    evidence: [
      {
        file: "registrationDialog",
        includes: ["Private Admin Note", "Save Private Note"],
      },
      { file: "registrationActions", includes: ['formData.get("adminNotes")'] },
    ],
  },
  {
    id: 21,
    label: "approve/reject/manual review/return pending",
    section: "registrations",
    evidence: [
      {
        file: "registrationRows",
        includes: ["Approve", "Reject", "Mark Manual Review", "Return to Pending Review"],
      },
      {
        file: "registrationActions",
        includes: ['rpc("review_tournament_registration"'],
      },
    ],
  },
  {
    id: 22,
    label: "bulk approval/partial failure",
    section: "registrations",
    evidence: [
      {
        file: "registrations",
        includes: ["Approve Selected", "registration-bulk-partial", "Some selected registration(s) were approved"],
      },
      {
        file: "registrationActions",
        includes: ["export async function approveSelectedRegistrations"],
      },
    ],
  },
  {
    id: 23,
    label: "FIFO waitlist/offer",
    section: "players-waitlist",
    evidence: [
      {
        file: "registrations",
        includes: ["FIFO Waitlist", "Waitlist Position", "Offer ${formatLabel"],
      },
      {
        file: "registrationWorkspace",
        includes: ["buildWaitlistPositionMap", "waitlist_offer_status"],
      },
    ],
  },
  {
    id: 24,
    label: "no manual promotion",
    section: "players-waitlist",
    evidence: [
      {
        file: "registrationDialog",
        includes: [
          "A waitlisted Player cannot be promoted by an administrator.",
          "oldest eligible FIFO offer",
        ],
      },
    ],
  },
  {
    id: 25,
    label: "launched/terminal locks",
    section: "players-waitlist",
    evidence: [
      {
        file: "registrationDialog",
        includes: [
          "This Division has launched. Registration status decisions are locked",
          "This Tournament is terminal. Competition decisions are locked",
        ],
      },
    ],
  },
  {
    id: 26,
    label: "map search/select",
    section: "map-pool",
    evidence: [
      { file: "mapPool", includes: ["Search catalogue", "visibleMaps", "toggleMap"] },
    ],
  },
  {
    id: 27,
    label: "publish/republish division",
    section: "map-pool",
    evidence: [
      {
        file: "mapPool",
        includes: ["Publish This Division", "Republish This Division", "action={publishTournamentMapPools}"],
      },
    ],
  },
  {
    id: 28,
    label: "apply pool all",
    section: "map-pool",
    evidence: [
      {
        file: "mapPool",
        includes: ["Use This Pool For All Divisions", "brackets.map((bracket) => bracket.id)"],
      },
    ],
  },
  {
    id: 29,
    label: "audited correction",
    section: "map-pool",
    evidence: [
      {
        file: "mapPool",
        includes: ["action={correctTournamentMapPool}", "Apply Audited Post-Launch Correction"],
      },
      {
        file: "mapPoolActions",
        includes: ["correct_tournament_bracket_map_pool"],
      },
    ],
  },
  {
    id: 30,
    label: "terminal/legacy map pool",
    section: "map-pool",
    evidence: [
      {
        file: "mapPool",
        includes: [
          "This tournament is read-only. Its published map pools remain",
          "This legacy Division launched before map-pool publication",
        ],
      },
    ],
  },
  {
    id: 31,
    label: "match selection",
    section: "matches",
    evidence: [
      {
        file: "matches",
        includes: ["selectedMatchId", "data-admin-tournament-match", "Open match management"],
      },
    ],
  },
  {
    id: 32,
    label: "report-group result/no-show/dispute",
    section: "matches",
    evidence: [
      {
        file: "matchControls",
        includes: ["ReportGroupReview", 'resultType === "no_show"', '"disputed"'],
      },
      {
        file: "matchActions",
        includes: ["reviewMatchResultReportGroup"],
      },
    ],
  },
  {
    id: 33,
    label: "legacy result",
    section: "matches",
    evidence: [
      {
        file: "experience",
        includes: ["AdminMatchResultSummaries", "Legacy submissions"],
      },
      { file: "matchActions", includes: ["reviewMatchResult"] },
    ],
  },
  {
    id: 34,
    label: "replay/audit",
    section: "matches",
    evidence: [
      { file: "experience", includes: ["Replay packages"] },
      { file: "matchControls", includes: ["Official Result Audit"] },
      {
        file: "matchActions",
        includes: ["prepareMatchReplayUploads", "finalizeMatchReplayResult"],
      },
    ],
  },
  {
    id: 35,
    label: "official result",
    section: "matches",
    evidence: [
      { file: "matchControls", includes: ["Official Result Entry", "saveAdminMatchResult"] },
    ],
  },
  {
    id: 36,
    label: "reset",
    section: "matches",
    evidence: [
      { file: "matchControls", includes: ["AdminResetMatchForm", "resetAdminMatch"] },
    ],
  },
  {
    id: 37,
    label: "deadline audit",
    section: "matches",
    evidence: [
      {
        file: "deadlineControls",
        includes: ["Match Deadline", "Extension reason", "Hold reason", "Activation"],
      },
    ],
  },
  {
    id: 38,
    label: "extension",
    section: "matches",
    evidence: [
      { file: "deadlineControls", includes: ["Apply One-Time Extension"] },
      {
        file: "deadlineActions",
        includes: ["extendTournamentMatchDeadline", "extend_tournament_match_deadline"],
      },
    ],
  },
  {
    id: 39,
    label: "hold",
    section: "matches",
    evidence: [
      { file: "deadlineControls", includes: ["Place Match On Hold"] },
      {
        file: "deadlineActions",
        includes: ["holdTournamentMatchDeadline", "hold_tournament_match_deadline"],
      },
    ],
  },
  {
    id: 40,
    label: "release",
    section: "matches",
    evidence: [
      { file: "deadlineControls", includes: ["Release Hold & Resume Deadline"] },
      {
        file: "deadlineActions",
        includes: ["releaseTournamentMatchDeadline", "release_tournament_match_deadline"],
      },
    ],
  },
  {
    id: 41,
    label: "dice snapshot",
    section: "matches",
    evidence: [
      { file: "experience", includes: ["AuthenticatedMatchDiceRollOff", "get_match_dice_rolloff"] },
      { file: "matches", includes: ["<AdminMatchManagementModal"] },
    ],
  },
  {
    id: 42,
    label: "terminal match history",
    section: "matches",
    evidence: [
      {
        file: "matches",
        includes: ["isTournamentTerminalStatus", "Read-only history", "View match history"],
      },
    ],
  },
  {
    id: 43,
    label: "cancel",
    section: "controls",
    evidence: [
      { file: "recovery", includes: ["cancelTournamentAction", "Cancel Tournament", 'operation="cancel"'] },
    ],
  },
  {
    id: 44,
    label: "void",
    section: "controls",
    evidence: [
      { file: "recovery", includes: ["voidTournamentAction", "Void Tournament", 'operation="void"'] },
    ],
  },
  {
    id: 45,
    label: "under-review metadata",
    section: "controls",
    evidence: [
      {
        file: "recovery",
        includes: ["UnderReviewMetadata", "Triggering tournament", "Review timestamp", "Private reason"],
      },
    ],
  },
  {
    id: 46,
    label: "hard-delete preview/dialog/guard",
    section: "controls",
    evidence: [
      { file: "controls", includes: ['variant="standalone"', "<DeleteTournamentControl"] },
      {
        file: "deleteControl",
        includes: [
          'role="dialog"',
          "Related Records",
          '<span className="text-red-300">DELETE</span>',
          "to continue",
        ],
      },
      {
        file: "actions",
        includes: ["TOURNAMENT_HARD_DELETE_GUARD_CODE", 'rpc("delete_tournament_data"'],
      },
    ],
  },
  {
    id: 47,
    label: "failed cleanup retry",
    section: "controls",
    evidence: [
      { file: "list", includes: ["Storage Cleanup Required", "Retry Storage Cleanup"] },
      {
        file: "actions",
        includes: ["export async function retryTournamentStorageCleanup"],
      },
    ],
  },
  {
    id: 48,
    label: "automatic lifecycle completion",
    section: "overview",
    evidence: [
      {
        file: "controls",
        includes: [
          "Tournament completion, finalization, and archive behavior continues to be managed automatically by the existing match lifecycle.",
        ],
      },
      { file: "overview", includes: ["Operational snapshot", "Launched Divisions"] },
    ],
  },
  {
    id: 49,
    label: "global ELO/leaderboard/notifications/maps/polls/announcements outside workspace",
    section: "outside-workspace",
    evidence: [
      {
        file: "system",
        includes: [
          "AdminEloVerificationChecker",
          "AdminLeaderboardControls",
        ],
      },
      {
        file: "admin",
        includes: [
          "InAppNotificationCenter",
          'href: "/admin/maps"',
          'href: "/admin/polls"',
          'href: "/admin/announcements"',
        ],
      },
    ],
  },
  {
    id: 50,
    label: "Tournament Media management",
    section: "media",
    evidence: [
      {
        file: "media",
        includes: [
          "Tournament Media",
          "Associated Match (optional)",
          "Publication state",
          "Save Media",
          "Confirm Remove",
        ],
      },
      {
        file: "mediaActions",
        includes: [
          "export async function createTournamentMedia",
          "export async function updateTournamentMedia",
          "export async function setTournamentMediaPublished",
          "export async function removeTournamentMedia",
          "verifyMatchScope",
        ],
      },
    ],
  },
];

describe("PR 5 Admin Tournament workspace source contract", () => {
  it("keeps the exact nine-section route taxonomy and all 50 capabilities reachable", () => {
    expect(capabilities.map(({ id }) => id)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1)
    );
    expect(
      new Set(
        capabilities
          .map(({ section }) => section)
          .filter((section) => section !== "outside-workspace")
      )
    ).toEqual(
      new Set([
        "overview",
        "edit",
        "registrations",
        "players-waitlist",
        "bracket",
        "matches",
        "media",
        "map-pool",
        "controls",
      ])
    );

    for (const capability of capabilities) {
      for (const evidence of capability.evidence) {
        for (const expected of evidence.includes) {
          expect(
            compact(source[evidence.file]),
            `${capability.id}. ${capability.label} missing from ${evidence.file}`
          ).toContain(compact(expected));
        }
      }
    }
  });

  it("keeps list, create, legacy-selection, and direct-refresh route contracts", () => {
    const list = compact(source.list);
    const newRoute = compact(source.newRoute);
    const workspace = compact(source.workspace);
    const menu = compact(source.menu);

    expect(list).toContain('href="/admin/tournaments/new"');
    expect(list).toContain("if (params?.selected)");
    expect(list).toContain("/admin/tournaments/${encodeURIComponent(params.selected)}");
    expect(newRoute).toContain("Creation stays separate from the management workspace.");
    expect(workspace).toContain("params: Promise<{ tournamentId: string; }>");
    expect(workspace).toContain("searchParams?: Promise<{");
    expect(workspace).toContain("const section = getSection(query?.section)");
    expect(workspace).toContain("id={`tournament-management-section-${section}`}");
    expect(menu).toContain("?section=${item.section}");
  });

  it("authorizes every route and server loader before privileged access", () => {
    for (const key of ["list", "newRoute", "workspace"] as const) {
      const page = compact(source[key]);
      expect(page, key).toContain("const { userId, sessionClaims } = await auth()");
      expect(page, key).toContain('role !== "admin"');
      expect(page, key).toContain('redirect("/")');
    }

    for (const key of [
      "workspaceData",
      "registrationWorkspace",
      "matchWorkspace",
    ] as const) {
      expect(compact(source[key]), key).toContain('import "server-only"');
      expect(compact(source[key]), key).toContain("await auth()");
    }

    expect(source.workspace).toContain("if (!isUuid(tournamentId))");
    expect(source.workspace).toContain("notFound()");
    const clientPresentation = [
      source.menu,
      source.editor,
      source.registrations,
      source.matches,
      source.media,
    ].join("\n");
    expect(clientPresentation).not.toContain("@/lib/supabase-admin");
  });

  it("projects the central division state across Admin surfaces without direct readiness RPCs", () => {
    expect(source.workspaceData).toContain("loadTournamentDivisionStates");
    expect(source.workspace).toContain("summary.divisionStates");
    expect(source.workspaceHeader).toContain("formatTournamentDivisionState");
    expect(source.overview).toContain("formatTournamentEventDivisionState");
    expect(source.bracketStructure).toContain(
      "formatTournamentDivisionState"
    );
    expect(source.bracket).toContain("selectedBracket.divisionState.state");

    for (const key of [
      "list",
      "workspace",
      "workspaceData",
      "registrationWorkspace",
    ] as const) {
      expect(source[key], key).not.toContain(
        "get_tournament_bracket_readiness"
      );
    }
  });

  it("renders one selected section at a time and preserves section-aware actions", () => {
    const workspace = compact(source.workspace);
    const actions = compact(source.actions);

    expect(workspace).toContain("const content = await renderWorkspaceSection({");
    expect(source.workspace.split("{content}")).toHaveLength(2);
    for (const section of [
      "overview",
      "edit",
      "registrations",
      "players-waitlist",
      "bracket",
      "matches",
      "replays",
      "media",
      "map-pool",
    ]) {
      expect(workspace).toContain(`section === "${section}"`);
    }
    expect(workspace).toContain("<TournamentControls");
    expect(compact(source.bracketStructure)).toContain(
      'name="workspaceSection" value="bracket"'
    );
    expect(actions).toContain(
      'getText(formData, "workspaceSection") === "bracket" ? "bracket" : "edit"'
    );
    expect(actions).toContain(
      "buildTournamentWorkspaceHref( tournamentId, returnSection,"
    );
  });

  it("reuses authoritative actions and does not create a second mutation layer", () => {
    const presentation = [
      source.workspace,
      source.workspaceHeader,
      source.overview,
      source.editor,
      source.registrations,
      source.registrationDialog,
      source.bracketStructure,
      source.bracket,
      source.bracketPopulation,
      source.matches,
      source.media,
      source.mapPool,
      source.controls,
      source.recovery,
    ].join("\n");

    expect(presentation).not.toContain('"use server"');
    expect(presentation).not.toContain(".rpc(");
    expect(source.workspace).not.toMatch(/export async function (save|create|update|delete|launch|publish|correct|review)/);
    expect(source.actions.match(/rpc\("save_tournament"/g)).toHaveLength(1);
    expect(source.actions.match(/rpc\("generate_tournament_bracket"/g)).toHaveLength(1);
    expect(source.actions.match(/rpc\("save_bracket_assignments"/g)).toHaveLength(1);
    expect(source.actions.match(/rpc\("launch_tournament_division"/g)).toHaveLength(1);
    expect(source.actions.match(/rpc\("delete_tournament_data"/g)).toHaveLength(1);
    expect(source.mapPoolActions.match(/rpc\(/g)).toHaveLength(2);
    expect(source.registrationActions.match(/rpc\("review_tournament_registration"/g)).toHaveLength(2);
    expect(source.mediaActions).not.toContain(".rpc(");
    for (const action of [
      "createTournamentMedia",
      "updateTournamentMedia",
      "setTournamentMediaPublished",
      "removeTournamentMedia",
    ]) {
      expect(compact(source.mediaActions)).toContain(
        `export async function ${action}`
      );
    }
    expect(source.mediaActions.match(/await requireAdmin\(\)/g)).toHaveLength(5);
    expect(source.admin).not.toContain("async function updateRegistrationStatus(");
  });

  it("redirects create/edit saves to the exact saved Tournament workspace", () => {
    expect(compact(source.actions)).toContain(
      "redirect( `/admin/tournaments/${encodeURIComponent(savedTournamentId)}?section=overview&notice=saved` )"
    );
    expect(source.actions).toContain(
      'revalidatePath(`/admin/tournaments/${savedTournamentId}`, "page")'
    );
  });

  it("keeps destructive operations isolated and does not invent launch-scope controls", () => {
    expect(compact(source.menu)).toContain(
      'data-management-group={ item.separated ? "tournament-controls" : "standard" }'
    );
    expect(source.menu).toContain("border-t border-red-500/25");
    expect(source.controls).toContain("High-impact operations");
    expect(source.controls).toContain("Cancel, Void, and hard Delete remain separated");
    expect(source.overview).not.toContain("DeleteTournamentControl");
    expect(source.editor).not.toContain("DeleteTournamentControl");
    expect(source.actions).not.toContain("export async function archiveTournament");
    expect(source.actions).not.toContain("export async function finalizeTournament");
    expect(source.registrationActions).not.toContain("promoteWaitlisted");
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "app/admin/tournaments/[tournamentId]/disputes/page.tsx"
        )
      )
    ).toBe(false);
  });

  it("preserves PR 4 Announcements and the separate global Admin surfaces", () => {
    expect(source.announcements).toContain("<AnnouncementsFeed");
    expect(source.announcementsAdmin).toContain("<AdminAnnouncements");
    expect(source.navbar).toContain('const announcementHref = "/announcements"');
    expect(source.navbar).toContain("useAnnouncementUnreadState");
    expect(source.admin).toContain('href: "/admin/announcements"');
    expect(source.experience).toContain('activeTab === "announcements"');
  });

  it("preserves the PR 5 migration boundary, dependencies, and environment contract", () => {
    const migrationNames = readdirSync(
      resolve(process.cwd(), "supabase/migrations")
    )
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const badgeIntegrationMigrationNames = new Set([
      "20260821000000_badge_award_foundation.sql",
      "20260821001000_badge_batch_2_authority.sql",
      "20260821002000_badge_progression_championship_authority.sql",
      "20260821003000_badge_streak_clean_upset_authority.sql",
      "20260821004000_badge_season_authority.sql",
      "20260821005000_badge_bracket_progression_authority.sql",
      "20260821006000_match_authority_foundation.sql",
      "20260821007000_badge_reliable_competitor_authority.sql",
      "20260821008000_badge_comeback_commander_authority.sql",
      "20260821009000_tournament_championship_path_authority.sql",
      "20260821010000_badge_flawless_campaign_authority.sql",
      "20260830090000_player_badge_reveals.sql",
      "20260831090000_service_role_badge_e2e_season_read.sql",
      "20260831130000_badge_authority_forward_repairs.sql",
      "20260831131000_badge_reconciliation_targets.sql",
      "20260831132000_match_game_winner_authority.sql",
      "20260831133000_staging_badge_cross_division_acceptance.sql",
      "20260831134000_staging_badge_fixture_eligibility_compatibility.sql",
    ]);
    const postPr5MigrationNames = new Set([
      "20260902100000_unlaunched_event_void_authority.sql",
      "20260902130000_event_based_tournament_scheduling.sql",
      "20260903100000_division_settlement_shadow_foundation.sql",
      "20260903130000_not_held_division_closure.sql",
      "20260903160000_division_accounting_cutover.sql",
    ]);
    const platformMigrationNames = migrationNames.filter(
      (name) =>
        !badgeIntegrationMigrationNames.has(name) &&
        !postPr5MigrationNames.has(name)
    );

    expect(platformMigrationNames).toHaveLength(119);
    expect(platformMigrationNames.at(-3)).toBe(
      "20260826100000_official_announcements.sql"
    );
    expect(platformMigrationNames.at(-2)).toBe(
      "20260827100000_announcement_tournament_link.sql"
    );
    expect(platformMigrationNames.at(-1)).toBe(
      "20260831123000_tournament_media_links.sql"
    );
    expect(migrationTreeSha256(platformMigrationNames.slice(0, -2))).toBe(
      "8a66ada7bd7cae2874b3d4f6919462a1c2f74439850efac5d99aeddb0cf8b7cb"
    );
    expect(migrationNames).toHaveLength(
      platformMigrationNames.length +
        badgeIntegrationMigrationNames.size +
        postPr5MigrationNames.size
    );
    expect(migrationNames.at(-7)).toBe(
      "20260831133000_staging_badge_cross_division_acceptance.sql"
    );
    expect(migrationNames.at(-6)).toBe(
      "20260831134000_staging_badge_fixture_eligibility_compatibility.sql"
    );
    expect(migrationNames.at(-5)).toBe(
      "20260902100000_unlaunched_event_void_authority.sql"
    );
    expect(migrationNames.at(-4)).toBe(
      "20260902130000_event_based_tournament_scheduling.sql"
    );
    expect(migrationNames.at(-3)).toBe(
      "20260903100000_division_settlement_shadow_foundation.sql"
    );
    expect(migrationNames.at(-2)).toBe(
      "20260903130000_not_held_division_closure.sql"
    );
    expect(migrationNames.at(-1)).toBe(
      "20260903160000_division_accounting_cutover.sql"
    );
    expect(
      normalizedSha256(
        read(
          "supabase/migrations/20260902100000_unlaunched_event_void_authority.sql"
        )
      )
    ).toBe(
      "8e97337efc36276797b3e98ff45bbdbd893533b0ffa13486e0f4bac83e911fd6"
    );
    expect(normalizedSha256(read("package.json"))).toBe(
      "0fa600694cee0d7bfbcb2ddd545ed8f46b0c33ea79d4e9953b39c0b3e7ae5db9"
    );
    expect(normalizedSha256(read("package-lock.json"))).toBe(
      "520e696974594503ed6f61f05f5937dd64f75fc9255d56f16bf9c9b57ff238a0"
    );
    expect(normalizedSha256(read(".env.example"))).toBe(
      "a36a452c337407aa53c29a8499cb1658023caed00bd41b605859d07ce166dbd4"
    );

    expect(
      [
        source.workspace,
        source.workspaceData,
        source.registrationWorkspace,
        source.matchWorkspace,
      ].join("\n")
    ).not.toContain("process.env.");
  });

  it("keeps phone-safe width, touch, drawer, and overflow source contracts", () => {
    for (const key of ["list", "newRoute", "workspace"] as const) {
      expect(source[key], key).toContain("min-w-0 overflow-x-hidden");
    }

    expect(source.menu).toContain("h-11 w-11");
    expect(source.menu).toContain("min-h-11");
    expect(source.menu).toContain("w-[min(22rem,100vw)]");
    expect(source.menu).toContain("h-[100dvh]");
    for (const inset of ["top", "right", "bottom", "left"]) {
      expect(source.menu).toContain(`safe-area-inset-${inset}`);
    }
    expect(source.workspaceHeader).toContain("break-words");
    expect(source.registrations).toContain("overflow-x-auto");
    expect(source.bracketPopulation).toContain("h-dvh w-screen");
    expect(source.matches).toContain("min-w-0");
    expect(source.mapPool).toContain("min-w-0");
    expect(source.media).toContain("min-w-0");
    expect(source.media).toContain("min-h-11");
  });
});
