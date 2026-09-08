import "server-only";

import { randomUUID } from "node:crypto";

type PollDiagnosticStage = "authentication" | "player_lookup" | "client" | "token" | "rpc" | "projection" | "application";
type PollDiagnosticCategory = "acquisition" | "rejection" | "transport" | "validation" | "unexpected";
type PollDiagnosticSource = "public" | "private" | "request";
const SAFE_CODES = new Set(["42501", "22023", "22P02", "42883", "42P01", "42703", "57014", "53300", "08006", "PGRST116", "PGRST202", "PGRST301", "PGRST302", "PGRST303"]);

export function createPollDiagnostics(surface: "tournament" | "community") {
  const correlationId = randomUUID();
  let emitted = 0;
  return (stage: PollDiagnosticStage, source: PollDiagnosticSource, category: PollDiagnosticCategory, error?: unknown) => {
    // Per-request cap: no IDs, arbitrary error strings, payloads, or caller-provided fields.
    if (emitted++ >= 8) return;
    let code = "other";
    try {
      if (typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && SAFE_CODES.has(error.code)) code = error.code;
    } catch { /* Untrusted error accessors must not break the fallback. */ }
    console.error("Poll projection load failed.", { surface, correlationId, stage, source, category, code });
  };
}
