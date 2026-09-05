import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const archive = read("lib/admin-replay-archive.ts");
const component = read(
  "components/admin/tournaments/AdminTournamentReplayArchive.tsx"
);
const menu = read(
  "components/admin/tournaments/TournamentManagementMenu.tsx"
);
const page = read("app/admin/tournaments/[tournamentId]/page.tsx");
const proofRoute = read(
  "app/api/match-proofs/[matchId]/[source]/[recordId]/[kind]/route.ts"
);
const upload = read("lib/match-replay-direct-upload.ts");

describe("Admin Tournament Replay Archive contract", () => {
  it("adds one focused read-only Replay Archive section", () => {
    expect(menu).toContain('| "replays"');
    expect(menu).toContain(
      '{ icon: Film, label: "Replay Archive", section: "replays" }'
    );
    expect(page).toContain('if (section === "replays")');
    expect(page).toContain("loadAdminTournamentReplayArchive");
    expect(page).toContain("<AdminTournamentReplayArchive");
    expect(archive).not.toContain('"use server"');
    expect(component).not.toContain(".rpc(");
  });

  it("uses existing result authority and separates official from audit evidence", () => {
    expect(archive).toContain("loadAdminTournamentMatchWorkspace");
    expect(archive).toContain('category: "official"');
    expect(archive).toContain("reportGroup.finalizedAt !== null");
    expect(archive).toContain('reportGroup.resultType === "normal"');
    expect(component).toContain("Official casting replays");
    expect(component).toContain("data-replay-audit-evidence");
    expect(component).toContain("Pending, disputed, rejected, reset");
  });

  it("reuses the private authenticated proof route and exposes no Storage paths", () => {
    expect(archive).toContain("downloadHref");
    expect(component).toContain("href={item.downloadHref}");
    expect(component).not.toContain("replay_storage_path");
    expect(component).not.toContain("createSignedUrl");
    expect(proofRoute).toContain('const MATCH_PROOF_BUCKET = "match-proofs"');
    expect(proofRoute).toContain("buildReplayDownloadFilename");
    expect(proofRoute).toContain("MAX_PROOF_RESPONSE_BYTES = 10 * 1024 * 1024");
  });

  it("does not alter upload limits, add archive packaging, or create a parallel endpoint", () => {
    expect(upload).toContain("MAX_MATCH_REPLAY_BYTES = 10 * 1024 * 1024");
    expect(component).not.toMatch(/\.zip\b|JSZip|archiver/i);
    expect(archive).not.toContain("createSupabaseAdminClient");
    expect(page).not.toContain("replay-archive-actions");
  });
});
