"use client";

import {
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createTournamentMedia,
  removeTournamentMedia,
  setTournamentMediaPublished,
  updateTournamentMedia,
  type TournamentMediaMatchOption,
} from "@/app/admin/tournaments/media-actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  TOURNAMENT_MEDIA_LIMITS,
  TOURNAMENT_MEDIA_TYPES,
  type TournamentMediaAdminItem,
  type TournamentMediaType,
} from "@/lib/tournament-media";

type MediaFormState = {
  title: string;
  url: string;
  mediaType: TournamentMediaType;
  description: string;
  matchId: string;
  publication: "hidden" | "published";
};

const emptyForm: MediaFormState = {
  title: "",
  url: "",
  mediaType: "full_tournament",
  description: "",
  matchId: "",
  publication: "hidden",
};

const mediaTypeLabels: Record<TournamentMediaType, string> = {
  full_tournament: "Full Tournament",
  match_cast: "Match Cast",
  video: "Video",
  other: "Other",
};

const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/45 px-3.5 text-base text-white outline-none transition focus:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-400/40 sm:text-sm";

export default function AdminTournamentMedia({
  items,
  loadFailed,
  matchOptions,
  tournamentId,
  tournamentTitle,
}: {
  items: TournamentMediaAdminItem[];
  loadFailed: boolean;
  matchOptions: TournamentMediaMatchOption[];
  tournamentId: string;
  tournamentTitle: string;
}) {
  const router = useRouter();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formOpenerRef = useRef<HTMLElement | null>(null);
  const confirmRemoveButtonRef = useRef<HTMLButtonElement>(null);
  const removeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MediaFormState>(emptyForm);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!formOpen) return;

    const timer = window.setTimeout(() => {
      const formElement = formRef.current;
      if (typeof formElement?.scrollIntoView === "function") {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      titleInputRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editingId, formOpen]);

  useEffect(() => {
    if (!removeTargetId) return;

    const timer = window.setTimeout(() => {
      confirmRemoveButtonRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [removeTargetId]);

  const rememberFormOpener = (opener: HTMLElement) => {
    formOpenerRef.current = opener;
  };

  const restoreFormOpener = () => {
    const opener = formOpenerRef.current;
    formOpenerRef.current = null;
    window.setTimeout(() => {
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      } else {
        addButtonRef.current?.focus({ preventScroll: true });
      }
    }, 0);
  };

  const beginCreate = (opener: HTMLElement) => {
    if (loadFailed) return;
    rememberFormOpener(opener);
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
    setRemoveTargetId(null);
    setNotice(null);
  };

  const beginEdit = (item: TournamentMediaAdminItem, opener: HTMLElement) => {
    rememberFormOpener(opener);
    setEditingId(item.id);
    setForm({
      title: item.title,
      url: item.url,
      mediaType: item.mediaType,
      description: item.description ?? "",
      matchId: item.matchId ?? "",
      publication: item.published ? "published" : "hidden",
    });
    setFormOpen(true);
    setRemoveTargetId(null);
    setNotice(null);
  };

  const closeForm = () => {
    if (pendingAction === "save") return;
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(false);
    restoreFormOpener();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingAction) return;

    setPendingAction("save");
    setNotice(null);
    const input = {
      mediaId: editingId,
      tournamentId,
      title: form.title,
      url: form.url,
      mediaType: form.mediaType,
      description: form.description || null,
      matchId: form.matchId || null,
      published: form.publication === "published",
    };

    try {
      const result = editingId
        ? await updateTournamentMedia(input)
        : await createTournamentMedia(input);
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }

      setNotice({
        tone: "success",
        message: editingId
          ? "Media link updated."
          : input.published
            ? "Media link created and published."
            : "Media link created and kept hidden.",
      });
      setEditingId(null);
      setForm(emptyForm);
      setFormOpen(false);
      restoreFormOpener();
      router.refresh();
    } catch {
      setNotice({
        tone: "error",
        message: "The Tournament media change could not be completed. Try again.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const changePublication = async (item: TournamentMediaAdminItem) => {
    const action = `publication:${item.id}`;
    if (pendingAction) return;
    setPendingAction(action);
    setNotice(null);

    try {
      const result = await setTournamentMediaPublished({
        mediaId: item.id,
        tournamentId,
        published: !item.published,
      });
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }
      setNotice({
        tone: "success",
        message: item.published
          ? "Media link hidden from Players."
          : "Media link published for Players.",
      });
      router.refresh();
    } catch {
      setNotice({
        tone: "error",
        message: "The Tournament media change could not be completed. Try again.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const cancelRemove = (mediaId: string) => {
    setRemoveTargetId(null);
    window.setTimeout(
      () => removeButtonRefs.current.get(mediaId)?.focus({ preventScroll: true }),
      0
    );
  };

  const confirmRemove = async (item: TournamentMediaAdminItem) => {
    const action = `remove:${item.id}`;
    if (pendingAction) return;
    setPendingAction(action);
    setNotice(null);

    try {
      const result = await removeTournamentMedia({
        mediaId: item.id,
        tournamentId,
      });
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }
      if (editingId === item.id) {
        setEditingId(null);
        setForm(emptyForm);
        setFormOpen(false);
        formOpenerRef.current = null;
      }
      setRemoveTargetId(null);
      setNotice({ tone: "success", message: "Media link removed." });
      window.setTimeout(
        () => addButtonRef.current?.focus({ preventScroll: true }),
        0
      );
      router.refresh();
    } catch {
      setNotice({
        tone: "error",
        message: "The Tournament media change could not be completed. Try again.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      aria-labelledby="admin-tournament-media-title"
      className="min-w-0"
    >
      <div className="flex min-w-0 flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
            Tournament Media
          </p>
          <h3
            id="admin-tournament-media-title"
            className="mt-2 break-words text-2xl font-black text-white"
          >
            Media
          </h3>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-zinc-400">
            Manage official Tournament casts and external coverage for{" "}
            {tournamentTitle}. New entries stay hidden until you publish them.
          </p>
        </div>
        <button
          ref={addButtonRef}
          type="button"
          onClick={(event) => beginCreate(event.currentTarget)}
          disabled={loadFailed || Boolean(pendingAction)}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-black transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
        >
          <Plus aria-hidden="true" size={18} />
          Add Media
        </button>
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-2xl border p-4 text-sm font-bold ${
            notice.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      {formOpen && (
        <form
          ref={formRef}
          onSubmit={submit}
          className="mt-5 min-w-0 rounded-3xl border border-orange-400/25 bg-orange-500/[0.06] p-4 sm:p-6"
        >
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                {editingId ? "Edit media" : "New media"}
              </p>
              <h4 className="mt-2 break-words text-xl font-black text-white">
                {editingId ? "Update Tournament media" : "Add Tournament media"}
              </h4>
            </div>
            <button
              type="button"
              onClick={closeForm}
              disabled={pendingAction === "save"}
              aria-label="Close Tournament media form"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 text-zinc-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 text-sm font-bold text-zinc-200">
              Title
              <input
                ref={titleInputRef}
                required
                maxLength={TOURNAMENT_MEDIA_LIMITS.title}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>

            <label className="min-w-0 text-sm font-bold text-zinc-200">
              Type
              <select
                value={form.mediaType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mediaType: event.target.value as TournamentMediaType,
                  }))
                }
                className={inputClass}
              >
                {TOURNAMENT_MEDIA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {mediaTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>

            <div className="min-w-0 text-sm font-bold text-zinc-200 md:col-span-2">
              <label htmlFor="tournament-media-url">URL</label>
              <input
                id="tournament-media-url"
                required
                type="url"
                inputMode="url"
                pattern="https://.*"
                maxLength={TOURNAMENT_MEDIA_LIMITS.url}
                placeholder="https://"
                aria-describedby="tournament-media-url-help"
                value={form.url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
                className={inputClass}
              />
              <p
                id="tournament-media-url-help"
                className="mt-2 text-xs font-medium leading-5 text-zinc-400"
              >
                Use a complete HTTPS link beginning with https://.
              </p>
            </div>

            <label className="min-w-0 text-sm font-bold text-zinc-200 md:col-span-2">
              Description (optional)
              <textarea
                rows={3}
                maxLength={TOURNAMENT_MEDIA_LIMITS.description}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className={`${inputClass} py-3`}
              />
            </label>

            <label className="min-w-0 text-sm font-bold text-zinc-200">
              Associated Match (optional)
              <select
                value={form.matchId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    matchId: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">No Match association</option>
                {matchOptions.map((match) => (
                  <option key={match.id} value={match.id}>
                    {match.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm font-bold text-zinc-200">
              Publication state
              <select
                value={form.publication}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    publication: event.target.value as MediaFormState["publication"],
                  }))
                }
                className={inputClass}
              >
                <option value="hidden">Hidden</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeForm}
              disabled={pendingAction === "save"}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(pendingAction)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-black transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {pendingAction === "save" ? "Saving…" : "Save Media"}
            </button>
          </div>
        </form>
      )}

      {loadFailed ? (
        <div
          role="alert"
          className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-sm leading-6 text-red-100"
        >
          Tournament media could not be loaded. Refresh before making changes.
        </div>
      ) : items.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-white/15 p-8 text-center text-sm leading-6 text-zinc-400">
          No Tournament media links have been added yet.
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const match = item.matchId
              ? matchOptions.find((option) => option.id === item.matchId)
              : null;
            const publicationPending =
              pendingAction === `publication:${item.id}`;
            const removalPending = pendingAction === `remove:${item.id}`;
            const confirmingRemoval = removeTargetId === item.id;

            return (
              <article
                key={item.id}
                aria-labelledby={`tournament-media-title-${item.id}`}
                className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                  <span
                    className={`rounded-full border px-2.5 py-1 ${
                      item.published
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
                    }`}
                  >
                    {item.published ? "Published" : "Hidden"}
                  </span>
                  <span className="rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-orange-200">
                    {mediaTypeLabels[item.mediaType]}
                  </span>
                </div>

                <h4
                  id={`tournament-media-title-${item.id}`}
                  className="mt-4 break-words text-lg font-black text-white"
                >
                  {item.title}
                </h4>
                {item.description && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">
                    {item.description}
                  </p>
                )}
                <div className="mt-3 flex min-w-0 flex-col gap-1 text-xs text-zinc-400">
                  <span className="break-words">
                    {match?.label ?? (item.matchId ? "Associated Match" : "Tournament-wide")}
                  </span>
                  <span>
                    Updated{" "}
                    <HydrationSafeLocalDateTime
                      value={item.updatedAt}
                      fallback="date unavailable"
                    />
                  </span>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open media link: ${item.title}`}
                  className="mt-4 inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black text-zinc-200 transition hover:border-orange-400/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                >
                  <ExternalLink aria-hidden="true" size={17} />
                  Open media link
                </a>

                <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={(event) => beginEdit(item, event.currentTarget)}
                    disabled={Boolean(pendingAction)}
                    aria-label={`Edit ${item.title}`}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-zinc-200 transition hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50"
                  >
                    <Pencil aria-hidden="true" size={16} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void changePublication(item)}
                    disabled={Boolean(pendingAction)}
                    aria-label={`${item.published ? "Hide" : "Publish"} ${item.title}`}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-zinc-200 transition hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50"
                  >
                    {item.published ? (
                      <EyeOff aria-hidden="true" size={16} />
                    ) : (
                      <Eye aria-hidden="true" size={16} />
                    )}
                    {publicationPending
                      ? "Saving…"
                      : item.published
                        ? "Hide"
                        : "Publish"}
                  </button>
                  <button
                    ref={(element) => {
                      if (element) {
                        removeButtonRefs.current.set(item.id, element);
                      } else {
                        removeButtonRefs.current.delete(item.id);
                      }
                    }}
                    type="button"
                    onClick={() => setRemoveTargetId(item.id)}
                    disabled={Boolean(pendingAction)}
                    aria-label={`Remove ${item.title}`}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-red-500/25 px-3 py-2 text-sm font-black text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-50"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    Remove
                  </button>
                </div>

                {confirmingRemoval && (
                  <div
                    role="group"
                    aria-label={`Remove ${item.title}`}
                    className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4"
                  >
                    <p className="text-sm font-bold leading-6 text-red-100">
                      Remove this media link? This cannot be undone.
                    </p>
                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => cancelRemove(item.id)}
                        disabled={removalPending}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/15 px-3 py-2 text-sm font-black text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50 sm:w-auto"
                      >
                        Cancel
                      </button>
                      <button
                        ref={confirmRemoveButtonRef}
                        type="button"
                        onClick={() => void confirmRemove(item)}
                        disabled={removalPending}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-sm font-black text-white transition hover:bg-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-50 sm:w-auto"
                      >
                        {removalPending ? "Removing…" : "Confirm Remove"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
