import type { AnchorHTMLAttributes } from "react";
export default function FixtureLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || !href?.startsWith("/")) return;
    event.preventDefault();
    const target = new URL(href, location.origin);
    if (target.pathname !== "/admin/operations") return;
    const next = new URL(location.href);
    target.searchParams.forEach((value, key) => next.searchParams.set(key, value));
    next.hash = target.hash;
    location.assign(next);
  }} />;
}
