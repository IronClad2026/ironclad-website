"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ADMIN_APPLICATION_MAX_PAGE } from "../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminSecondary } from "../admin-application-styles";
import { searchCasterModeration } from "../moderation-actions";
import { CASTER_MODERATION_PATH, membershipLabels, type CasterModerationList, type CasterModerationSearch } from "../moderation-contracts";

const initialSearch: CasterModerationSearch = { kind: "idle" };

export default function ModerationQueue({ initialSnapshot }: { initialSnapshot: CasterModerationList | null }) {
  const [search, action, pending] = useActionState(searchCasterModeration, initialSearch);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const snapshot = search.kind === "idle" ? initialSnapshot : search.snapshot;
  const page = search.page ?? 1;
  const edited = filter !== (search.filter ?? "all") || query.trim() !== (search.query ?? "");
  const hasNext = snapshot?.has_more && page < ADMIN_APPLICATION_MAX_PAGE;

  return (
    <section className={casterAdminPanel} aria-labelledby="approved-casters">
      <h2 id="approved-casters" className="text-xl font-bold">Approved casters</h2>
      <form action={action}>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid grow gap-1 text-sm font-bold sm:max-w-xs">
            Search by display name, slug or account ID
            <input name="query" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"
              maxLength={100} className={casterAdminInput} />
          </label>
          <label className="grid grow gap-1 text-sm font-bold sm:max-w-xs">
            Membership status
            <select name="status" value={filter} onChange={(event) => setFilter(event.target.value)} className={casterAdminInput}>
              <option value="all">All casters</option>
              {Object.entries(membershipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" name="page" value="1" disabled={pending} className={casterAdminSecondary}>
            {pending ? "Searching…" : "Search casters"}
          </button>
        </div>

        {!snapshot ? (
          <p className="mt-5 text-sm text-orange-200" role="alert">{search.message ?? "Caster moderation is temporarily unavailable. Reload to retry."}</p>
        ) : snapshot.casters.length ? (
          <ul className="mt-5 divide-y divide-white/10">
            {snapshot.casters.map((caster) => (
              <li key={caster.application_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{caster.display_name || "Approved caster"}</h3>
                  <p className="mt-1 break-all text-sm text-zinc-400">{caster.slug ?? caster.owner_clerk_user_id}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    <span className="font-bold text-orange-200">{membershipLabels[caster.membership_status]}</span>
                    {caster.closed ? " · Account closed" : caster.hidden ? " · Hidden" : caster.publication_id ? " · Published revision" : " · Private profile"}
                  </p>
                </div>
                <Link href={`${CASTER_MODERATION_PATH}/${caster.application_id}`} prefetch={false}
                  className={`${casterAdminSecondary} shrink-0 self-start sm:self-auto`}
                  aria-label={`Moderate ${caster.display_name || caster.owner_clerk_user_id}`}>
                  Open caster record
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-5 text-sm text-zinc-400" role="status">No approved casters match this search.</p>}
        {snapshot && (page > 1 || hasNext) ? (
          <nav aria-label="Caster moderation pages" className="mt-4 flex flex-wrap items-center gap-3">
            {page > 1 ? <button type="submit" name="page" value={page - 1} className={casterAdminSecondary} disabled={pending || edited}>Previous</button> : null}
            <span className="text-sm text-zinc-400">Page {page}</span>
            {hasNext ? <button type="submit" name="page" value={page + 1} className={casterAdminSecondary} disabled={pending || edited}>Next</button> : null}
          </nav>
        ) : null}
      </form>
    </section>
  );
}
