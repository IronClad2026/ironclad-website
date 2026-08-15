import Link from "next/link";
import { MapPinned, Pencil, Plus, Search } from "lucide-react";
import { saveCoh3Map } from "@/app/admin/maps/actions";
import {
  COH3_MAP_SOURCE_TYPES,
  COH3_MAP_STATUSES,
  type Coh3MapInput,
  type Coh3MapRow,
} from "@/lib/coh3-maps";

type AdminMapCatalogueProps = {
  maps: Coh3MapRow[];
  filters: {
    query: string;
    sourceType: string;
    status: string;
  };
  notice?: string;
  detail?: string;
};

const sourceTypeLabels = {
  official: "Official",
  community: "Community",
} as const;

const statusLabels = {
  active: "Active",
  retired: "Retired",
  temporarily_disabled: "Temporarily disabled",
} as const;

export default function AdminMapCatalogue({
  maps,
  filters,
  notice,
  detail,
}: AdminMapCatalogueProps) {
  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-28 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-orange-500/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
              Tournament Administration
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              CoH3 Map Catalogue
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Maintain official-client maps and manually curated community maps.
              Retire or disable referenced maps instead of deleting history.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-zinc-300 transition hover:border-orange-400/50 hover:text-white"
          >
            Back to Admin
          </Link>
        </div>

        {notice ? <CatalogueNotice notice={notice} detail={detail} /> : null}

        <section className="mt-7 rounded-3xl border border-orange-500/25 bg-gradient-to-br from-zinc-950 via-zinc-950 to-orange-950/20 p-5 shadow-2xl shadow-orange-950/10">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-300">
              <Plus size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">Add catalogue map</h2>
              <p className="text-sm text-zinc-400">
                Community maps are always selected manually by an Administrator.
              </p>
            </div>
          </div>
          <form action={saveCoh3Map} className="mt-5">
            <MapFields
              values={{
                slug: "",
                displayName: "",
                sourceType: "community",
                creatorName: null,
                gameMode: "1v1",
                status: "active",
                thumbnailPath: null,
                sourceReference: null,
                adminNote: null,
              }}
            />
            <button className="mt-5 min-h-11 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider transition hover:bg-orange-400">
              Add Map
            </button>
          </form>
        </section>

        <section className="mt-7">
          <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,180px))_auto]">
            <label className="relative">
              <span className="sr-only">Search maps</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
              <input
                name="query"
                defaultValue={filters.query}
                placeholder="Search maps or creators"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400"
              />
            </label>
            <FilterSelect
              name="sourceType"
              value={filters.sourceType}
              options={COH3_MAP_SOURCE_TYPES.map((value) => [
                value,
                sourceTypeLabels[value],
              ])}
              allLabel="All source types"
            />
            <FilterSelect
              name="status"
              value={filters.status}
              options={COH3_MAP_STATUSES.map((value) => [
                value,
                statusLabels[value],
              ])}
              allLabel="All statuses"
            />
            <button className="min-h-11 rounded-xl border border-orange-400/40 bg-orange-500/10 px-4 text-sm font-black text-orange-200 transition hover:bg-orange-500/20">
              Filter
            </button>
          </form>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {maps.map((map) => (
              <article
                key={map.id}
                className="rounded-2xl border border-white/10 bg-zinc-950/85 p-4 shadow-xl shadow-black/20"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-orange-300">
                    <MapPinned size={20} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{sourceTypeLabels[map.sourceType]}</Badge>
                      <Badge>{statusLabels[map.status]}</Badge>
                      <Badge>{map.gameMode}</Badge>
                    </div>
                    <h2 className="mt-2 break-words text-lg font-black">
                      {map.displayName}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {map.creatorName ? `Created by ${map.creatorName}` : "Creator not recorded"}
                    </p>
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-black text-orange-200">
                    <Pencil size={15} aria-hidden="true" /> Edit metadata
                  </summary>
                  <form action={saveCoh3Map} className="mt-4">
                    <input type="hidden" name="mapId" value={map.id} />
                    <MapFields values={map} slugReadOnly />
                    <button className="mt-5 min-h-11 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider transition hover:bg-orange-400">
                      Save Map
                    </button>
                  </form>
                </details>
              </article>
            ))}
          </div>

          {maps.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
              No maps match these filters.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function MapFields({
  values,
  slugReadOnly = false,
}: {
  values: Coh3MapInput;
  slugReadOnly?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Stable slug"
        name="slug"
        defaultValue={values.slug}
        readOnly={slugReadOnly}
        required
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        maxLength={100}
        placeholder="road-to-tunis"
      />
      <Field label="Display name" name="displayName" defaultValue={values.displayName} required />
      <SelectField
        label="Source type"
        name="sourceType"
        defaultValue={values.sourceType}
        options={COH3_MAP_SOURCE_TYPES.map((value) => [
          value,
          sourceTypeLabels[value],
        ])}
      />
      <Field label="Creator / author" name="creatorName" defaultValue={values.creatorName ?? ""} />
      <SelectField
        label="Operational status"
        name="status"
        defaultValue={values.status}
        options={COH3_MAP_STATUSES.map((value) => [value, statusLabels[value]])}
      />
      <Field
        label="Game mode"
        name="gameMode"
        value={values.gameMode}
        readOnly
      />
      <Field label="Local thumbnail path" name="thumbnailPath" defaultValue={values.thumbnailPath ?? ""} placeholder="/images/maps/example.webp" />
      <Field label="Source URL or reference" name="sourceReference" defaultValue={values.sourceReference ?? ""} />
      <label className="md:col-span-2">
        <span className="text-sm font-bold">Private Admin note</span>
        <textarea
          name="adminNote"
          defaultValue={values.adminNote ?? ""}
          maxLength={2000}
          rows={3}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none transition focus:border-orange-400"
        />
      </label>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <input {...props} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-orange-400" />
    </label>
  );
}

function SelectField({ label, options, ...props }: { label: string; options: [string, string][] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <select {...props} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-orange-400">
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function FilterSelect({ name, value, options, allLabel }: { name: string; value: string; options: [string, string][]; allLabel: string }) {
  return (
    <label>
      <span className="sr-only">{allLabel}</span>
      <select name={name} defaultValue={value} className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-orange-400">
        <option value="">{allLabel}</option>
        {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
      </select>
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-300">{children}</span>;
}

function CatalogueNotice({ notice, detail }: { notice: string; detail?: string }) {
  const success = notice === "created" || notice === "updated";
  const message = notice === "created"
    ? "Map added to the catalogue."
    : notice === "updated"
      ? "Map metadata updated."
      : notice === "invalid-map"
        ? detail || "Enter valid map details."
        : "The map could not be saved.";
  return <p className={`mt-5 rounded-xl border p-3 text-sm font-bold ${success ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>{message}</p>;
}
