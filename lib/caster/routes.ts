import { CASTER_APPLICATION_PATH, CASTER_MEDIA_PATH, isCasterMediaId } from "./application";
import { CASTER_DIRECTORY_PATH, CASTER_PROFILE_PATH, CASTER_PUBLIC_MEDIA_PATH, isCasterPublicSlug } from "./publication";
import { CASTER_TOURNAMENT_VIDEO_PATH } from "./tournament-video";

export const CASTER_INVITATION_PATH = "/casters/invitation";
export const CASTER_STUDIO_PATH = "/caster-studio";
export const CASTER_SIGN_IN_PATH = "/caster-studio/sign-in";
export const CASTER_SIGN_UP_PATH = "/caster-studio/sign-up";
export const CASTER_PREPARE_PATH = "/api/caster/invitation/prepare";
export const CASTER_CLAIM_PATH = "/api/caster/invitation/claim";
export const CASTER_LEGAL_PATH = "/api/caster/legal-acceptance";
export const CASTER_SIGN_OUT_PATH = "/api/caster/sign-out";
export const CASTER_CHROME_HEADER = "x-ironclad-caster-chrome";
export const CASTER_PUBLIC_HOME_CHROME = "public-home";

// These subpaths come from Clerk's prebuilt SignIn and SignUp routers.
// The app owns only these document reads, not arbitrary catchall children.
const CLERK_SESSION_STEPS = ["tasks", "tasks/choose-organization", "tasks/reset-password", "tasks/setup-mfa"];
const CLERK_SIGN_UP_STEPS = [
  "protect-check", "verify-email-address", "verify-phone-number", "sso-callback", "verify", "continue",
  "continue/protect-check", "continue/verify-email-address", "continue/verify-phone-number",
  ...CLERK_SESSION_STEPS, "enterprise-connections",
];
const CLERK_AUTH_PATHS = new Set([
  CASTER_SIGN_IN_PATH,
  CASTER_SIGN_UP_PATH,
  ...[
    "protect-check", "factor-one", "factor-two", "client-trust", "reset-password", "reset-password-success",
    "sso-callback", "verify", "choose", "choose-wallet", ...CLERK_SESSION_STEPS,
    "create", ...CLERK_SIGN_UP_STEPS.map((step) => `create/${step}`),
  ].map((step) => `${CASTER_SIGN_IN_PATH}/${step}`),
  ...[...CLERK_SIGN_UP_STEPS, "choose-wallet"].map((step) => `${CASTER_SIGN_UP_PATH}/${step}`),
]);

export function isCasterInvitationRead(pathname: string, method: string): boolean {
  return pathname === CASTER_INVITATION_PATH && (method === "GET" || method === "HEAD");
}

export function isCasterPublicHomeRead(pathname: string, method: string): boolean {
  return pathname === "/" && (method === "GET" || method === "HEAD");
}

export function casterProfileDocumentSegment(pathname: string, method: string): string | null {
  if ((method !== "GET" && method !== "HEAD") || pathname === CASTER_INVITATION_PATH ||
    !pathname.startsWith(`${CASTER_DIRECTORY_PATH}/`)) return null;
  const segment = pathname.slice(CASTER_DIRECTORY_PATH.length + 1);
  return segment && !segment.includes("/") ? segment : null;
}

// Explicit registration/authentication reads and dedicated route-handler POSTs.
// POSTs to React page routes can invoke Server Actions and are never exempt.
export function casterRouteAccess(pathname: string, method: string, enabled: boolean) {
  if (!enabled) return null;
  if (method === "GET" || method === "HEAD") {
    if (pathname === CASTER_STUDIO_PATH) return "studio";
    if (CLERK_AUTH_PATHS.has(pathname)) return "auth";
    if (pathname === CASTER_DIRECTORY_PATH ||
      isCasterPublicSlug(casterProfileDocumentSegment(pathname, method))) {
      return "public-page";
    }
    if (pathname.startsWith(`${CASTER_PUBLIC_MEDIA_PATH}/`)) {
      const parts = pathname.slice(CASTER_PUBLIC_MEDIA_PATH.length + 1).split("/");
      if (parts.length === 3 && isCasterPublicSlug(parts[0]) && isCasterMediaId(parts[1]) && isCasterMediaId(parts[2])) {
        return "public-media";
      }
    }
    if (pathname.startsWith(`${CASTER_MEDIA_PATH}/`) && isCasterMediaId(pathname.slice(CASTER_MEDIA_PATH.length + 1))) {
      return "protected-api";
    }
  }
  if (method === "POST") {
    if (pathname === CASTER_CLAIM_PATH || pathname === CASTER_LEGAL_PATH || pathname === CASTER_SIGN_OUT_PATH ||
      pathname === CASTER_APPLICATION_PATH || pathname === CASTER_MEDIA_PATH || pathname === CASTER_PROFILE_PATH ||
      pathname === CASTER_TOURNAMENT_VIDEO_PATH) {
      return "protected-api";
    }
  }
  return null;
}
