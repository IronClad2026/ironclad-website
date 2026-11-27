import Link from "next/link";

import type { ReadySource } from "@/lib/ready/contracts";
import ThoughtCloudShape from "./ThoughtCloudShape";
import styles from "./ReadyAssistant.module.css";

function safeHref(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !/[\\\p{Cc}]/u.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

export function ReadyCloudLink({ href: destination, label, onActivate }: { href: string; label: string; onActivate?: () => void }) {
  const href = safeHref(destination);
  if (!href) return null;
  const external = !href.startsWith("/");
  return (
    <Link className={styles.answer} data-answer-cloud="" href={href} prefetch={false} onClick={onActivate} onAuxClick={(event) => {
      if (event.button === 1) onActivate?.();
    }}
      target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      <ThoughtCloudShape variant="answer" />
      <span>{label}</span>
    </Link>
  );
}

export function ReadySources({ details, sources }: { details?: string; sources?: ReadySource[] }) {
  const links = sources?.flatMap((source) => {
    const href = safeHref(source.url);
    return href ? [{ ...source, href }] : [];
  }) ?? [];
  return <>
    {details && <details className={styles.replyDetails}>
      <summary>More detail</summary>
      <p>{details}</p>
    </details>}
    {links.length > 0 && <ul aria-label="Sources" className={styles.sources} role="list">
      {links.map(({ href, section, title }) => {
        const label = section ? `${title} · ${section}` : title;
        return <li key={`${href} ${section}`}>
          <Link aria-label={`${label} (opens in a new tab)`} href={href} prefetch={false} target="_blank" rel="noopener noreferrer">
            {label}
          </Link>
        </li>;
      })}
    </ul>}
  </>;
}
