const SYDNEY_TIME_ZONE = "Australia/Sydney";

export function assertCleanGitWorktree(runCommand) {
  const status = runCommand("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status.trim()) {
    throw new Error(
      "The release worktree is not clean; exact-head release tooling refuses uncommitted or untracked files."
    );
  }
}

export function validateCanonicalReleaseCorpus(
  corpus,
  activationDate,
  documentSpecs
) {
  if (!corpus || corpus.schemaVersion !== 1) {
    throw new Error("The canonical legal corpus schema is unavailable.");
  }

  const effectiveDateDisplay = formatActivationDateDisplay(activationDate);
  if (
    corpus.effectiveDate !== activationDate ||
    corpus.effectiveDateDisplay !== effectiveDateDisplay
  ) {
    throw new Error(
      "The canonical web corpus Effective date does not match --activation-date."
    );
  }

  if (
    !Array.isArray(corpus.documents) ||
    corpus.documents.length !== documentSpecs.length
  ) {
    throw new Error("The canonical legal corpus does not contain exactly four documents.");
  }

  const byKind = new Map();
  for (const document of corpus.documents) {
    if (!document || typeof document.kind !== "string" || byKind.has(document.kind)) {
      throw new Error("The canonical legal corpus contains an invalid document kind.");
    }
    byKind.set(document.kind, document);
  }

  for (const spec of documentSpecs) {
    const document = byKind.get(spec.kind);
    if (
      !document ||
      document.version !== spec.version ||
      document.status !== "Effective" ||
      document.effectiveDate !== activationDate ||
      document.filename !== spec.filename ||
      document.publicPath !== spec.pathname
    ) {
      throw new Error(
        `The canonical ${spec.kind} metadata does not match the approved release contract.`
      );
    }
  }

  return { effectiveDateDisplay };
}

export function assertPdfEffectiveDate(bytes, effectiveDateDisplay, kind) {
  const expectedSubject = Buffer.from(
    `/Subject (Effective ${effectiveDateDisplay})`,
    "latin1"
  );
  if (Buffer.from(bytes).indexOf(expectedSubject) === -1) {
    throw new Error(
      `${kind} PDF metadata does not match the canonical Effective date.`
    );
  }
}

export function formatActivationDateDisplay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Activation date must use YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Activation date is not a valid calendar date.");
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function getSydneyDate(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
