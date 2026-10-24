import { getAnnouncementPlainText, hasAnnouncementDocumentText, parseAnnouncementDocument } from "@/lib/announcement-document";
import type { PublicAnnouncement } from "@/lib/announcement-contract";

// This fixture never imports production actions, credentials, or database clients.
// Local storage models a JSON round-trip; database/security tests run separately.
export const FIXTURE_KEY = "ironclad:announcement-editor-browser-fixture";
export const tournamentId = "323e4567-e89b-42d3-a456-426614174000";
export type FixtureAnnouncement = PublicAnnouncement & { withdrawnAt: string | null };
export const supabaseUrl = "http://127.0.0.1:3226";
export const useAuth = () => ({ isLoaded: true, isSignedIn: false });
export const useRouter = () => ({ refresh() { window.dispatchEvent(new Event("announcement-fixture-refresh")); } });
export const supabase = { storage: { from() { throw new Error("Fixture has no storage service."); } } };
export async function createAnnouncementMediaUpload() { throw new Error("Fixture has no upload service."); }
export async function discardAnnouncementMediaUpload() { return { ok: true }; }
export async function markAnnouncementSeen() { return { ok: true }; }

const legacy: FixtureAnnouncement = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  title: "Legacy announcement",
  body: "Legacy first paragraph\n\nLegacy second paragraph\n\n\nFinal line <script> stays literal.",
  publishedAt: "2026-08-26T02:30:00.000Z",
  withdrawnAt: null,
  tournamentHref: null,
  mediaKind: null,
  mediaDescription: null,
  mediaMimeType: null,
  mediaUrl: null,
};

export function readFixtureAnnouncements(): FixtureAnnouncement[] {
  const saved = localStorage.getItem(FIXTURE_KEY);
  return saved ? JSON.parse(saved) : [legacy];
}

export async function publishAnnouncement(input: {
  title: string;
  bodyDocument: unknown;
  linkToTournament: boolean;
  linkedTournamentId: string | null;
}) {
  const document = parseAnnouncementDocument(input.bodyDocument);
  if (!document || !hasAnnouncementDocumentText(document)) return { ok: false, message: "Invalid fixture content." };
  const announcement: FixtureAnnouncement = {
    ...legacy,
    id: crypto.randomUUID(),
    title: input.title.trim(),
    body: getAnnouncementPlainText(document),
    bodyDocument: document,
    tournamentHref: input.linkToTournament && input.linkedTournamentId === tournamentId ? "/tournaments?tournament=fixture-cup" : null,
    publishedAt: new Date().toISOString(),
  };
  localStorage.setItem(FIXTURE_KEY, JSON.stringify([announcement, ...readFixtureAnnouncements()]));
  return { ok: true };
}

export async function withdrawAnnouncement(id: string) {
  localStorage.setItem(FIXTURE_KEY, JSON.stringify(readFixtureAnnouncements().map((announcement) => announcement.id === id ? { ...announcement, withdrawnAt: new Date().toISOString() } : announcement)));
  return { ok: true, mediaCleanupWarning: false };
}
