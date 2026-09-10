import type { AnchorHTMLAttributes } from "react";

export default function FixtureLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }} />;
}