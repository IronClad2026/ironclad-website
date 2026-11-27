"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { searchCasterApplications } from "../application-actions";
import {
  ADMIN_APPLICATION_MAX_PAGE,
  CASTER_APPLICATIONS_ADMIN_PATH,
  applicationStatuses,
  casterAdminDate,
  type CasterAdminApplicationList,
  type CasterAdminApplicationSearch,
} from "../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminSecondary } from "../admin-application-styles";

const initialSearch: CasterAdminApplicationSearch = { kind: "idle" };

export default function ApplicationsQueue({ initialSnapshot }: { initialSnapshot: CasterAdminApplicationList | null }) {
  const [search, action, pending] = useActionState(searchCasterApplications, initialSearch);
  const [filter, setFilter] = useState("submitted");
  const [query, setQuery] = useState("");
  const snapshot = search.kind === "idle" ? initialSnapshot : search.snapshot;
  const page = search.page ?? 1;
  const edited = filter !== (search.filter ?? "submitted") || query.trim() !== (search.query ?? "");
  const hasNext = snapshot?.has_more && page < ADMIN_APPLICATION_MAX_PAGE;

  return (
    <section className={casterAdminPanel} aria-labelledby="application-queue">
      <h2 id="application-queue" className="text-xl font-bold">Application queue</h2>
      <form action={action}>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid grow gap-1 text-sm font-bold sm:max-w-xs">
            Search by display name or account ID
            <input
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              maxLength={100}
              className={casterAdminInput}
            />
          </label>
          <label className="grid grow gap-1 text-sm font-bold sm:max-w-xs">
            Filter by status
            <select name="status" value={filter} onChange={(event) => setFilter(event.target.value)} className={casterAdminInput}>
              <option value="all">All applications</option>
              {Object.entries(applicationStatuses).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit" name="page" value="1" disabled={pending} className={casterAdminSecondary}>
            {pending ? "Searching…" : "Search applications"}
          </button>
        </div>

        {!snapshot ? (
          <p className="mt-5 text-orange-200" role="alert">
            {search.message ?? "Applications are temporarily unavailable. Reload to retry."}
          </p>
        ) : snapshot.applications.length ? (
          <ul className="mt-5 divide-y divide-white/10">
            {snapshot.applications.map((application) => (
              <li key={application.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{application.display_name || "Caster application"}</h3>
                  <p className="mt-1 break-all text-sm text-zinc-400">{application.owner_clerk_user_id}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    <span className="font-bold text-orange-200">{applicationStatuses[application.status]}</span>
                    {application.submitted_at ? ` · Submitted ${casterAdminDate(application.submitted_at)}` : ` · Updated ${casterAdminDate(application.updated_at)}`}
                  </p>
                </div>
                <Link
                  href={`${CASTER_APPLICATIONS_ADMIN_PATH}/${application.id}`}
                  prefetch={false}
                  className={`${casterAdminSecondary} shrink-0 self-start sm:self-auto`}
                  aria-label={`Open application for ${application.display_name || application.owner_clerk_user_id}`}
                >
                  Open application
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-zinc-400" role="status">No applications match this search.</p>
        )}
        {snapshot && (page > 1 || hasNext) && (
          <nav aria-label="Application queue pages" className="mt-4 flex flex-wrap items-center gap-3">
            {page > 1 && (
              <button type="submit" name="page" value={page - 1} className={casterAdminSecondary} disabled={pending || edited}>
                Previous
              </button>
            )}
            <span className="text-sm text-zinc-400">Page {page}</span>
            {hasNext && (
              <button type="submit" name="page" value={page + 1} className={casterAdminSecondary} disabled={pending || edited}>
                Next
              </button>
            )}
          </nav>
        )}
      </form>
    </section>
  );
}
