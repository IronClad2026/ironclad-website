# Announcement editor browser verification

Run `npx playwright test --config tests/browser/announcements/playwright.config.ts`.

The fixture renders the real admin composer, Tiptap editor, preview, public feed,
and withdrawal dialog at desktop and touch/mobile widths. Every server action,
auth provider, and database client is replaced with a local fixture. No environment
files are loaded. Browser local storage simulates JSON persistence and reload;
the separate database integration suite verifies actual RPC persistence and grants.

The suite checks formatting controls, Word-like HTML paste, repeated blank lines,
plain-text newline paste, Unicode, links and unsafe URLs, undo/redo, limit rejection,
legacy content, tournament association, publication, withdrawal, unread markers,
matching preview/public typography, and horizontal overflow. Screenshots are
written under `.playwright/announcements` for visual review.
