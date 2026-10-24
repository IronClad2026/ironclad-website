"use client";

import { Extension } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Bold, Italic, Link2, List, ListOrdered, Redo2, Underline, Undo2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getAnnouncementPlainText,
  normalizeAnnouncementHref,
  parseAnnouncementDocument,
  type AnnouncementDocument,
} from "@/lib/announcement-document";
import { ANNOUNCEMENT_LIMITS } from "@/lib/announcement-contract";
import typography from "@/components/AnnouncementTypography.module.css";

const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };
const controlClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-transparent px-2 text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:opacity-35";

export default function AnnouncementEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: AnnouncementDocument | null;
  onChange: (document: AnnouncementDocument) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [linkSelection, setLinkSelection] = useState<{ from: number; to: number; href: string } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(() => [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      trailingNode: false,
      heading: { levels: [3, 4] },
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (href) => normalizeAnnouncementHref(href) !== null,
      },
    }),
    Extension.create({
      name: "announcementDocumentGuard",
      addProseMirrorPlugins() {
        return [new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            const document = parseAnnouncementDocument({ version: 1, doc: transaction.doc.toJSON() });
            if (!document || getAnnouncementPlainText(document).length > ANNOUNCEMENT_LIMITS.body) {
              setContentError("This edit exceeds the announcement content limits. Use up to 10,000 characters and keep formatting simple.");
              return false;
            }
            return true;
          },
        })];
      },
    }),
  ], []);

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: value?.doc ?? emptyDocument,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Message",
        "aria-multiline": "true",
        "aria-required": "true",
        "aria-describedby": `${id}-help ${id}-count`,
        class: `${typography.typography} min-h-56 px-4 py-3 outline-none`,
      },
      // ProseMirror's default plain-text paste collapses consecutive newlines.
      // A hard break for each newline keeps exactly the supplied spacing.
      clipboardTextParser(text, context) {
        const schema = context.doc.type.schema;
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        const content = lines.flatMap((line, index) => [
          ...(index ? [schema.nodes.hardBreak.create()] : []),
          ...(line ? [schema.text(line)] : []),
        ]);
        return new Slice(Fragment.from(schema.nodes.paragraph.create(null, content)), 0, 0);
      },
      // Pasted HTML is parsed only by the constrained editor schema. Remove
      // embedded/non-content elements before it reaches that parser.
      transformPastedHTML(html) {
        const document = new DOMParser().parseFromString(html, "text/html");
        normalizeWordLists(document);
        document.querySelectorAll("script,style,meta,link,iframe,object,embed,svg,img,video,audio,input,button,textarea,select").forEach((element) => element.remove());
        document.querySelectorAll("a").forEach((element) => {
          const href = normalizeAnnouncementHref(element.getAttribute("href"));
          if (!href) element.replaceWith(...element.childNodes);
          else {
            Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
            element.setAttribute("href", href);
          }
        });
        document.querySelectorAll("ol").forEach((element) => {
          // IronClad uses standard numbering regardless of Word's roman/alpha
          // list presentation; preserve the list and its numeric start.
          element.removeAttribute("type");
          element.removeAttribute("style");
        });
        document.querySelectorAll("h1,h2,h5,h6").forEach((element) => {
          const heading = document.createElement(element.tagName === "H1" ? "h3" : "h4");
          heading.append(...element.childNodes);
          element.replaceWith(heading);
        });
        return document.body.innerHTML;
      },
    },
    onUpdate({ editor: updatedEditor }) {
      const document = parseAnnouncementDocument({ version: 1, doc: updatedEditor.getJSON() });
      if (!document) return;
      lastEmittedRef.current = JSON.stringify(document.doc);
      setContentError(null);
      onChangeRef.current(document);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      link: current.isActive("link"),
      style: current.isActive("heading", { level: 3 }) ? "3" : current.isActive("heading", { level: 4 }) ? "4" : "paragraph",
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    } : null,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled && !linkSelection);
    editor.view.dom.setAttribute("aria-disabled", String(disabled));
  }, [editor, disabled, linkSelection]);

  useEffect(() => {
    if (!editor) return;
    const serialized = JSON.stringify(value?.doc ?? emptyDocument);
    if (serialized === lastEmittedRef.current) return;
    const current = parseAnnouncementDocument({ version: 1, doc: editor.getJSON() });
    if (serialized !== JSON.stringify(current?.doc ?? emptyDocument)) {
      editor.commands.setContent(value?.doc ?? emptyDocument, { emitUpdate: false });
    }
    lastEmittedRef.current = serialized;
  }, [editor, value]);

  const unavailable = disabled || !editor;
  const characterCount = value ? getAnnouncementPlainText(value).length : 0;

  return (
    <div className="mt-2 min-w-0">
      <div className={`min-w-0 border border-white/15 bg-black/40 transition focus-within:border-orange-400 ${disabled ? "opacity-60" : ""}`}>
        <div
          role="toolbar"
          aria-label="Message formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-zinc-900/70 p-1.5"
          onKeyDown={(event) => {
            if (!(event.target instanceof HTMLButtonElement) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),select:not([disabled])"));
            const index = controls.indexOf(event.target);
            const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + controls.length) % controls.length;
            event.preventDefault();
            controls[next]?.focus();
          }}
        >
          <select
            aria-label="Text style"
            disabled={unavailable}
            value={state?.style ?? "paragraph"}
            className="min-h-11 max-w-full rounded-sm border border-white/10 bg-zinc-950 px-2 text-sm font-bold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-35"
            onChange={(event) => {
              if (event.target.value === "paragraph") editor?.chain().focus().setParagraph().run();
              else editor?.chain().focus().setHeading({ level: event.target.value === "3" ? 3 : 4 }).run();
            }}
          >
            <option value="paragraph">Paragraph</option>
            <option value="3">Heading</option>
            <option value="4">Subheading</option>
          </select>
          <ToolbarButton label="Bold" shortcut="Ctrl/⌘+B" active={state?.bold} disabled={unavailable} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={18} /></ToolbarButton>
          <ToolbarButton label="Italic" shortcut="Ctrl/⌘+I" active={state?.italic} disabled={unavailable} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={18} /></ToolbarButton>
          <ToolbarButton label="Underline" shortcut="Ctrl/⌘+U" active={state?.underline} disabled={unavailable} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={18} /></ToolbarButton>
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden="true" />
          <ToolbarButton label="Bullet list" active={state?.bulletList} disabled={unavailable} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={18} /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={state?.orderedList} disabled={unavailable} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={18} /></ToolbarButton>
          <ToolbarButton label="Insert or edit link" active={state?.link} disabled={unavailable} onClick={() => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            setLinkSelection({ from, to, href: String(editor.getAttributes("link").href ?? "") });
          }}><Link2 size={18} /></ToolbarButton>
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden="true" />
          <ToolbarButton label="Undo" shortcut="Ctrl/⌘+Z" disabled={unavailable || !state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={18} /></ToolbarButton>
          <ToolbarButton label="Redo" shortcut="Ctrl/⌘+Shift+Z" disabled={unavailable || !state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={18} /></ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-5 text-zinc-500">
        <p id={`${id}-help`}>Enter for a paragraph · Shift+Enter for a line break.</p>
        <p id={`${id}-count`}>{characterCount.toLocaleString("en-US")} / 10,000</p>
      </div>
      {contentError ? <p role="alert" className="mt-2 text-sm text-red-200">{contentError}</p> : null}
      {linkSelection && editor ? (
        <AnnouncementLinkDialog
          initialHref={linkSelection.href}
          onCancel={() => setLinkSelection(null)}
          onApply={(href) => {
            const chain = editor.chain().setTextSelection({ from: linkSelection.from, to: linkSelection.to }).extendMarkRange("link");
            if (href) {
              if (linkSelection.from === linkSelection.to && !linkSelection.href) {
                chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
              } else chain.setLink({ href }).run();
            } else chain.unsetLink().run();
            setLinkSelection(null);
          }}
        />
      ) : null}
    </div>
  );
}

function normalizeWordLists(document: Document) {
  // Word's clipboard can represent lists as paragraphs plus an mso-list marker,
  // rather than semantic ul/ol elements. Convert consecutive supported items.
  document.querySelectorAll("p").forEach((paragraph) => {
    const list = /mso-list:\s*(l\d+)\s+level(\d+)\s+lfo(\d+)/i.exec(paragraph.getAttribute("style") ?? "");
    if (!list) return;
    const marker = Array.from(paragraph.querySelectorAll("span")).find((span) => /mso-list:\s*ignore/i.test(span.getAttribute("style") ?? ""));
    if (!marker) return;
    const markerText = marker.textContent?.trim() ?? "";
    const tag = /^(?:\d+|[a-z]+)[.)]/i.test(markerText) ? "ol" : "ul";
    const key = `${list[1]}-${list[2]}-${list[3]}-${tag}`;
    marker.remove();
    const previous = paragraph.previousElementSibling;
    const target = previous?.tagName.toLowerCase() === tag && previous.getAttribute("data-announcement-word-list") === key
      ? previous : document.createElement(tag);
    if (target !== previous) {
      target.setAttribute("data-announcement-word-list", key);
      const start = Number.parseInt(markerText, 10);
      if (tag === "ol" && Number.isSafeInteger(start) && start > 1 && start <= 1_000_000) target.setAttribute("start", String(start));
      paragraph.before(target);
    }
    const item = document.createElement("li");
    item.append(paragraph);
    target.append(item);
  });
  document.querySelectorAll("[data-announcement-word-list]").forEach((list) => list.removeAttribute("data-announcement-word-list"));
}

function ToolbarButton({ label, shortcut, active, disabled, onClick, children }: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={`${label}${shortcut ? ` (${shortcut})` : ""}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`${controlClass} ${active ? "border-orange-400/35 bg-orange-500/15 text-orange-200" : ""}`}
    ><span aria-hidden="true">{children}</span></button>
  );
}

function AnnouncementLinkDialog({ initialHref, onCancel, onApply }: {
  initialHref: string;
  onCancel: () => void;
  onApply: (href: string | null) => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [href, setHref] = useState(initialHref);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const apply = () => {
    const normalized = normalizeAnnouncementHref(href);
    if (!normalized) {
      setError("Enter an https:// or http:// URL, or a local path beginning with one /.");
      inputRef.current?.focus();
      return;
    }
    onApply(normalized);
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        className="w-full max-w-lg border border-orange-400/30 bg-zinc-950 p-5 shadow-2xl sm:p-6"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
          if (event.key === "Enter" && event.target === inputRef.current) { event.preventDefault(); event.stopPropagation(); apply(); }
          if (event.key !== "Tab") return;
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button,input") ?? []);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${id}-title`} className="text-xl font-black">Announcement link</h2>
          <button type="button" aria-label="Close link dialog" onClick={onCancel} className={controlClass}><X size={19} aria-hidden="true" /></button>
        </div>
        <label className="mt-4 block text-sm font-bold" htmlFor={`${id}-url`}>Link URL</label>
        <input
          ref={inputRef}
          id={`${id}-url`}
          type="text"
          inputMode="url"
          autoComplete="url"
          value={href}
          onChange={(event) => { setHref(event.target.value); setError(null); }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          className="mt-2 min-h-11 w-full border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-400/50"
          placeholder="https://example.com"
        />
        <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-zinc-400">Use a web address or a local path such as /tournaments. Select text first to turn it into a link.</p>
        {error ? <p role="alert" id={`${id}-error`} className="mt-3 text-sm text-red-200">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {initialHref ? <button type="button" onClick={() => onApply(null)} className="mr-auto min-h-11 border border-white/15 px-4 text-sm font-bold text-zinc-300">Remove link</button> : null}
          <button type="button" onClick={onCancel} className="min-h-11 border border-white/15 px-4 text-sm font-bold text-zinc-200">Cancel</button>
          <button type="button" onClick={apply} className="min-h-11 bg-orange-500 px-4 text-sm font-black text-black hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400">Apply link</button>
        </div>
      </div>
    </div>
  );
}
