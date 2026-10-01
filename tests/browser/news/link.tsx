import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import { fixtureNavigate } from "./runtime";

type FixtureLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  scroll?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

export default function FixtureLink({
  href,
  children,
  onClick,
  prefetch,
  scroll,
  ...props
}: FixtureLinkProps) {
  void prefetch;
  void scroll;
  return (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || !href.startsWith("/")) return;
      event.preventDefault();
      fixtureNavigate(href);
    }}>
      {children}
    </a>
  );
}
