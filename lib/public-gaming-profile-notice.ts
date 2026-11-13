export const PUBLIC_PROFILE_NOTICE_VERSION = "public-gaming-profile-v1";
export const PUBLIC_PROFILE_NOTICE_PATH = "/account/public-profile-notice";
export const ACCOUNT_CLOSE_PATH = "/account/close";
export const PUBLIC_PROFILE_NOTICE_SAVE_PATH = "/api/account/public-profile-notice";
export const ACCOUNT_CLOSE_SAVE_PATH = "/api/account/close";
export const NOTICE_LAYOUT_HEADER = "x-ironclad-notice-layout";

const DOCUMENT_PATHS = new Set(["/privacy", "/terms", "/rules", "/rules/public-gaming-profile"]);

export function isPublicProfileNoticeInstalled() {
  return process.env.PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED === "true";
}

export function isNoticeAccessPage(pathname: string) {
  return pathname === PUBLIC_PROFILE_NOTICE_PATH || pathname === ACCOUNT_CLOSE_PATH;
}

export function isNoticeAccessDocument(pathname: string) {
  return DOCUMENT_PATHS.has(pathname) || /^\/documents-rules-ppa\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/.test(pathname);
}

export function isNoticeAccessPost(pathname: string) {
  return pathname === PUBLIC_PROFILE_NOTICE_SAVE_PATH || pathname === ACCOUNT_CLOSE_SAVE_PATH;
}

export function noticeReturnPath(candidate: unknown) {
  if (typeof candidate !== "string" || candidate.length > 2048 ||
    !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(candidate)) return "/";

  try {
    const url = new URL(candidate, "https://ironclad.invalid");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://ironclad.invalid" || path.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(path) || path.startsWith("/account/") ||
      path === "/sign-in" || path.startsWith("/sign-in/") ||
      path === "/sign-up" || path.startsWith("/sign-up/") ||
      (path.startsWith("/api/") && path !== "/api/notifications/click")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function buildPublicProfileNoticeUrl(requestUrl: URL) {
  const returnTo = noticeReturnPath(`${requestUrl.pathname}${requestUrl.search}`);
  const notice = new URL(PUBLIC_PROFILE_NOTICE_PATH, requestUrl);
  notice.searchParams.set("returnTo", returnTo);
  return notice;
}
