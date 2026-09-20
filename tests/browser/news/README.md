# Isolated Official CoH3 News browser checks

Run from the feature worktree:

```powershell
npx playwright test --config tests/browser/news/playwright.config.ts
```

The configuration starts Vite at http://127.0.0.1:3198/tests/browser/news/ and uses Chromium. It does not read environment files. Screenshots/traces are written under the ignored `.playwright/news` directory.

The harness renders real NewsListing, NewsCard, NewsImage, LatestNews, Navbar, More menu, language controls, support controls and dictionaries. Its news-page shell mirrors the production page container; request-time Next.js rendering and real Clerk sessions are outside this fixture and require Preview verification.

Clerk identity/account widget, locale Server Actions and announcement unread input are synthetic. The normal unread styling and menu behavior remain real. Supabase clients, unstubbed Server Actions and external News source loaders are prohibited by the Vite boundary. Browser fetch is guarded; Playwright allows only localhost and synthetic image responses on the single fixture CDN path. The image bytes are generated test art; no remote article images are downloaded.

Fixture query options:
- `auth=signedout|user|admin`
- `locale=en|it|es|fr|pt-BR|ru|ko|zh-CN`
- `unread=1`
- `surface=home`
- `feed=empty|unavailable`
- `image=missing|broken`
- `long=1`

The checks cover 375–1920px layouts, compact/desktop navigation, all eight locales, English source language, source links, missing/broken images, image privacy attributes, homepage newest-two/failure isolation, Announcements attention, and More menu keyboard/pointer behavior.
