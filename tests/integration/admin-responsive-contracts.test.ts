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
const registrationsPage = readSource("app/admin/registrations/page.tsx");
const tournamentListPage = readSource("app/admin/tournaments/page.tsx");
const tournamentNewPage = readSource("app/admin/tournaments/new/page.tsx");
const tournamentWorkspacePage = readSource(
  "app/admin/tournaments/[tournamentId]/page.tsx"
);
const tournamentEditor = readSource(
  "components/admin/tournaments/TournamentEditor.tsx"
);
const tournamentManagementMenu = readSource(
  "components/admin/tournaments/TournamentManagementMenu.tsx"
);
const registrationDetailDialog = readSource(
  "components/admin/tournaments/AdminRegistrationDetailDialog.tsx"
);
const bracketManagement = readSource("components/AdminBracketManagement.tsx");
const bracketPopulation = readSource("components/AdminBracketPopulation.tsx");
const matchSummaries = readSource("components/AdminMatchResultSummaries.tsx");
const registrationSelectAll = readSource(
  "components/AdminRegistrationSelectAll.tsx"
);
const deleteTournament = readSource("components/DeleteTournamentControl.tsx");
const matchControls = readSource("components/MatchResultControls.tsx");
const tournamentBannerPicker = readSource(
  "components/TournamentBannerPicker.tsx"
);

// These assertions cover component/CSS contracts only. They are intentionally
// not treated as rendered or visually inspected viewport validation.
describe("admin responsive component and CSS contracts", () => {
  it("contains page width and narrow-screen spacing in the changed admin pages", () => {
    expect(adminPage).toContain(
      'className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32"'
    );
    expect(registrationsPage).toContain(
      'className="min-h-screen overflow-x-hidden bg-black px-4 pt-28 pb-16 text-white sm:px-6 sm:pt-32"'
    );
    expect(registrationsPage).toContain(
      "data-registration-tournament-group={group.key}"
    );
    expect(registrationsPage).toContain(
      'className="group min-w-0 overflow-hidden rounded-2xl border border-white/10'
    );
    expect(registrationsPage).toContain(
      'className="cursor-pointer list-none px-4 py-4'
    );
    expect(registrationsPage).toContain(
      'className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1"'
    );
    expect(registrationsPage).toContain(
      'className="group/archive rounded-2xl border border-white/10'
    );
    expect(registrationsPage).toContain(
      'className="flex min-h-11 cursor-pointer list-none items-center justify-between'
    );
    expect(registrationsPage).toContain(
      "group-open/archive:rotate-180"
    );
    expect(tournamentListPage).toContain(
      'className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32"'
    );
    expect(tournamentListPage).toContain(
      'className="group min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition'
    );
    expect(tournamentNewPage).toContain(
      'className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32"'
    );
    expect(tournamentWorkspacePage).toContain(
      'className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-24 pb-20 text-white sm:px-6 sm:pt-28"'
    );
    expect(tournamentEditor).toContain(
      'className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:p-8"'
    );
  });

  it("keeps the tournament editor and banner preview within narrow grid tracks", () => {
    expect(tournamentEditor).toContain(
      'className="mt-8 grid gap-5 md:grid-cols-2"'
    );
    expect(tournamentEditor).toContain(
      'className="mt-8 grid gap-5 lg:grid-cols-3"'
    );
    expect(tournamentEditor).toContain(
      'className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"'
    );
    expect(tournamentListPage).toContain("break-words text-4xl");
    expect(tournamentEditor).toContain("break-words text-3xl");
    expect(tournamentBannerPicker).toContain(
      "relative aspect-[16/6] sm:min-h-44 overflow-hidden bg-zinc-950"
    );
    expect(tournamentBannerPicker).not.toContain(
      "relative aspect-[16/6] min-h-44"
    );
    expect(count(tournamentBannerPicker, "min-h-44")).toBe(1);
  });

  it("keeps registration-review modal content, header, close, and actions reachable", () => {
    expect(registrationDetailDialog).toContain(
      "max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto overscroll-contain"
    );
    expect(registrationDetailDialog).toContain(
      "sm:max-h-[calc(100dvh-3rem)] sm:p-6"
    );
    expect(registrationDetailDialog).toContain(
      "sticky top-0 z-10 -mx-1 mb-5 flex items-start justify-between"
    );
    expect(registrationDetailDialog).toContain(
      "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    );
    expect(registrationDetailDialog).toContain(
      "mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:flex lg:flex-wrap"
    );
    expect(
      count(
        registrationDetailDialog,
        "inline-flex min-h-11 w-full items-center justify-center"
      )
    ).toBeGreaterThanOrEqual(4);
  });

  it("keeps the right-side management drawer touch-safe and phone-safe", () => {
    expect(tournamentManagementMenu).toContain(
      'aria-label="Open Tournament management menu"'
    );
    expect(tournamentManagementMenu).toContain("grid h-11 w-11 shrink-0");
    expect(tournamentManagementMenu).toContain(
      "h-[100dvh] w-[min(22rem,100vw)] overflow-y-auto"
    );
    expect(tournamentManagementMenu).toContain(
      "[padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
    );
    expect(tournamentManagementMenu).toContain(
      "[padding-top:max(1rem,env(safe-area-inset-top))]"
    );
    expect(tournamentManagementMenu).toContain("flex min-h-11 items-center");
  });

  it("makes bracket administration usable without desktop-only drag interactions", () => {
    expect(count(bracketManagement, "min-h-11")).toBeGreaterThanOrEqual(4);
    expect(bracketManagement).toContain(
      'className={`mt-4 grid gap-3 ${'
    );
    expect(bracketManagement).toContain(
      'fixedTournamentId ? "" : "md:grid-cols-2"'
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
