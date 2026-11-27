import Link from "next/link";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import { casterAdminApplicationPage } from "../admin-application-contracts";
import { casterAdminFrame, casterAdminInput, casterAdminPanel, casterAdminSecondary } from "../admin-application-styles";
import CasterAdminNavigation from "../CasterAdminNavigation";
import AssignmentList from "./AssignmentList";
import { CASTER_COVERAGE_ADMIN_PATH, coverageWorkspaceHref } from "./contracts";
import { currentCastingAdmin, loadCastingAssignments, loadCastingChoices, loadCastingTournaments } from "./data";

type WorkspaceProps = {
  tournament?: string;
  page?: string | string[];
  tournamentQuery?: string | string[];
  tournamentPage?: string | string[];
};

export default async function CoverageWorkspace({ tournament, page, tournamentQuery, tournamentPage }: WorkspaceProps) {
  const actor = await currentCastingAdmin();
  if (!actor) return <AdminAccessRequired />;
  const assignmentPage = casterAdminApplicationPage(page);
  const eventPage = casterAdminApplicationPage(tournamentPage);
  const query = typeof tournamentQuery === "string" && tournamentQuery.length <= 100 && !/[\u0000-\u001f\u007f]/.test(tournamentQuery)
    ? tournamentQuery.trim() : "";
  const [assignments, choices, events] = await Promise.all([
    loadCastingAssignments(actor, tournament ?? null, assignmentPage),
    tournament ? loadCastingChoices(tournament) : null,
    tournament ? null : loadCastingTournaments(query, eventPage),
  ]);
  if (!(await currentCastingAdmin())) return <AdminAccessRequired />;

  function globalHref(nextAssignments: number, nextTournaments: number) {
    const params = new URLSearchParams();
    if (nextAssignments > 1) params.set("page", String(nextAssignments));
    if (query) params.set("tournamentQuery", query);
    if (nextTournaments > 1) params.set("tournamentPage", String(nextTournaments));
    return `${CASTER_COVERAGE_ADMIN_PATH}${params.size ? `?${params}` : ""}`;
  }

  const assignmentHref = (next: number) => tournament ? coverageWorkspaceHref(tournament, next) : globalHref(next, eventPage);

  const workspace = (
    <div className="grid min-w-0 gap-5">
      {tournament ? (
        <div><Link href={CASTER_COVERAGE_ADMIN_PATH} prefetch={false} className={casterAdminSecondary}>All archived coverage</Link></div>
      ) : (
        <section className={`${casterAdminPanel} space-y-4`} aria-labelledby="casting-tournaments-title">
          <h2 id="casting-tournaments-title" className="text-lg font-black">Choose a tournament</h2>
          <p className="text-sm text-zinc-400">Review legacy coverage and correct verified records. Manage self-published videos in Tournament videos.</p>
          <form action={CASTER_COVERAGE_ADMIN_PATH} className="flex flex-wrap items-end gap-2">
            {assignmentPage > 1 && <input type="hidden" name="page" value={assignmentPage} />}
            <label className="min-w-48 flex-1 space-y-1 text-sm font-bold">
              <span>Tournament title</span>
              <input name="tournamentQuery" type="search" defaultValue={query} maxLength={100} className={casterAdminInput} />
            </label>
            <button className={casterAdminSecondary}>Search tournaments</button>
          </form>
          {!events ? <p role="alert" className="text-sm text-orange-200">The tournament list could not be loaded.</p> : !events.tournaments.length ? (
            <p className="text-sm text-zinc-300">No tournaments found on this page.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {events.tournaments.map(({ id, label }) => (
                <li key={id}><Link className={`${casterAdminSecondary} w-full justify-start break-words`} prefetch={false} href={coverageWorkspaceHref(id)}>{label}</Link></li>
              ))}
            </ul>
          )}
          <CoveragePagination page={eventPage} hasMore={events?.hasMore} label="Tournament search pages" href={(next) => globalHref(assignmentPage, next)} />
        </section>
      )}
      {assignments ? (
        <>
          <AssignmentList assignments={assignments.assignments} choices={choices} scoped={Boolean(tournament)} />
          <CoveragePagination page={assignmentPage} hasMore={assignments.hasMore} label="Archived coverage pages" href={assignmentHref} />
        </>
      ) : <p role="alert" className={`${casterAdminPanel} text-orange-200`}>Archived coverage could not be loaded. Try again.</p>}
    </div>
  );
  if (tournament) return workspace;
  return (
    <main className={casterAdminFrame}>
      <h1 className="text-3xl font-black sm:text-4xl">Caster coverage archive</h1>
      <CasterAdminNavigation current="coverage" />
      {workspace}
    </main>
  );
}

function CoveragePagination({ page, hasMore, label, href }: {
  page: number;
  hasMore?: boolean;
  label: string;
  href: (page: number) => string;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-3">
      {page > 1 && <Link className={casterAdminSecondary} href={href(page - 1)} prefetch={false}>Previous page</Link>}
      <span className="text-sm text-zinc-300">Page {page}</span>
      {hasMore && <Link className={casterAdminSecondary} href={href(page + 1)} prefetch={false}>Next page</Link>}
    </nav>
  );
}
