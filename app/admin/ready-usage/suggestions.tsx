import Link from "next/link";

import { EmptyPanel } from "@/components/admin/operations/OperationsPrimitives";
import { readyCategoryLabels } from "@/lib/ready/catalogue";
import { readySuggestionStatuses, readySuggestionStatusLabels, type ReadySuggestionsResult } from "@/lib/ready/suggestions-admin";
import { READY_USAGE_TIMEZONE } from "@/lib/ready/usage-admin";
import SuggestionActionButton from "./suggestion-action-button";
import { reviewReadyTopicSuggestion } from "./suggestions-actions";

type Result = Exclude<ReadySuggestionsResult, { status: "unauthorized" }>;
type Suggestion = Extract<Result, { status: "ready" }>["items"][number];

const route = "/admin/ready-usage";
const datetime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium", timeStyle: "short", timeZone: READY_USAGE_TIMEZONE,
});
const number = new Intl.NumberFormat("en-AU");

const control = "inline-flex min-h-11 min-w-0 max-w-full items-center rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:opacity-60";
const field = control + " border-white/20 bg-zinc-900 text-white";
const action = control + " border-orange-400/50 bg-orange-500/15 font-semibold text-orange-200 hover:bg-orange-500/25";
const noticeLabels = {
  updated: "Review status saved.",
  deleted: "Suggestion deleted.",
  missing: "This suggestion is no longer available.",
  invalid: "The change was invalid. Reload the list and try again.",
  "notice-required": "Your account notices could not be verified. Return to the site to check for an outstanding notice, then try again.",
  unavailable: "The change could not be confirmed. Reload the list before trying again.",
};

function suggestionsHref({ status, page }: Result["filters"]) {
  const params = new URLSearchParams({ view: "suggestions" });
  if (status) params.set("suggestionStatus", status);
  if (page > 1) params.set("suggestionPage", String(page));
  return route + "?" + params.toString() + "#ready-suggestions-heading";
}

function SuggestionMutationFields({ id, filters, operation }: {
  id: string;
  filters: Result["filters"];
  operation: "review" | "delete";
}) {
  return <>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="operation" value={operation} />
    <input type="hidden" name="filterStatus" value={filters.status ?? ""} />
    <input type="hidden" name="page" value={filters.page} />
  </>;
}

function SuggestionCard({ suggestion, filters }: { suggestion: Suggestion; filters: Result["filters"] }) {
  const { id, submittedAt, categoryId, description, menuVersion, catalogueVersion, status } = suggestion;
  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-white/10 bg-zinc-950 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-zinc-100">
            {categoryId ? readyCategoryLabels[categoryId] : "No category selected"}
          </h3>
          <p className="text-xs leading-5 text-zinc-400">
            <time dateTime={submittedAt}>{datetime.format(new Date(submittedAt))} Sydney time</time>
            {" · "}Menu {menuVersion} / catalogue {catalogueVersion}
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
          {readySuggestionStatusLabels[status]}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200 [overflow-wrap:anywhere]">{description}</p>
      <form action={reviewReadyTopicSuggestion} className="flex flex-wrap items-end gap-2">
        <SuggestionMutationFields id={id} filters={filters} operation="review" />
        <label className="grid min-w-0 max-w-full gap-1 text-xs font-semibold text-zinc-300">
          Review status
          <select name="status" defaultValue={status} className={field}>
            {readySuggestionStatuses.map((value) => (
              <option key={value} value={value}>{readySuggestionStatusLabels[value]}</option>
            ))}
          </select>
        </label>
        <SuggestionActionButton className={action}>Save status</SuggestionActionButton>
      </form>
      <details className="border-t border-white/10 pt-1">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center rounded text-sm text-red-300 underline decoration-red-300/60 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400">
          Delete suggestion
        </summary>
        <form action={reviewReadyTopicSuggestion} className="space-y-2 pb-1">
          <SuggestionMutationFields id={id} filters={filters} operation="delete" />
          <p className="text-sm text-zinc-300">Permanently remove this suggestion?</p>
          <SuggestionActionButton className={control + " border-red-400/50 bg-red-500/10 font-semibold text-red-200 hover:bg-red-500/25"}>
            Confirm deletion
          </SuggestionActionButton>
        </form>
      </details>
    </li>
  );
}

export default function ReadySuggestionsDashboard({ result, notice }: { result: Result; notice: unknown }) {
  const { filters } = result;
  const message = typeof notice === "string" && Object.hasOwn(noticeLabels, notice)
    ? noticeLabels[notice as keyof typeof noticeLabels] : null;

  return (
    <section aria-labelledby="ready-suggestions-heading" className="space-y-4">
      <header className="space-y-2">
        <h2 id="ready-suggestions-heading" tabIndex={-1} className="scroll-mt-28 text-xl font-black sm:text-2xl">
          Missing-topic suggestions
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-zinc-400">
          Visitors and signed-in players can send written suggestions independently of usage analytics.
          This list covers the last 90 days. Use the review status to track follow-up.
        </p>
        <p className="max-w-3xl text-sm leading-6 text-zinc-400">
          Earlier category-only flags collected no written descriptions and are counted separately in{" "}
          <Link href={route + "#ready-historical-flags"} prefetch={false}
            className="rounded-sm text-orange-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-400">
            Activity and feedback
          </Link>.
        </p>
      </header>
      <form action={route} className="scheme-dark flex flex-wrap items-end gap-2" aria-label="Filter written suggestions by review status">
        <input type="hidden" name="view" value="suggestions" />
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-zinc-300">
          Review status
          <select name="suggestionStatus" className={field} defaultValue={filters.status ?? ""}>
            <option value="">All statuses</option>
            {readySuggestionStatuses.map((status) => (
              <option key={status} value={status}>{readySuggestionStatusLabels[status]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={action}>Apply status filter</button>
      </form>
      {message && <p role="status" className="rounded-lg border border-orange-400/20 bg-orange-500/10 p-3 text-sm text-orange-100">{message}</p>}

      {result.status === "unavailable" ? (
        <EmptyPanel>
          Written suggestions could not be loaded.{" "}
          <Link href={suggestionsHref(filters)} prefetch={false} className="text-orange-300 underline">Try again</Link>.
        </EmptyPanel>
      ) : result.total === 0 ? (
        <EmptyPanel>{filters.status ? "No written suggestions have this status in the last 90 days." : "No written suggestions were submitted in the last 90 days."}</EmptyPanel>
      ) : (
        <>
          {result.items.length > 0 ? (
            <ul className="space-y-3" aria-label="Written Ready suggestions">
              {result.items.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} filters={filters} />)}
            </ul>
          ) : (
            <EmptyPanel>This page is no longer available. Go to the last available page to continue.</EmptyPanel>
          )}
          <nav aria-label="Suggestion pages" className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            {filters.page > result.pages ? (
              <Link href={suggestionsHref({ ...filters, page: result.pages })} prefetch={false} className={field}>Last available page</Link>
            ) : (
              <>
                <span className="mr-auto">Page {number.format(filters.page)} of {number.format(result.pages)} · {number.format(result.total)} written suggestions</span>
                {filters.page > 1 && <Link href={suggestionsHref({ ...filters, page: filters.page - 1 })} prefetch={false} className={field}>Previous page</Link>}
                {filters.page < result.pages && <Link href={suggestionsHref({ ...filters, page: filters.page + 1 })} prefetch={false} className={field}>Next page</Link>}
              </>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
