import { Download, Film, ShieldCheck, TriangleAlert } from "lucide-react";
import type {
  AdminReplayArchiveItem,
  AdminTournamentReplayArchive as ReplayArchive,
  ReplayArchiveEvidenceCategory,
} from "@/lib/admin-replay-archive";
import { REPLAY_ARCHIVE_AUDIT_CATEGORIES } from "@/lib/admin-replay-archive";

export default function AdminTournamentReplayArchive({
  archive,
  loadError = false,
}: {
  archive: ReplayArchive | null;
  loadError?: boolean;
}) {
  if (loadError) {
    return (
      <section
        role="alert"
        className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-red-100 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 shrink-0 text-red-300" size={20} />
          <div>
            <h2 className="font-black">Replay Archive unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-red-100/80">
              Private replay evidence could not be loaded safely. Refresh this
              workspace before downloading files.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!archive) {
    return (
      <section className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-500">
        Select an available Tournament to load its Replay Archive.
      </section>
    );
  }

  const officialItems = archive.items.filter(
    (item) => item.category === "official"
  );
  const auditItems = archive.items.filter(
    (item) => item.category !== "official"
  );

  return (
    <section
      aria-labelledby="admin-replay-archive-title"
      className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6"
    >
      <header className="flex min-w-0 flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-400">
            Private casting evidence
          </p>
          <h2
            id="admin-replay-archive-title"
            className="mt-2 break-words text-2xl font-black text-white sm:text-3xl"
          >
            Replay Archive
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Replays stay in the existing private match-proofs bucket. Downloads
            use the existing authenticated proof route and receive contextual
            casting filenames without exposing Storage paths.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 text-center text-xs font-black uppercase tracking-wider">
          <ArchiveCount label="Official" value={archive.officialCount} />
          <ArchiveCount label="Audit" value={archive.auditCount} />
        </div>
      </header>

      <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={20} />
          <div>
            <h3 className="font-black text-emerald-100">
              Official casting replays
            </h3>
            <p className="mt-1 text-sm leading-6 text-emerald-100/70">
              Only finalized evidence shown in this section is the default
              source for casting. Pending, disputed, rejected, reset, and
              resubmission evidence stays separate below.
            </p>
          </div>
        </div>
      </div>

      {officialItems.length > 0 ? (
        <ArchiveGroups items={officialItems} />
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-black/25 p-8 text-center">
          <Film className="mx-auto text-zinc-600" size={28} />
          <h3 className="mt-4 font-black text-white">
            No official casting replays yet
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Finalized per-game or legacy Series Replays will appear here once
            their existing result authority makes them official.
          </p>
        </div>
      )}

      <details
        data-replay-audit-evidence
        className="mt-7 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4 sm:p-5"
      >
        <summary className="min-h-11 cursor-pointer text-sm font-black uppercase tracking-wider text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
          Audit evidence · {auditItems.length}
        </summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
          These files remain available for review but are not presented as
          official casting evidence.
        </p>
        {auditItems.length > 0 ? (
          <div className="mt-5 grid gap-5">
            {REPLAY_ARCHIVE_AUDIT_CATEGORIES.map((category) => {
              const categoryItems = auditItems.filter(
                (item) => item.category === category
              );
              if (categoryItems.length === 0) return null;

              return (
                <section key={category} aria-label={formatCategory(category)}>
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-100">
                    {formatCategory(category)} · {categoryItems.length}
                  </h3>
                  <ArchiveGroups items={categoryItems} />
                </section>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            No pending or historical audit Replay evidence is currently linked
            to this Tournament.
          </p>
        )}
      </details>
    </section>
  );
}

function ArchiveCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5">
      <span className="block text-lg text-white">{value}</span>
      <span className="text-zinc-500">{label}</span>
    </div>
  );
}

function ArchiveGroups({ items }: { items: readonly AdminReplayArchiveItem[] }) {
  const divisions = groupArchiveItems(items);

  return (
    <div className="mt-5 grid min-w-0 gap-5">
      {divisions.map((division) => (
        <section
          key={division.name}
          className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
        >
          <h3 className="break-words text-lg font-black text-white">
            {division.name}
          </h3>
          <div className="mt-4 grid min-w-0 gap-5">
            {division.rounds.map((round) => (
              <section key={round.key} className="min-w-0">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                  {round.name}
                </h4>
                <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
                  {round.matches.map((match) => (
                    <article
                      key={match.key}
                      className="min-w-0 rounded-xl border border-white/10 bg-white/[0.035] p-4"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                            Match {match.number}
                          </p>
                          <p className="mt-1 break-words font-black text-white">
                            {match.items[0].playerOneName} vs{" "}
                            {match.items[0].playerTwoName}
                          </p>
                        </div>
                        <span className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-sm font-black text-white">
                          {match.items[0].scoreLabel}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {match.items.map((item) => (
                          <ReplayDownloadRow key={item.key} item={item} />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReplayDownloadRow({ item }: { item: AdminReplayArchiveItem }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/35 p-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-sm font-black text-zinc-100">
            {item.replayLabel} · {item.evidenceSource}
          </p>
          <p className="mt-1 break-words text-xs leading-5 text-zinc-500">
            {item.categoryLabel} · Match {formatStatus(item.matchStatus)} ·{" "}
            {item.finalizedAt
              ? `Finalized ${formatTimestamp(item.finalizedAt)}`
              : `Submitted ${formatTimestamp(item.submittedAt)}`}
          </p>
        </div>
        <a
          href={item.downloadHref}
          download
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-100 transition hover:border-orange-300 hover:bg-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <Download aria-hidden="true" size={16} />
          Download Replay
        </a>
      </div>
    </div>
  );
}

function groupArchiveItems(items: readonly AdminReplayArchiveItem[]) {
  const divisions = new Map<
    string,
    {
      name: string;
      order: number;
      rounds: Map<
        string,
        {
          key: string;
          name: string;
          number: number;
          matches: Map<
            number,
            { key: string; number: number; items: AdminReplayArchiveItem[] }
          >;
        }
      >;
    }
  >();

  for (const item of items) {
    const division = divisions.get(item.divisionName) ?? {
      name: item.divisionName,
      order: item.divisionOrder,
      rounds: new Map(),
    };
    const roundKey = `${item.roundNumber}:${item.roundName}`;
    const round = division.rounds.get(roundKey) ?? {
      key: roundKey,
      name: item.roundName,
      number: item.roundNumber,
      matches: new Map(),
    };
    const match = round.matches.get(item.matchNumber) ?? {
      key: `${roundKey}:${item.matchNumber}`,
      number: item.matchNumber,
      items: [],
    };

    match.items.push(item);
    round.matches.set(item.matchNumber, match);
    division.rounds.set(roundKey, round);
    divisions.set(item.divisionName, division);
  }

  return [...divisions.values()]
    .sort(
      (left, right) =>
        left.order - right.order || left.name.localeCompare(right.name)
    )
    .map((division) => ({
      name: division.name,
      rounds: [...division.rounds.values()]
        .sort(
          (left, right) =>
            left.number - right.number || left.name.localeCompare(right.name)
        )
        .map((round) => ({
          key: round.key,
          name: round.name,
          matches: [...round.matches.values()].sort(
            (left, right) => left.number - right.number
          ),
        })),
    }));
}

function formatCategory(category: ReplayArchiveEvidenceCategory) {
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date)
    : "time unavailable";
}
