import Link from "next/link";
import { Download, FileCheck2, ShieldCheck } from "lucide-react";

import {
  getLegalDocument,
  legalCorpus,
  resolveEffectiveDateToken,
  type LegalContentBlock,
  type LegalDocumentKind,
} from "@/lib/legal-corpus-publication";

export default function LegalDocumentPage({
  kind,
}: {
  kind: Extract<LegalDocumentKind, "terms" | "privacy">;
}) {
  const document = getLegalDocument(kind);
  const companionRoute = kind === "terms" ? "/privacy" : "/terms";
  const companionLabel =
    kind === "terms" ? "Privacy Policy" : "Terms of Service";

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative isolate overflow-hidden border-b border-orange-500/20 px-5 pt-32 pb-14 sm:px-8 lg:px-12">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-45"
          style={{ backgroundImage: "url('/images/ironclad-background.jpg')" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.54),rgba(0,0,0,0.97)),linear-gradient(110deg,rgba(0,0,0,0.96),rgba(0,0,0,0.66),rgba(249,115,22,0.16))]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:52px_52px] opacity-30"
        />

        <div className="relative z-10 mx-auto max-w-6xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-300">
            IronClad Tournaments legal corpus
          </p>
          <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] sm:text-6xl lg:text-7xl">
            {document.title}
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-zinc-300 sm:text-lg">
            {resolveEffectiveDateToken(document.subtitle)}
          </p>

          <dl className="mt-9 grid max-w-4xl gap-px border border-white/12 bg-white/12 sm:grid-cols-3">
            <DocumentFact label="Version" value={document.version} />
            <DocumentFact label="Status" value={document.status} />
            <DocumentFact
              label="Effective date"
              value={legalCorpus.effectiveDateDisplay}
            />
          </dl>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-orange-400 bg-orange-500 px-5 py-3 text-sm font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              download={document.filename}
              href={document.publicPath}
            >
              Download version {document.version} PDF
              <Download aria-hidden="true" size={18} />
            </a>
            <Link
              className="inline-flex min-h-12 items-center justify-center border border-white/18 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:border-orange-300/70 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
              href={companionRoute}
            >
              Read the {companionLabel}
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-12 lg:py-20">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <nav
            aria-label={`${document.title} contents`}
            className="border border-white/12 bg-zinc-950/90 p-5"
          >
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-orange-300">
              <FileCheck2 aria-hidden="true" size={17} />
              Contents
            </p>
            <ol className="mt-5 max-h-[60vh] space-y-2 overflow-y-auto pr-2 text-sm text-zinc-400">
              {document.sections.map((section) => (
                <li key={section.number}>
                  <a
                    className="block border-l border-white/12 py-1 pl-3 leading-6 transition hover:border-orange-400 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                    href={`#${getSectionId(section.number)}`}
                  >
                    {section.number}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0">
          <div className="border border-orange-400/25 bg-orange-500/[0.07] p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-orange-300">
              <ShieldCheck aria-hidden="true" size={18} />
              Named operators
            </p>
            <p className="mt-3 text-sm leading-7 text-zinc-200 sm:text-base sm:leading-8">
              {resolveEffectiveDateToken(document.operatorStatement)}
            </p>
          </div>

          {document.introBlocks.length > 0 && (
            <div className="mt-8 space-y-5 border-b border-white/10 pb-10">
              {document.introBlocks.map((block, index) => (
                <LegalBlock block={block} key={`intro-${index}`} />
              ))}
            </div>
          )}

          <div className="divide-y divide-white/10">
            {document.sections.map((section) => (
              <section
                className="scroll-mt-28 py-10 first:pt-10"
                id={getSectionId(section.number)}
                key={section.number}
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                  Section {section.number}
                </p>
                <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                  {section.title}
                </h2>
                <div className="mt-6 space-y-5">
                  {section.blocks.map((block, index) => (
                    <LegalBlock
                      block={block}
                      key={`${section.number}-${index}`}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}

function DocumentFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/80 p-4">
      <dt className="text-xs font-black uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-2 font-bold text-white">{value}</dd>
    </div>
  );
}

function LegalBlock({ block }: { block: LegalContentBlock }) {
  if (block.type === "paragraph") {
    return (
      <p className="text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
        {block.number && (
          <span className="mr-2 font-black text-zinc-100">{block.number}</span>
        )}
        {resolveEffectiveDateToken(block.text)}
      </p>
    );
  }

  if (block.type === "bullets" || block.type === "numbered") {
    const List = block.type === "bullets" ? "ul" : "ol";

    return (
      <List
        className={`space-y-3 pl-6 text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8 ${
          block.type === "bullets" ? "list-disc" : "list-decimal"
        }`}
      >
        {block.items.map((item, index) => (
          <li className="pl-1 marker:font-bold marker:text-orange-300" key={index}>
            {resolveEffectiveDateToken(item)}
          </li>
        ))}
      </List>
    );
  }

  if (block.type === "table") {
    return (
      <div className="overflow-x-auto border border-white/12">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-orange-500/12 text-white">
            <tr>
              {block.headers.map((header, index) => (
                <th
                  className="border-b border-white/12 px-4 py-3 font-black"
                  key={`${header}-${index}`}
                  scope="col"
                >
                  {resolveEffectiveDateToken(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {block.rows.map((row, rowIndex) => (
              <tr className="align-top" key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td className="px-4 py-3 leading-6" key={cellIndex}>
                    {resolveEffectiveDateToken(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <aside className="border-l-2 border-orange-400 bg-orange-500/[0.07] px-5 py-4">
      <p className="font-black text-white">
        {resolveEffectiveDateToken(block.title)}
      </p>
      <p className="mt-2 text-sm leading-7 text-zinc-300 sm:text-base">
        {resolveEffectiveDateToken(block.text)}
      </p>
    </aside>
  );
}

function getSectionId(sectionNumber: string) {
  return `section-${sectionNumber.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}
