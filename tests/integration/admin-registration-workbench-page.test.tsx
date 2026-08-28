import {
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminRegistrationReviewRows from "@/components/AdminRegistrationReviewRows";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import AdminRegistrationsPage from "@/app/admin/registrations/page";

const ids = {
  upcoming: "10000000-0000-4000-8000-000000000001",
  open: "10000000-0000-4000-8000-000000000002",
  progress: "10000000-0000-4000-8000-000000000003",
  completed: "10000000-0000-4000-8000-000000000004",
  cancelled: "10000000-0000-4000-8000-000000000005",
  voided: "10000000-0000-4000-8000-000000000006",
  empty: "10000000-0000-4000-8000-000000000007",
  missing: "10000000-0000-4000-8000-000000000008",
} as const;

const bracketIds = {
  upcoming: "20000000-0000-4000-8000-000000000001",
  open: "20000000-0000-4000-8000-000000000002",
  progress: "20000000-0000-4000-8000-000000000003",
  completed: "20000000-0000-4000-8000-000000000004",
  cancelled: "20000000-0000-4000-8000-000000000005",
  voided: "20000000-0000-4000-8000-000000000006",
  empty: "20000000-0000-4000-8000-000000000007",
} as const;

const registrationIds = {
  upcoming: "30000000-0000-4000-8000-000000000001",
  openApproved: "30000000-0000-4000-8000-000000000002",
  openWaitOne: "30000000-0000-4000-8000-000000000003",
  openWaitTwo: "30000000-0000-4000-8000-000000000004",
  progress: "30000000-0000-4000-8000-000000000005",
  completed: "30000000-0000-4000-8000-000000000006",
  cancelled: "30000000-0000-4000-8000-000000000007",
  voided: "30000000-0000-4000-8000-000000000008",
  missing: "30000000-0000-4000-8000-000000000009",
  unassigned: "30000000-0000-4000-8000-000000000010",
} as const;

type RegistrationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

type TournamentStatus =
  | "upcoming"
  | "registration_open"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "voided";

function tournament(
  key: keyof typeof bracketIds,
  status: TournamentStatus,
  createdAt: string,
  options: { launchedAt?: string | null; title?: string } = {}
) {
  return {
    id: ids[key],
    title: options.title ?? `${formatKey(key)} Tournament`,
    status,
    grand_final_at: null,
    created_at: createdAt,
    tournament_brackets: [
      {
        id: bracketIds[key],
        name:
          key === "open"
            ? "Challenge"
            : key === "progress"
              ? "Main"
              : "Academy",
        launched_at: options.launchedAt ?? null,
      },
    ],
  };
}

function registration({
  id,
  status,
  tournamentId,
  bracketId,
  playerName,
  createdAt,
  tournamentTitle,
}: {
  id: string;
  status: RegistrationStatus;
  tournamentId: string | null;
  bracketId: string | null;
  playerName: string;
  createdAt: string;
  tournamentTitle?: string | null;
}) {
  return {
    id,
    player_name: playerName,
    country: "AU",
    submitted_elo: 1_300,
    elo_verified_elo: 1_325,
    elo_highest_faction: "Wehrmacht",
    elo_checked_at: "2026-08-28T00:00:00.000Z",
    elo_verification_source: "relic",
    elo_verified_division: "Challenge",
    elo_calculation_version: "rules-v3",
    registration_status: status,
    admin_notes: "Private evidence",
    created_at: createdAt,
    tournament_id: tournamentId,
    tournament_bracket_id: bracketId,
    tournament_title: tournamentTitle ?? null,
    bracket_name: bracketId ? "Challenge" : null,
    waitlist_offer_status: null,
  };
}

const tournaments = [
  tournament("upcoming", "upcoming", "2026-08-30T00:00:00.000Z"),
  tournament("open", "registration_open", "2026-08-29T00:00:00.000Z"),
  tournament("progress", "in_progress", "2026-08-28T00:00:00.000Z", {
    launchedAt: "2026-08-28T01:00:00.000Z",
  }),
  tournament("completed", "completed", "2026-08-27T00:00:00.000Z"),
  tournament("cancelled", "cancelled", "2026-08-26T00:00:00.000Z"),
  tournament("voided", "voided", "2026-08-25T00:00:00.000Z"),
  tournament("empty", "registration_open", "2026-08-24T00:00:00.000Z"),
];

const registrations = [
  registration({
    id: registrationIds.upcoming,
    status: "pending",
    tournamentId: ids.upcoming,
    bracketId: bracketIds.upcoming,
    playerName: "Upcoming Pending",
    createdAt: "2026-08-28T00:00:01.000Z",
  }),
  registration({
    id: registrationIds.openApproved,
    status: "approved",
    tournamentId: ids.open,
    bracketId: bracketIds.open,
    playerName: "Open Approved",
    createdAt: "2026-08-28T00:00:02.000Z",
  }),
  registration({
    id: registrationIds.openWaitOne,
    status: "waitlisted",
    tournamentId: ids.open,
    bracketId: bracketIds.open,
    playerName: "Open Wait One",
    createdAt: "2026-08-28T00:00:03.000Z",
  }),
  registration({
    id: registrationIds.openWaitTwo,
    status: "waitlisted",
    tournamentId: ids.open,
    bracketId: bracketIds.open,
    playerName: "Open Wait Two",
    createdAt: "2026-08-28T00:00:04.000Z",
  }),
  registration({
    id: registrationIds.progress,
    status: "manual_review",
    tournamentId: ids.progress,
    bracketId: bracketIds.progress,
    playerName: "Progress Manual",
    createdAt: "2026-08-28T00:00:05.000Z",
  }),
  registration({
    id: registrationIds.completed,
    status: "approved",
    tournamentId: ids.completed,
    bracketId: bracketIds.completed,
    playerName: "Completed Approved",
    createdAt: "2026-08-28T00:00:06.000Z",
  }),
  registration({
    id: registrationIds.cancelled,
    status: "rejected",
    tournamentId: ids.cancelled,
    bracketId: bracketIds.cancelled,
    playerName: "Cancelled Rejected",
    createdAt: "2026-08-28T00:00:07.000Z",
  }),
  registration({
    id: registrationIds.voided,
    status: "withdrawn",
    tournamentId: ids.voided,
    bracketId: bracketIds.voided,
    playerName: "Voided Withdrawn",
    createdAt: "2026-08-28T00:00:08.000Z",
  }),
  registration({
    id: registrationIds.missing,
    status: "pending",
    tournamentId: ids.missing,
    bracketId: null,
    playerName: "Missing Metadata",
    tournamentTitle: "Orphaned Cup",
    createdAt: "2026-08-28T00:00:09.000Z",
  }),
  registration({
    id: registrationIds.unassigned,
    status: "manual_review",
    tournamentId: null,
    bracketId: null,
    playerName: "Unassigned Player",
    createdAt: "2026-08-28T00:00:10.000Z",
  }),
];

describe("Admin Registration Workbench presentation", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    createSupabaseAdminClientMock.mockReset();
  });

  it.each([
    ["signed-out", anonymousIdentity],
    ["non-Admin", playerIdentity],
  ])("denies a %s identity before loading private registration data", async (_, identity) => {
    authMock.mockResolvedValue(identity);

    await expect(
      AdminRegistrationsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT:/");

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("classifies all current and archived Tournament statuses and suppresses empty groups", async () => {
    const tree = await loadPage({ filter: "all" });
    const active = findByData(tree, "data-registration-workbench-section", "active");
    const archive = findByData(tree, "data-registration-workbench-section", "archive");

    expect(groupKeys(active)).toEqual(
      expect.arrayContaining([ids.upcoming, ids.open, ids.progress])
    );
    expect(groupKeys(active)).toHaveLength(3);
    expect(groupKeys(archive)).toEqual(
      expect.arrayContaining([ids.completed, ids.cancelled, ids.voided])
    );
    expect(groupKeys(archive)).toHaveLength(3);
    expect(findGroup(tree, ids.empty)).toBeNull();

    const openActiveGroups = findAllByData(
      active,
      "data-registration-tournament-group"
    ).filter((group) => group.props.open === true);
    expect(openActiveGroups).toHaveLength(1);
    expect(archive.props.open).toBe(false);
  });

  it("shows only status-matching Tournament and exception groups", async () => {
    const tree = await loadPage({ filter: "pending" });
    const active = findByData(tree, "data-registration-workbench-section", "active");
    const exceptions = findByData(
      tree,
      "data-registration-workbench-section",
      "exceptions"
    );

    expect(groupKeys(active)).toEqual([ids.upcoming]);
    expect(groupKeys(exceptions)).toEqual([ids.missing]);
    expect(findByDataOrNull(tree, "data-registration-workbench-section", "archive"))
      .toBeNull();
    expect(findGroup(tree, ids.open)).toBeNull();
    expect(findGroup(tree, "unassigned")).toBeNull();
    expect(textContent(findGroup(tree, ids.upcoming))).toContain(
      "1 matching · 1 total"
    );
  });

  it("opens Archive when a status filter has only archived matches", async () => {
    const tree = await loadPage({ filter: "rejected" });
    const archive = findByData(
      tree,
      "data-registration-workbench-section",
      "archive"
    );
    const cancelled = findGroup(archive, ids.cancelled);

    expect(archive.props.open).toBe(true);
    expect(groupKeys(archive)).toEqual([ids.cancelled]);
    expect(cancelled?.props.open).toBe(true);
    expect(findByDataOrNull(tree, "data-registration-workbench-section", "active"))
      .toBeNull();
  });

  it("opens only the selected active Tournament when it is not first", async () => {
    const tree = await loadPage({
      filter: "all",
      selected: registrationIds.progress,
    });
    const active = findByData(
      tree,
      "data-registration-workbench-section",
      "active"
    );
    const openGroups = findAllByData(
      active,
      "data-registration-tournament-group"
    ).filter((group) => group.props.open === true);

    expect(groupKeys(active)[0]).not.toBe(ids.progress);
    expect(openGroups).toHaveLength(1);
    expect(openGroups[0].props["data-registration-tournament-group"]).toBe(
      ids.progress
    );
  });

  it("opens Archive and the selected archived Tournament for a deep link", async () => {
    const tree = await loadPage({
      filter: "withdrawn",
      selected: registrationIds.voided,
    });
    const archive = findByData(tree, "data-registration-workbench-section", "archive");
    const voided = findGroup(tree, ids.voided);

    expect(archive.props.open).toBe(true);
    expect(voided?.props.open).toBe(true);
    expect(textContent(tree)).toContain("Registration Details");
    expect(textContent(tree)).toContain("Voided Withdrawn");

    const rows = findElementsByType(voided, AdminRegistrationReviewRows);
    expect(rows).toHaveLength(1);
    expect(rows[0].props).toMatchObject({
      activeFilter: "withdrawn",
      formId: "registration-bulk-form",
      selectionScope: ids.voided,
      isTournamentTerminal: true,
      returnHref: "/admin/registrations",
      desktopPresentation: "tournament-workbench",
    });
  });

  it("maps readiness and Division FIFO summaries to the correct Tournament", async () => {
    const tree = await loadPage({ filter: "all" });
    const open = findGroup(tree, ids.open);
    const progress = findGroup(tree, ids.progress);
    const openReadiness = findByData(
      open,
      "data-registration-readiness-summary",
      ids.open
    );
    const progressReadiness = findByData(
      progress,
      "data-registration-readiness-summary",
      ids.progress
    );
    const openFifo = findByData(
      open,
      "data-registration-fifo-summary",
      ids.open
    );

    expect(textContent(openReadiness)).toContain(
      "Challenge Bracket 1/8 approved · 1 active · 2 waiting"
    );
    expect(textContent(openReadiness)).not.toContain("LAUNCHED / LOCKED");
    expect(textContent(progressReadiness)).toContain(
      "Main / Pro Bracket 8/8 approved · 1 active · 0 waiting · LAUNCHED / LOCKED"
    );
    expect(textContent(openFifo)).toContain("FIFO Waitlist · 2 waiting");
    expect(textContent(openFifo)).toMatch(
      /Challenge Bracket · 2 waiting · Oldest:\s+Open Wait One · Position #\s+1/
    );
    expect(
      findByDataOrNull(progress, "data-registration-fifo-summary", ids.progress)
    ).toBeNull();
  });

  it("preserves metadata and unassigned exceptions with scoped bulk review", async () => {
    const tree = await loadPage({ filter: "all" });
    const exceptions = findByData(
      tree,
      "data-registration-workbench-section",
      "exceptions"
    );
    const missing = findGroup(exceptions, ids.missing);
    const unassigned = findGroup(exceptions, "unassigned");

    expect(textContent(missing)).toContain("Orphaned Cup (metadata unavailable)");
    expect(textContent(unassigned)).toContain("Unassigned registrations");

    for (const [group, scope, player] of [
      [missing, ids.missing, "Missing Metadata"],
      [unassigned, "unassigned", "Unassigned Player"],
    ] as const) {
      const rows = findElementsByType(group, AdminRegistrationReviewRows);
      const selectors = findElementsByType(group, AdminRegistrationSelectAll);

      expect(rows).toHaveLength(1);
      expect(rows[0].props.selectionScope).toBe(scope);
      expect(rows[0].props.formId).toBe("registration-bulk-form");
      expect(rows[0].props.desktopPresentation).toBe("tournament-workbench");
      expect((rows[0].props.registrations as { playerDisplayName: string }[])[0])
        .toMatchObject({ playerDisplayName: player });
      expect(selectors).toHaveLength(1);
      expect(selectors[0].props).toMatchObject({
        formId: "registration-bulk-form",
        name: "registrationId",
        scope,
        showLabel: true,
      });
    }
  });
});

async function loadPage(searchParams: {
  filter?: RegistrationStatus | "all";
  selected?: string;
}) {
  authMock.mockResolvedValue(adminIdentity);

  const registrationOrder = vi.fn().mockResolvedValue({
    data: registrations,
    error: null,
  });
  const registrationSelect = vi.fn(() => ({ order: registrationOrder }));
  const tournamentOrder = vi.fn().mockResolvedValue({
    data: tournaments,
    error: null,
  });
  const tournamentSelect = vi.fn(() => ({ order: tournamentOrder }));
  const from = vi.fn((table: string) => {
    if (table === "registrations") {
      return { select: registrationSelect };
    }
    if (table === "tournaments") {
      return { select: tournamentSelect };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  const rpc = vi.fn(
    (
      name: string,
      { p_tournament_bracket_id: bracketId }: { p_tournament_bracket_id: string }
    ) => {
      expect(name).toBe("get_tournament_bracket_readiness");
      const launchedAt =
        bracketId === bracketIds.progress
          ? "2026-08-28T01:00:00.000Z"
          : null;
      const approvedCount =
        bracketId === bracketIds.progress
          ? 8
          : bracketId === bracketIds.open
            ? 1
            : bracketId === bracketIds.completed
              ? 1
              : 0;

      return Promise.resolve({
        data: [
          {
            approved_count: approvedCount,
            required_count: 8,
            is_ready: approvedCount === 8,
            launched_at: launchedAt,
          },
        ],
        error: null,
      });
    }
  );

  createSupabaseAdminClientMock.mockReturnValue({ from, rpc });

  return AdminRegistrationsPage({
    searchParams: Promise.resolve(searchParams),
  });
}

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function walkElements(
  node: ReactNode,
  visit: (element: ReactElement<ElementProps>) => void
) {
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit);
    return;
  }
  if (!isValidElement(node)) return;

  const element = node as ReactElement<ElementProps>;
  if (
    typeof element.type === "function" &&
    element.type.name === "RegistrationWorkbenchGroup"
  ) {
    const renderGroup = element.type as (
      props: ElementProps
    ) => ReactNode;
    walkElements(renderGroup(element.props), visit);
    return;
  }

  visit(element);
  walkElements(element.props.children, visit);
}

function findAllByData(
  node: ReactNode,
  name: string,
  value?: string
) {
  const matches: ReactElement<ElementProps>[] = [];
  walkElements(node, (element) => {
    const current = element.props[name];
    if (current !== undefined && (value === undefined || current === value)) {
      matches.push(element);
    }
  });
  return matches;
}

function findByData(node: ReactNode, name: string, value: string) {
  const match = findByDataOrNull(node, name, value);
  expect(match).not.toBeNull();
  return match as ReactElement<ElementProps>;
}

function findByDataOrNull(node: ReactNode, name: string, value: string) {
  return findAllByData(node, name, value)[0] ?? null;
}

function findGroup(node: ReactNode, key: string) {
  return findByDataOrNull(node, "data-registration-tournament-group", key);
}

function groupKeys(node: ReactNode) {
  return findAllByData(node, "data-registration-tournament-group").map(
    (group) => group.props["data-registration-tournament-group"]
  );
}

function findElementsByType(node: ReactNode, type: ElementType) {
  const matches: ReactElement<ElementProps>[] = [];
  walkElements(node, (element) => {
    if (element.type === type) matches.push(element);
  });
  return matches;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }
  if (!isValidElement(node)) return "";

  const element = node as ReactElement<ElementProps>;
  if (
    typeof element.type === "function" &&
    element.type.name === "RegistrationWorkbenchGroup"
  ) {
    const renderGroup = element.type as (
      props: ElementProps
    ) => ReactNode;
    return textContent(renderGroup(element.props));
  }
  return textContent(element.props.children);
}

function formatKey(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
