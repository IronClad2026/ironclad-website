import { type NextRequest } from "next/server";
import { getCasterInvitationOrigin } from "@/lib/caster/environment";
import { invitationCopy } from "@/lib/caster/invitation-copy";
import { CASTER_INVITATION_CONTENT_POLICY, CASTER_INVITATION_FRAME_POLICY } from "@/lib/caster/invitation-policy";
import { LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n/config";
import { OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL } from "@/lib/support";

const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": CASTER_INVITATION_FRAME_POLICY,
  "Content-Type": "text/html; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function renderPage(request: NextRequest, origin: string | null) {
  const locale = resolveLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const copy = invitationCopy[locale];
  const h = escapeHtml;
  const invitationUrl = origin ? new URL("/casters/invitation", origin).href : "";
  const imageUrl = origin ? new URL("/caster-invitation/preview.png", origin).href : "";
  const statusKeys = ["lost", "invalid", "expired", "revoked", "claimed", "unavailable", "limited", "checking"] as const;
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${CASTER_INVITATION_CONTENT_POLICY}">
  ${origin ? '<script src="/caster-invitation/invitation.js"></script>' : ''}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Official Caster Programme | IronClad</title>
  ${origin ? `<meta property="og:type" content="website">
  <meta property="og:site_name" content="IronClad Tournaments">
  <meta property="og:title" content="IronClad Official Caster Programme">
  <meta property="og:description" content="You’re invited to join the IronClad casting community.">
  <meta property="og:url" content="${h(invitationUrl)}">
  <meta property="og:image" content="${h(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="IronClad Official Caster Programme invitation">
  <meta name="twitter:card" content="summary_large_image">` : ''}
  <link rel="stylesheet" href="/caster-invitation/invitation.css">
</head>
<body>
  <main class="invitation">
    <header class="brand">
      <img src="/caster-invitation/logo.webp" width="104" height="144" alt="IronClad Tournaments">
    </header>
    ${origin ? `<div class="body">
      <h1>${h(copy.heading)}</h1>
      <p class="description">${h(copy.description)}</p>
      <ul class="benefits">
        ${copy.benefits.map((benefit) => `<li>${h(benefit)}</li>`).join("")}
      </ul>
      <div class="notice">
        <p><strong>${h(copy.personal)}</strong></p>
        <p>${h(copy.verification)} ${h(copy.noSteam)}</p>
      </div>
      <form id="invitation-form" method="post" autocomplete="off" data-invitation-url="${h(invitationUrl)}">
        <div class="actions">
          <button class="button button-primary" name="destination" value="register" disabled>${h(copy.register)}</button>
          <button class="button button-secondary" name="destination" value="sign-in" disabled>${h(copy.signIn)}</button>
        </div>
        <a class="resume" href="/caster-studio">${h(copy.resume)}</a>
        <p id="invitation-status" class="status" role="status" aria-live="polite" hidden></p>
        <details id="recovery" class="recovery">
          <summary>${h(copy.recovery)}</summary>
          <label for="recovery-value">${h(copy.recoveryHint)}</label>
          <div class="recovery-controls">
            <input id="recovery-value" type="text" maxlength="512" autocomplete="off" autocapitalize="none" spellcheck="false">
            <button class="button button-secondary" name="destination" value="continue" disabled>${h(copy.continue)}</button>
          </div>
        </details>
        <template id="invitation-messages">
          ${statusKeys.map((status) => `<span data-status="${status}">${h(copy[status])}</span>`).join("")}
        </template>
        <noscript><p class="status">${h(copy.javascript)}</p></noscript>
      </form>
    </div>` : `<div class="body"><h1>${h(copy.disabled)}</h1><a href="/">${h(copy.home)}</a></div>`}
    <footer class="footer">
      <a href="/terms">${h(copy.terms)}</a>
      <a href="/privacy">${h(copy.privacy)}</a>
      <a href="${h(OFFICIAL_DISCORD_SUPPORT_CHANNEL_URL)}" rel="noreferrer">${h(copy.support)}</a>
    </footer>
  </main>
</body>
</html>`;
}

export function GET(request: NextRequest) {
  const origin = getCasterInvitationOrigin();
  return new Response(renderPage(request, origin), { headers, status: origin ? 200 : 404 });
}

export function HEAD() {
  return new Response(null, { headers, status: getCasterInvitationOrigin() ? 200 : 404 });
}
