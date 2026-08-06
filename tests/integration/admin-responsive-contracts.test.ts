import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function count(source: string, value: string) {
  return source.split(value).length - 1;
}

const adminPage = readSource("app/admin/page.tsx");
const tournamentAdminPage = readSource("app/admin/tournaments/page.tsx");
const bracketManagement = readSource("components/AdminBracketManagement.tsx");
const bracketPopulation = readSource("components/AdminBracketPopulation.tsx");
const matchSummaries = readSource("components/AdminMatchResultSummaries.tsx");
const registrationSelectAll = readSource(
  "components/AdminRegistrationSelectAll.tsx"
);
const deleteTournament = readSource("components/DeleteTournamentControl.tsx");
const matchControls = readSource("components/MatchResultControls.tsx");

// These assertions cover component/CSS contracts only. They are intentionally
// not treated as rendered or visually inspected viewport validation.
describe("admin responsive component and CSS contracts", () => {
  it("contains page width and narrow-screen spacing in the changed admin pages", () => {
    expect(adminPage).toContain(
      'className="min-h-screen overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32"'
    );
    expect(adminPage).toContain(
      'className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur sm:p-5"'
    );
    expect(tournamentAdminPage).toContain(
      'className="min-h-screen min-w-0 bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32"'
    );
    expect(tournamentAdminPage).toContain(
      'className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:p-8"'
    );
    expect(tournamentAdminPage).toContain(
      'className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"'
    );
  });

  it("keeps registration-review modal content, header, close, and actions reachable", () => {
    expect(adminPage).toContain(
      "max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto overscroll-contain"
    );
    expect(adminPage).toContain(
      "sm:max-h-[calc(100dvh-3rem)] sm:p-6"
    );
    expect(adminPage).toContain(
      "sticky top-0 z-10 -mx-1 mb-5 flex items-start justify-between"
    );
    expect(adminPage).toContain(
      "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    );
    expect(adminPage).toContain(
      "mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:flex lg:flex-wrap"
    );
    expect(count(adminPage, "inline-flex min-h-11 w-full items-center justify-center"))
      .toBeGreaterThanOrEqual(5);
  });

  it("makes bracket administration usable without desktop-only drag interactions", () => {
    expect(count(bracketManagement, "min-h-11")).toBeGreaterThanOrEqual(4);
    expect(bracketManagement).toContain(
      'className="mt-4 grid gap-3 md:grid-cols-2"'
    );
    expect(bracketManagement).toContain("break-words font-black text-white");

    expect(bracketPopulation).toContain('role="dialog"');
    expect(bracketPopulation).toContain('aria-modal="true"');
    expect(bracketPopulation).toContain(
      "flex h-dvh w-screen max-w-none flex-col overflow-hidden"
    );
    expect(bracketPopulation).toContain(
      "grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden"
    );
    expect(bracketPopulation).toContain(
      "grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))]"
    );
    expect(bracketPopulation).toContain(
      "Drag approved participants into exact positions or use"
    );
    expect(bracketPopulation).toContain(
      'className="flex flex-col-reverse gap-3 sm:flex-row"'
    );
    expect(count(bracketPopulation, "min-h-11")).toBeGreaterThanOrEqual(4);
  });

  it("fits the destructive tournament modal and separates its actions", () => {
    expect(deleteTournament).toContain('role="dialog"');
    expect(deleteTournament).toContain('aria-modal="true"');
    expect(deleteTournament).toContain(
      "max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto"
    );
    expect(deleteTournament).toContain(
      "sm:max-h-[90dvh] sm:w-[calc(100vw-4rem)] lg:w-[65vw]"
    );
    expect(deleteTournament).not.toContain("md:min-w-[720px]");
    expect(deleteTournament).toContain(
      'className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"'
    );
    expect(deleteTournament).toContain("break-words text-2xl");
    expect(count(deleteTournament, "min-h-11")).toBeGreaterThanOrEqual(2);
    expect(count(deleteTournament, "h-11 w-11")).toBeGreaterThanOrEqual(2);
  });

  it("gives changed registration, result, proof, and lifecycle controls touch targets", () => {
    expect(registrationSelectAll).toContain(
      "inline-flex min-h-11 min-w-11 cursor-pointer"
    );
    expect(matchSummaries).toContain("p-4 sm:p-5");
    expect(matchSummaries).toContain("whitespace-pre-wrap break-words");
    expect(matchSummaries).toContain(
      "inline-flex min-h-11 items-center justify-center"
    );
    expect(count(matchSummaries, "min-h-11")).toBeGreaterThanOrEqual(2);
    expect(matchControls).toContain('isAdmin ? "min-h-11 py-3" : "py-2"');
    expect(matchControls).toContain('isAdmin ? "break-words" : ""');
    expect(count(matchControls, "min-h-11")).toBeGreaterThanOrEqual(5);
  });
});
