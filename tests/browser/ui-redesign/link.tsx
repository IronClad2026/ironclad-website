import type { AnchorHTMLAttributes, ReactNode } from "react";
import { fixtureNavigate } from "./runtime";

type FixtureLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  children: ReactNode;
  prefetch?: boolean;
  scroll?: boolean;
};

export default function FixtureLink({ href, children, onClick, prefetch, scroll, ...props }: FixtureLinkProps) {
  void prefetch;
  void scroll;
  const destination = typeof href === "string" ? href : `${href.pathname ?? ""}?${new URLSearchParams(href.query)}`;
  return <a {...props} href={destination} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || !destination.startsWith("/")) return;
    event.preventDefault();
    fixtureNavigate(destination);
  }}>{children}</a>;
}
