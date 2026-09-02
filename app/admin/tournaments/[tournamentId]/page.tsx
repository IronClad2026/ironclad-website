import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { loadAdminTournamentMediaWorkspace } from "@/app/admin/tournaments/media-actions";
import AdminBracketManagement from "@/components/AdminBracketManagement";
import AdminTournamentMapPools from "@/components/AdminTournamentMapPools";
import TournamentFormDraft from "@/components/TournamentFormDraft";
import AdminTournamentMatches from "@/components/admin/tournaments/AdminTournamentMatches";
import AdminTournamentMedia from "@/components/admin/tournaments/AdminTournamentMedia";
import AdminTournamentReplayArchive from "@/components/admin/tournaments/AdminTournamentReplayArchive";
import AdminTournamentRegistrations from "@/components/admin/tournaments/AdminTournamentRegistrations";
import TournamentBracketStructureControls from "@/components/admin/tournaments/TournamentBracketStructureControls";
import TournamentControls from "@/components/admin/tournaments/TournamentControls";
import TournamentEditor, {
  toTournamentFormValues,
  type TournamentEditorNotice,
} from "@/components/admin/tournaments/TournamentEditor";
import type { TournamentManagementSection } from "@/components/admin/tournaments/TournamentManagementMenu";
import TournamentOverview from "@/components/admin/tournaments/TournamentOverview";
import TournamentWorkspaceHeader from "@/components/admin/tournaments/TournamentWorkspaceHeader";
import { loadAdminTournamentMatchWorkspace } from "@/lib/admin-tournament-match-workspace";
import { loadAdminTournamentReplayArchive } from "@/lib/admin-replay-archive";
import { loadAdminTournamentRegistrationWorkspace } from "@/lib/admin-tournament-registration-workspace";
import {
  isAdminTournamentWorkspaceTerminal,
  loadAdminTournamentBracketWorkspaceData,
  loadAdminTournamentDeletionPreview,
  loadAdminTournamentEditorWorkspaceData,
  loadAdminTournamentMapPoolWorkspaceData,
  loadAdminTournamentWorkspace,
  type AdminTournamentWorkspaceSummary,
  type AdminTournamentWorkspaceRow,
} from "@/lib/admin-tournament-workspace";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type TournamentWorkspacePageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
  searchParams?: Promise<{
    bracketNotice?: string;
    detail?: string;
    error?: string;
    filter?: string;
    focus?: string;
    notice?: string;
    section?: string;
    selected?: string;
  }>;
};

const VALID_SECTIONS = new Set<TournamentManagementSection>([
  "overview",
  "edit",
  "registrations",
  "players-waitlist",
  "bracket",
  "matches",
  "replays",
  "media",
  "map-pool",
  "controls",
]);

export default async function TournamentWorkspacePage({
  params,
  searchParams,
}: TournamentWorkspacePageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const [{ tournamentId }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(tournamentId)) {
    notFound();
  }

  const workspace = await loadAdminTournamentWorkspace(tournamentId);
  if (!workspace) {
    notFound();
  }

  const section = getSection(query?.section);
  const content = await renderWorkspaceSection({
    query,
    section,
    summary: workspace.summary,
    tournament: workspace.tournament,
  });

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-24 pb-20 text-white sm:px-6 sm:pt-28">
      <section className="mx-auto max-w-7xl">
        <TournamentWorkspaceHeader
          activeSection={section}
          summary={workspace.summary}
          tournament={workspace.tournament}
        />
        {section === "overview" && query?.notice === "saved" && (
          <TournamentFormDraft formId="" enabled={false} clear />
        )}
        <WorkspaceNotice notice={query?.notice} section={section} />
        <div
          id={`tournament-management-section-${section}`}
          className="mt-5 min-w-0"
        >
          {content}
        </div>
      </section>
    </main>
  );
}

function WorkspaceNotice({
  notice,
  section,
}: {
  notice?: string;
  section: TournamentManagementSection;
}) {
  const message =
    notice === "saved" && section === "overview"
      ? "Tournament saved. Existing bracket assignments were left unchanged."
      : notice === "map-pool-published" && section === "map-pool"
        ? "Division Map Pool published. Unlaunched pools may be republished until launch."
        : notice === "map-pool-corrected" && section === "map-pool"
          ? "The launched Division Map Pool was corrected and the change was audited."
          : notice === "map-pool-invalid" && section === "map-pool"
            ? "Select at least five distinct maps and provide all required Map Pool details."
            : notice === "map-pool-failed" && section === "map-pool"
              ? "The Map Pool change was rejected. Check map eligibility, Division state, and Tournament status."
              : null;

  if (!message) return null;
  const success =
    notice === "saved" ||
    notice === "map-pool-published" ||
    notice === "map-pool-corrected";

  return (
    <div
      role={success ? "status" : "alert"}
      className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${
        success
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-500/30 bg-red-500/10 text-red-200"
      }`}
    >
      {message}
    </div>
  );
}

async function renderWorkspaceSection({
  query,
  section,
  summary,
  tournament,
}: {
  query:
    | {
        bracketNotice?: string;
        detail?: string;
        error?: string;
        filter?: string;
        focus?: string;
        notice?: string;
        selected?: string;
      }
    | undefined;
  section: TournamentManagementSection;
  summary: AdminTournamentWorkspaceSummary;
  tournament: AdminTournamentWorkspaceRow;
}): Promise<ReactNode> {
  if (section === "overview") {
    return <TournamentOverview summary={summary} tournament={tournament} />;
  }

  if (section === "edit") {
    const editor = await loadAdminTournamentEditorWorkspaceData(
      tournament,
      summary.divisionStates
    );
    const terminal = isAdminTournamentWorkspaceTerminal(tournament);
    return (
      <TournamentEditor
        key={`${tournament.id}:${tournament.updated_at}`}
        values={toTournamentFormValues(tournament)}
        notice={getEditorNotice(query?.notice)}
        generatedByBracket={editor.generatedByBracket}
        approvedByBracket={editor.approvedByBracket}
        readinessByBracket={editor.readinessByBracket}
        isEditing={!terminal}
        errorMessage={query?.error}
        terminal={
          isAdminTournamentWorkspaceTerminal(tournament)
            ? {
                status:
                  tournament.status === "cancelled" ? "cancelled" : "voided",
                at: tournament.terminal_at,
                reason: tournament.terminal_reason,
              }
            : null
        }
        underReview={editor.underReview}
        showBracketGeneration={false}
        showRecoveryControls={false}
      />
    );
  }

  if (section === "registrations" || section === "players-waitlist") {
    const data = await loadAdminTournamentRegistrationWorkspace(
      tournament,
      summary.divisionStates,
      {
        filter: query?.filter,
        section,
        selectedRegistrationId: query?.selected,
      }
    );
    return (
      <AdminTournamentRegistrations
        key={`${tournament.id}:${section}`}
        data={data}
        detail={query?.detail}
        focus={getRegistrationFocus(query?.focus)}
        notice={query?.notice}
        section={section}
        tournament={tournament}
      />
    );
  }

  if (section === "bracket") {
    const [bracket, editor] = await Promise.all([
      loadAdminTournamentBracketWorkspaceData(
        tournament,
        summary.divisionStates
      ),
      loadAdminTournamentEditorWorkspaceData(
        tournament,
        summary.divisionStates
      ),
    ]);
    const values = toTournamentFormValues(tournament);
    return (
      <div className="grid min-w-0 gap-5">
        <TournamentBracketStructureControls
          divisionStates={summary.divisionStates}
          generatedByBracket={editor.generatedByBracket}
          notice={query?.notice}
          readOnly={isAdminTournamentWorkspaceTerminal(tournament)}
          values={values}
        />
        <AdminBracketManagement
          key={tournament.id}
          tournaments={[bracket.tournament]}
          notice={getBracketNotice(query?.bracketNotice)}
          loadError={bracket.loadError}
          fixedTournamentId={tournament.id}
        />
      </div>
    );
  }

  if (section === "matches") {
    const matchWorkspace = await loadAdminTournamentMatchWorkspace(
      tournament.id
    );
    return matchWorkspace.ok ? (
      <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
        <AdminTournamentMatches
          key={tournament.id}
          tournament={matchWorkspace.tournament}
          viewer={matchWorkspace.viewer}
          submissions={matchWorkspace.submissions}
          reportGroups={matchWorkspace.reportGroups}
        />
      </div>
    ) : (
      <AdminTournamentMatches
        key={tournament.id}
        tournament={null}
        viewer={null}
        loadError={matchWorkspace.reason === "load-failed"}
      />
    );
  }

  if (section === "replays") {
    const replayWorkspace = await loadAdminTournamentReplayArchive(
      tournament.id
    );
    return replayWorkspace.ok ? (
      <AdminTournamentReplayArchive
        key={tournament.id}
        archive={replayWorkspace.archive}
      />
    ) : (
      <AdminTournamentReplayArchive
        key={tournament.id}
        archive={null}
        loadError={replayWorkspace.reason === "load-failed"}
      />
    );
  }

  if (section === "media") {
    const mediaWorkspace = await loadAdminTournamentMediaWorkspace(
      tournament.id
    );
    return (
      <AdminTournamentMedia
        key={tournament.id}
        tournamentId={tournament.id}
        tournamentTitle={tournament.title}
        items={mediaWorkspace?.items ?? []}
        matchOptions={mediaWorkspace?.matchOptions ?? []}
        loadFailed={!mediaWorkspace}
      />
    );
  }

  if (section === "map-pool") {
    const mapPool = await loadAdminTournamentMapPoolWorkspaceData(tournament);
    const brackets = tournament.tournament_brackets ?? [];
    const divisionStateByBracket = new Map(
      summary.divisionStates.flatMap((division) =>
        division.bracketId
          ? [[division.bracketId, division] as const]
          : []
      )
    );
    return brackets.length > 0 ? (
      <AdminTournamentMapPools
        key={tournament.id}
        tournamentId={tournament.id}
        tournamentTitle={tournament.title}
        terminal={
          isAdminTournamentWorkspaceTerminal(tournament) ||
          tournament.status === "completed"
        }
        brackets={brackets.map((bracket) => ({
          id: bracket.id,
          name: bracket.name,
          launchedAt: bracket.launched_at,
          notHeldAt:
            divisionStateByBracket.get(bracket.id)?.notHeldAt ?? null,
          mapPoolPublishedAt: bracket.map_pool_published_at,
          currentMapIds:
            mapPool.currentMapIdsByBracket.get(bracket.id) ?? [],
        }))}
        catalogue={mapPool.catalogue}
      />
    ) : (
      <WorkspaceEmptyState message="This Tournament has no configured Divisions for a Map Pool." />
    );
  }

  const [editor, deletionPreview] = await Promise.all([
    loadAdminTournamentEditorWorkspaceData(tournament, summary.divisionStates),
    loadAdminTournamentDeletionPreview(tournament.id),
  ]);
  return (
    <>
      <ControlNotice notice={query?.notice} />
      <TournamentControls
        deletionPreview={deletionPreview}
        tournament={tournament}
        underReview={editor.underReview}
      />
    </>
  );
}

function ControlNotice({ notice }: { notice?: string }) {
  const message =
    notice === "delete-invalid"
      ? "Tournament deletion was not confirmed. Type DELETE exactly."
      : notice === "delete-protected"
        ? "This tournament has launched or contains competitive history and can no longer be permanently deleted. Use the tournament recovery workflow instead."
        : notice === "delete-failed"
          ? "Tournament deletion failed. No database changes were committed."
          : null;

  return message ? (
    <div
      role="alert"
      className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200"
    >
      {message}
    </div>
  ) : null;
}

function WorkspaceEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

function getSection(value?: string): TournamentManagementSection {
  return VALID_SECTIONS.has(value as TournamentManagementSection)
    ? (value as TournamentManagementSection)
    : "overview";
}

function getEditorNotice(value?: string): TournamentEditorNotice | undefined {
  const valid: TournamentEditorNotice[] = [
    "invalid",
    "saved",
    "save-failed",
    "bracket-generated",
    "generation-pending",
    "generation-failed",
    "generation-blocked",
    "deleted",
    "delete-invalid",
    "delete-protected",
    "delete-failed",
    "delete-storage-failed",
    "cleanup-completed",
    "cleanup-failed",
    "map-pool-published",
    "map-pool-corrected",
    "map-pool-invalid",
    "map-pool-failed",
  ];
  return valid.includes(value as TournamentEditorNotice)
    ? (value as TournamentEditorNotice)
    : undefined;
}

function getBracketNotice(value?: string) {
  const valid = [
    "population-saved",
    "population-failed",
    "division-launched",
    "division-already-launched",
    "division-launch-failed",
    "division-not-held",
    "division-already-not-held",
    "division-not-held-invalid",
    "division-not-held-failed",
  ] as const;
  return valid.find((notice) => notice === value);
}

function getRegistrationFocus(value?: string) {
  return value === "note" || value === "reject" || value === "manual_review"
    ? value
    : undefined;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
