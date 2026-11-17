import { ChevronDown } from "lucide-react";

import { isReadyQuestionId, READY_CATALOGUE_VERSION, readyCategoryLabels, readyQuestionCatalogue, type ReadyQuestionId } from "@/lib/ready/catalogue";
import { readyQuestionPreview } from "@/lib/ready/catalogue-preview";
import { publishedReadyVersions } from "@/lib/ready/knowledge-sources";
import type { ReadyUsageReport } from "@/lib/ready/usage-admin";
import type { ReadyReply } from "@/lib/ready/contracts";

const number = new Intl.NumberFormat("en-AU");
const archivedVersions = { ...publishedReadyVersions, rulebook: "3.1", ppa: "3.1", privacy: "1.2" };

function AnswerPreview({ reply }: { reply: ReadyReply }) {
  return (
    <div className="space-y-1.5 text-sm leading-6 text-zinc-300">
      <p>{reply.text}</p>
      {reply.details && <p className="text-zinc-400">{reply.details}</p>}
      {reply.sources?.length ? (
        <ul aria-label="Answer sources" className="space-y-1">
          {reply.sources.map(({ title, url, section }) => (
            <li key={url + section} className="min-w-0 break-words">
              <a href={url} className="rounded-sm font-semibold text-orange-300 underline decoration-orange-300/50 underline-offset-4 hover:decoration-orange-200 focus-visible:outline-2 focus-visible:outline-orange-400">{title}</a>
              <span className="text-zinc-400"> · {section}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {reply.actions?.length ? (
        <p className="text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300">Available actions</span>
          {" · "}{reply.actions.map(({ label }) => label).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export default function PreparedAnswers({
  report, currentVersionSelected,
}: {
  report?: ReadyUsageReport;
  currentVersionSelected: boolean;
}) {
  const rows = new Map(report?.questions.map((entry) => [entry.id, entry]));
  const unknown = report?.questions.filter(({ id }) => !isReadyQuestionId(id)) ?? [];
  const ids = Object.keys(readyQuestionCatalogue).filter(isReadyQuestionId).sort((left, right) =>
    (rows.get(right)?.selections ?? 0) - (rows.get(left)?.selections ?? 0) ||
    (rows.get(right)?.displays ?? 0) - (rows.get(left)?.displays ?? 0));
  const hasReport = report?.coverage.collected === true;
  return (
    <section aria-labelledby="ready-prepared-title" className="space-y-3 rounded-xl border border-white/10 bg-zinc-950 p-4 sm:p-5">
      <div>
        <h2 id="ready-prepared-title" className="text-xl font-bold">Most-used questions and prepared answers</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
          Questions are ordered by recorded selections and then displays. Selections count explicit question choices, including chosen search suggestions. Displays count when an answer appears. Vote samples include both answer feedback choices.
        </p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
          {currentVersionSelected
            ? <>Prepared wording shown here comes from catalogue {READY_CATALOGUE_VERSION}. Event answers use the document versions recorded for that registration.</>
            : <>The selected filter applies to usage counts. Only catalogue {READY_CATALOGUE_VERSION} wording is available for inspection.</>}
        </p>
        {unknown.length > 0 && <p className="mt-1 text-sm text-zinc-400">Other catalogue topics recorded {number.format(unknown.reduce((sum, row) => sum + row.selections, 0))} selections and {number.format(unknown.reduce((sum, row) => sum + row.displays, 0))} displays.</p>}
      </div>
      <div className="divide-y divide-white/10 rounded-lg border border-white/10">
        {ids.map((id) => <PreparedQuestion key={id} id={id} usage={rows.get(id)} hasReport={hasReport} />)}
      </div>
    </section>
  );
}

function PreparedQuestion({ id, usage, hasReport }: {
  id: ReadyQuestionId;
  usage?: ReadyUsageReport["questions"][number];
  hasReport: boolean;
}) {
  const entry = readyQuestionCatalogue[id];
  const current = readyQuestionPreview(id);
  const previous = readyQuestionPreview(id, archivedVersions);
  const showPrevious = previous.text !== current.text || previous.sources?.some((source, index) => source.title !== current.sources?.[index]?.title);
  const helpful = usage?.helpful ?? 0;
  const stillNeedHelp = usage?.stillNeedHelp ?? 0;
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 marker:content-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-400">
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold text-zinc-100">{entry.question}</span>
          <span className="block text-xs leading-5 text-zinc-400">
            {readyCategoryLabels[entry.category]}{hasReport && <> · {number.format(usage?.selections ?? 0)} selections · {number.format(usage?.displays ?? 0)} displays</>}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-orange-300 group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-white/10 bg-white/[0.02] px-3 pb-4 pt-3 sm:px-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-400">Current published documents</p>
          <AnswerPreview reply={current} />
        </div>
        {showPrevious && (
          <div className="border-t border-white/10 pt-3">
            <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-400">Example with archived event documents</p>
            <AnswerPreview reply={previous} />
          </div>
        )}
        {hasReport && <p className="text-xs text-zinc-400">Answer votes · {number.format(helpful)} Helpful · {number.format(stillNeedHelp)} Still need help · sample size {number.format(helpful + stillNeedHelp)}</p>}
      </div>
    </details>
  );
}
