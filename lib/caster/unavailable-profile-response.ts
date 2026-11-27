import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { getPublicCasterCopy } from "./public-copy";
import { CASTER_DIRECTORY_PATH } from "./publication";

const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Content-Type": "text/html; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
};

function escapeText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function unavailableCasterProfileResponse(request: NextRequest) {
  if (request.method === "HEAD") return new NextResponse(null, { status: 404, headers });
  const locale = resolveLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const copy = getPublicCasterCopy(locale);
  const message = escapeText(copy.unavailable);
  return new NextResponse(`<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${message} · IronClad</title>
  <link rel="stylesheet" href="/caster-invitation/invitation.css">
</head>
<body>
  <main class="invitation" data-caster-profile-unavailable>
    <header class="brand"><img src="/caster-invitation/logo.webp" width="104" height="144" alt="IronClad Tournaments"></header>
    <div class="body">
      <h1>${message}</h1>
      <div class="actions"><a class="button button-primary" href="${CASTER_DIRECTORY_PATH}">${escapeText(copy.back)}</a></div>
    </div>
  </main>
</body>
</html>`, { status: 404, headers });
}
