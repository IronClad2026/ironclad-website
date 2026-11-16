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

export function ReadyCloudLink({ href: destination, label }: { href: string; label: string }) {
  const href = safeHref(destination);
  if (!href) return null;
  const external = !href.startsWith("/");
  return (
    <Link className={styles.answer} data-answer-cloud="" href={href} prefetch={false}
      target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
      <ThoughtCloudShape variant="answer" />
      <span>{label}</span>
    </Link>
  );
}

export function ReadySources({ details, sources }: { details?: string; sources?: ReadySource[] }) {
  return <>
    {details && <details className={styles.replyDetails}>
      <summary>More detail</summary>
      <p>{details}</p>
    </details>}
    {!!sources?.length && <ul className={styles.sources} aria-label="Sources">
      {sources.map((source) => {
        const href = safeHref(source.url);
        return href && <li key={source.url + source.section}>
          <Link href={href} prefetch={false} target="_blank" rel="noreferrer">
            {source.title}{source.section ? ` · ${source.section}` : ""}
          </Link>
        </li>;
      })}
    </ul>}
  </>;
}
