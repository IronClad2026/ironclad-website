import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import englishBadgesDictionary from "@/lib/i18n/dictionaries/en/badges";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const dashboardBadgeCollectionMock = vi.hoisted(() => vi.fn(() => null));
const getRequestLocaleMock = vi.hoisted(() => vi.fn());
const loadDictionaryMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/app/dashboard/badge-reveal-actions", () => ({
  acknowledgeBadgeReveal: vi.fn(),
}));
vi.mock("@/components/badges/DashboardBadgeCollection", () => ({
  default: dashboardBadgeCollectionMock,
}));
vi.mock("@/lib/i18n/loaders", () => ({
  loadDictionary: loadDictionaryMock,
}));
vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: getRequestLocaleMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import DashboardBadgeCollectionPage, {
  generateMetadata,
} from "@/app/dashboard/badges/page";
import DashboardBadgeCollection, {
  type DashboardBadgeCollectionProps,
} from "@/components/badges/DashboardBadgeCollection";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const AWARD_ID = "22222222-2222-4222-8222-222222222222";
const LOCALIZED_LOAD_ERROR =
  "La collezione Badge non puo essere caricata in questo momento.";
const localizedDictionary = {
  ...englishBadgesDictionary,
  metadata: {
    ...englishBadgesDictionary.metadata,
    pageTitle: "Collezione Badge | IronClad",
    pageDescription: "Consulta la tua collezione Badge IronClad.",
  },
  dashboard: {
    ...englishBadgesDictionary.dashboard,
    loadErrorDescription: LOCALIZED_LOAD_ERROR,
  },
};

describe("dashboard Badge collection route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-dashboard-badges" });
    getRequestLocaleMock.mockResolvedValue("it");
    loadDictionaryMock.mockResolvedValue(localizedDictionary);
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
  });

  it("redirects an unauthenticated request before loading player data", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(DashboardBadgeCollectionPage()).rejects.toThrow(
      "redirect:/sign-in"
    );

    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("uses the request locale for metadata and collection copy", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient()
    );

    await expect(generateMetadata()).resolves.toEqual({
      title: "Collezione Badge | IronClad",
      description: "Consulta la tua collezione Badge IronClad.",
    });

    const page = await DashboardBadgeCollectionPage();
    const props = getCollectionProps(page);

    expect(props.locale).toBe("it");
    expect(props.dictionary).toBe(localizedDictionary);
    expect(props.loadError).toBeNull();
    expect(props.revealLoadError).toBeNull();
    expect(props.badgeData?.collection.items).toHaveLength(30);
    expect(props.badgeData?.collection.earnedCount).toBe(1);
    expect(props.pendingReveals).toHaveLength(1);
    expect(props.pendingReveals?.[0].id).toBe(AWARD_ID);
  });

  it("shows 0/30 only for a successful empty read", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient({ awards: [] })
    );

    const props = getCollectionProps(await DashboardBadgeCollectionPage());

    expect(props.badgeData?.collection.earnedCount).toBe(0);
    expect(props.badgeData?.collection.items).toHaveLength(30);
    expect(
      props.badgeData?.collection.items.every((item) => item.state === "locked")
    ).toBe(true);
    expect(props.loadError).toBeNull();
    expect(props.revealLoadError).toBeNull();
  });

  it("does not present a player lookup failure as an empty collection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createDashboardBadgePageClient({
      playerError: { code: "42501" },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

    const props = getCollectionProps(await DashboardBadgeCollectionPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBe(LOCALIZED_LOAD_ERROR);
    expect(props.revealLoadError).toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("does not present an award read failure as 0/30", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient({ awardError: { code: "42P01" } })
    );

    const props = getCollectionProps(await DashboardBadgeCollectionPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBe(LOCALIZED_LOAD_ERROR);
    expect(props.revealLoadError).toBeNull();
  });

  it("fails closed when reveal acknowledgements cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient({ revealError: { code: "42P01" } })
    );

    const props = getCollectionProps(await DashboardBadgeCollectionPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBeNull();
    expect(props.revealLoadError).toBe(LOCALIZED_LOAD_ERROR);
  });
});

function createDashboardBadgePageClient({
  awards = [
    {
      id: AWARD_ID,
      badge_slug: "first-deployment",
      unlocked_at: "2026-08-02T12:00:00.000Z",
      original_unlocked_at: "2026-08-02T12:00:00.000Z",
      source_metadata: {},
    },
  ],
  playerError = null,
  awardError = null,
  revealError = null,
}: {
  awards?: Array<Record<string, unknown>>;
  playerError?: { code: string } | null;
  awardError?: { code: string } | null;
  revealError?: { code: string } | null;
} = {}) {
  const profileQuery = chainQuery();
  profileQuery.maybeSingle.mockResolvedValue({
    data: playerError ? null : { id: PLAYER_ID },
    error: playerError,
  });

  const badgeAwardsQuery = chainQuery();
  badgeAwardsQuery.order.mockResolvedValue({
    data: awardError ? null : awards,
    error: awardError,
  });

  const badgeRevealsQuery = chainQuery();
  badgeRevealsQuery.eq.mockResolvedValue({
    data: revealError ? null : [],
    error: revealError,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "player_badge_awards") return badgeAwardsQuery;
      if (table === "player_badge_reveals") return badgeRevealsQuery;
      throw new Error(`Unexpected Badge page table: ${table}`);
    }),
  };
}

function chainQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

function getCollectionProps(node: ReactNode): DashboardBadgeCollectionProps {
  const element = findElement(node, DashboardBadgeCollection);
  return element.props as unknown as DashboardBadgeCollectionProps;
}

function findElement(
  node: ReactNode,
  type: typeof DashboardBadgeCollection
): ReactElement<Record<string, unknown>> {
  const matches: Array<ReactElement<Record<string, unknown>>> = [];

  function visit(candidate: ReactNode) {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    if (!isValidElement<Record<string, unknown>>(candidate)) return;
    if (candidate.type === type) matches.push(candidate);
    visit(candidate.props.children as ReactNode);
  }

  visit(node);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Badge collection element, found ${matches.length}.`
    );
  }

  return matches[0];
}
