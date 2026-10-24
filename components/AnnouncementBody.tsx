import { Fragment, type ReactNode } from "react";
import {
  parseAnnouncementDocument,
  type AnnouncementBlockNode,
  type AnnouncementInlineNode,
} from "@/lib/announcement-document";
import styles from "./AnnouncementTypography.module.css";

function renderInline(node: AnnouncementInlineNode, key: number): ReactNode {
  let content: ReactNode = node.type === "text" ? node.text : <br />;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        content = <strong>{content}</strong>;
        break;
      case "italic":
        content = <em>{content}</em>;
        break;
      case "underline":
        content = <u>{content}</u>;
        break;
      case "link":
        content = <a href={mark.attrs.href}>{content}</a>;
        break;
    }
  }
  return <Fragment key={key}>{content}</Fragment>;
}

function renderBlock(node: AnnouncementBlockNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderInlineContent(node.content)}</p>;
    case "heading":
      return node.attrs.level === 3
        ? <h3 key={key}>{renderInlineContent(node.content)}</h3>
        : <h4 key={key}>{renderInlineContent(node.content)}</h4>;
    case "bulletList":
      return <ul key={key}>{node.content.map((item, index) => <li key={index}>{item.content.map(renderBlock)}</li>)}</ul>;
    case "orderedList":
      return <ol key={key} start={node.attrs.start}>{node.content.map((item, index) => <li key={index}>{item.content.map(renderBlock)}</li>)}</ol>;
  }
}

function renderInlineContent(content: AnnouncementInlineNode[] | undefined): ReactNode {
  return <>{content?.map(renderInline)}{content?.at(-1)?.type === "hardBreak" ? <br aria-hidden="true" /> : null}</>;
}

type AnnouncementBodyProps = {
  body: string;
  bodyDocument?: unknown;
  className?: string;
};

/** Render a validated element tree; legacy/invalid content remains escaped text. */
export default function AnnouncementBody({ body, bodyDocument, className = "" }: AnnouncementBodyProps) {
  const document = parseAnnouncementDocument(bodyDocument);
  if (!document) {
    return <p className={`${styles.typography} whitespace-pre-wrap ${className}`}>{body}</p>;
  }
  return <div className={`${styles.typography} ${className}`}>{document.doc.content.map(renderBlock)}</div>;
}
