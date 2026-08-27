"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon, Megaphone, Upload, Video, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createAnnouncementMediaUpload,
  discardAnnouncementMediaUpload,
  publishAnnouncement,
  withdrawAnnouncement,
} from "@/app/admin/announcements/actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  ANNOUNCEMENT_LIMITS,
  getAnnouncementMediaExtension,
} from "@/lib/announcement-contract";
import type {
  AdminAnnouncement,
  AdminAnnouncementTournamentOption,
} from "@/lib/announcements";
import { supabase } from "@/lib/supabase";

const acceptedMediaTypes =
  "image/jpeg,image/png,image/webp,video/mp4,video/webm";
const inputClass =
  "mt-2 min-h-11 w-full min-w-0 border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-400/50";
const textareaClass = `${inputClass} py-3`;

export default function AdminAnnouncements({
  announcements,
  loadFailed,
  tournamentOptions,
  tournamentOptionsLoadFailed,
}: {
  announcements: AdminAnnouncement[];
  loadFailed: boolean;
  tournamentOptions: AdminAnnouncementTournamentOption[];
  tournamentOptionsLoadFailed: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaDescription, setMediaDescription] = useState("");
  const [linkToTournament, setLinkToTournament] = useState(false);
  const [linkedTournamentId, setLinkedTournamentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [withdrawTarget, setWithdrawTarget] =
    useState<AdminAnnouncement | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedTournament = tournamentOptions.find(
    (tournament) => tournament.id === linkedTournamentId
  );

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  const clearMedia = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setMediaDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const selectMedia = (selected: File | undefined) => {
    if (!selected) return;
    const extension = getAnnouncementMediaExtension({
      fileName: selected.name,
      contentType: selected.type,
      size: selected.size,
    });
    if (!extension) {
      clearMedia();
      setNotice({
        tone: "error",
        message:
          "Choose one JPG, JPEG, PNG, or WEBP image up to 10 MiB, or one MP4 or WEBM video up to 50 MiB.",
      });
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(selected);
    setFile(selected);
    setPreviewUrl(objectUrlRef.current);
    setNotice(null);
  };

  const closeWithdrawalDialog = useCallback(() => {
    setWithdrawTarget(null);
    setWithdrawError(null);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || loadFailed) return;
    if (file && !mediaDescription.trim()) {
      setNotice({
        tone: "error",
        message: "Add a concise accessibility description for the media.",
      });
      return;
    }
    if (linkToTournament && !linkedTournamentId) {
      setNotice({
        tone: "error",
        message: "Select an existing Tournament.",
      });
      return;
    }

    setPending(true);
    setNotice(null);
    let uploadedPath: string | null = null;
    try {
      if (file) {
        const upload = await createAnnouncementMediaUpload({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });
        uploadedPath = upload.path;
        const { error } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, file, {
            contentType: file.type,
          });
        if (error) throw new Error("upload-failed");
      }

      const result = await publishAnnouncement({
        title,
        body,
        mediaPath: uploadedPath,
        mediaDescription: file ? mediaDescription : null,
        linkToTournament,
        linkedTournamentId: linkToTournament ? linkedTournamentId : null,
      });
      if (!result.ok) {
        if (uploadedPath) {
          await discardAnnouncementMediaUpload(uploadedPath).catch(
            () => undefined
          );
        }
        setNotice({ tone: "error", message: result.message });
        return;
      }

      setTitle("");
      setBody("");
      setLinkToTournament(false);
      setLinkedTournamentId("");
      clearMedia();
      setNotice({
        tone: "success",
        message: "Announcement published immediately.",
      });
      router.refresh();
    } catch {
      if (uploadedPath) {
        await discardAnnouncementMediaUpload(uploadedPath).catch(
          () => undefined
        );
      }
      setNotice({
        tone: "error",
        message: "The announcement could not be published. Try again.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-32 text-white sm:px-6 sm:pt-36 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="text-sm font-bold text-orange-300 hover:text-orange-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
        >
          ← Admin Dashboard
        </Link>

        <header className="mt-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">
            Official broadcast channel
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Announcements
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Publish immutable plain-text updates with no media, one image, or
            one video. Withdrawal preserves the audit record.
          </p>
        </header>

        <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.78fr)]">
          <form
            onSubmit={submit}
            className="min-w-0 border border-white/10 bg-zinc-950/80 p-5 sm:p-7"
          >
            <h2 className="text-xl font-black">Publish announcement</h2>

            <label className="mt-6 block min-w-0">
              <span className="text-sm font-bold">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={ANNOUNCEMENT_LIMITS.title}
                disabled={pending || loadFailed}
                className={inputClass}
              />
            </label>

            <label className="mt-5 block min-w-0">
              <span className="text-sm font-bold">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
                maxLength={ANNOUNCEMENT_LIMITS.body}
                rows={8}
                disabled={pending || loadFailed}
                className={textareaClass}
              />
            </label>

            <div className="mt-5 border border-white/10 bg-black/30 p-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-white">
                <input
                  type="checkbox"
                  checked={linkToTournament}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setLinkToTournament(checked);
                    if (!checked) setLinkedTournamentId("");
                    setNotice(null);
                  }}
                  disabled={
                    pending ||
                    loadFailed ||
                    tournamentOptionsLoadFailed ||
                    tournamentOptions.length === 0
                  }
                  className="h-5 w-5 shrink-0 accent-orange-500"
                />
                <span>Link this announcement to a Tournament</span>
              </label>

              {tournamentOptionsLoadFailed ? (
                <p role="alert" className="mt-2 text-xs leading-5 text-red-200">
                  Tournament choices could not be loaded. General announcements
                  remain available.
                </p>
              ) : tournamentOptions.length === 0 ? (
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  No Tournaments are available to link. General announcements
                  remain available.
                </p>
              ) : null}

              {linkToTournament ? (
                <label className="mt-4 block min-w-0">
                  <span className="text-sm font-bold">Select Tournament</span>
                  <select
                    value={linkedTournamentId}
                    onChange={(event) => {
                      setLinkedTournamentId(event.target.value);
                      setNotice(null);
                    }}
                    required
                    disabled={pending || loadFailed}
                    className={inputClass}
                  >
                    <option value="">Select Tournament</option>
                    {tournamentOptions.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.title} — {formatTournamentStatus(
                          tournament.status
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-5 min-w-0">
              <span className="text-sm font-bold">Optional media</span>
              <div className="mt-2 border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-orange-400/40 bg-orange-500/10 px-5 font-black text-orange-200 transition hover:bg-orange-500/20">
                    <Upload size={17} aria-hidden="true" />
                    Choose image or video
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={acceptedMediaTypes}
                      disabled={pending || loadFailed}
                      onChange={(event) => {
                        selectMedia(event.target.files?.[0]);
                      }}
                      className="sr-only"
                    />
                  </label>
                  {file ? (
                    <button
                      type="button"
                      onClick={clearMedia}
                      disabled={pending || loadFailed}
                      className="min-h-11 border border-white/15 px-4 font-bold text-zinc-300 hover:text-white disabled:opacity-50"
                    >
                      Remove media
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Images: JPG, PNG, WebP up to 10 MiB. Videos: MP4, WebM up
                  to 50 MiB. One media item only.
                </p>
              </div>
            </div>

            {file ? (
              <label className="mt-5 block min-w-0">
                <span className="text-sm font-bold">
                  Media description
                </span>
                <input
                  value={mediaDescription}
                  onChange={(event) => setMediaDescription(event.target.value)}
                  required
                  maxLength={ANNOUNCEMENT_LIMITS.mediaDescription}
                  disabled={pending || loadFailed}
                  className={inputClass}
                  placeholder="Describe the important visual or video content"
                />
              </label>
            ) : null}

            <section
              aria-label="Announcement preview"
              className="mt-7 overflow-hidden border border-orange-400/25 bg-black/35"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                <Megaphone size={15} aria-hidden="true" /> Preview
              </div>
              {previewUrl && file?.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={mediaDescription || "Selected announcement image preview"}
                  className="max-h-80 w-full bg-black object-contain"
                />
              ) : null}
              {previewUrl && file?.type.startsWith("video/") ? (
                <video
                  src={previewUrl}
                  controls
                  preload="metadata"
                  aria-label={mediaDescription || "Selected announcement video preview"}
                  className="max-h-80 w-full bg-black object-contain"
                />
              ) : null}
              {!previewUrl ? (
                <div className="grid min-h-32 place-items-center text-zinc-600">
                  <div className="flex items-center gap-3">
                    <ImageIcon aria-hidden="true" />
                    <Video aria-hidden="true" />
                  </div>
                </div>
              ) : null}
              <div className="min-w-0 p-5">
                <h3 className="break-words text-xl font-black">
                  {title || "Announcement title"}
                </h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
                  {body || "Announcement message preview."}
                </p>
                {linkToTournament && selectedTournament ? (
                  <span className="mt-5 inline-flex min-h-11 items-center border border-orange-400/40 bg-orange-500/10 px-4 text-sm font-black text-orange-200">
                    View Tournament
                  </span>
                ) : null}
              </div>
            </section>

            {notice ? (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={`mt-5 border p-3 text-sm font-bold ${
                  notice.tone === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-red-500/30 bg-red-500/10 text-red-200"
                }`}
              >
                {notice.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending || loadFailed}
              className="mt-6 min-h-12 w-full bg-orange-500 px-6 font-black text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "Publishing…" : "Publish now"}
            </button>
          </form>

          <section className="min-w-0" aria-labelledby="announcement-history">
            <h2 id="announcement-history" className="text-xl font-black">
              Publication history
            </h2>
            {loadFailed ? (
              <p
                role="alert"
                className="mt-4 border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200"
              >
                Announcement history could not be loaded. Publishing remains
                disabled until a clean reload.
              </p>
            ) : null}
            {!loadFailed && announcements.length === 0 ? (
              <p className="mt-4 border border-white/10 bg-black/25 p-5 text-sm text-zinc-400">
                No announcements have been published.
              </p>
            ) : null}
            <ol className="mt-4 grid gap-4">
              {announcements.map((announcement) => (
                <li
                  key={announcement.id}
                  className="min-w-0 border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-black">
                        {announcement.title}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        <HydrationSafeLocalDateTime
                          value={announcement.publishedAt}
                          fallback="Publication time unavailable"
                          options={{ dateStyle: "medium", timeStyle: "short" }}
                        />
                      </p>
                    </div>
                    <span
                      className={`shrink-0 border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        announcement.withdrawnAt
                          ? "border-zinc-600 text-zinc-500"
                          : "border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      {announcement.withdrawnAt ? "Withdrawn" : "Active"}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">
                    {announcement.body}
                  </p>
                  {!announcement.withdrawnAt ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawError(null);
                        setWithdrawTarget(announcement);
                      }}
                      disabled={pending || loadFailed}
                      className="mt-4 min-h-11 border border-red-500/30 px-4 text-sm font-black text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Withdraw announcement
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {withdrawTarget ? (
        <WithdrawalDialog
          announcement={withdrawTarget}
          pending={pending}
          error={withdrawError}
          onCancel={closeWithdrawalDialog}
          onConfirm={async () => {
            setPending(true);
            setNotice(null);
            setWithdrawError(null);
            try {
              const result = await withdrawAnnouncement(withdrawTarget.id);
              if (!result.ok) {
                setWithdrawError(result.message);
                return;
              }
              closeWithdrawalDialog();
              setNotice({
                tone: "success",
                message: result.mediaCleanupWarning
                  ? "Announcement withdrawn. Its media could not be retired immediately, but it is no longer discoverable in the public feed."
                  : "Announcement withdrawn.",
              });
              router.refresh();
            } catch {
              setWithdrawError("The announcement could not be withdrawn.");
            } finally {
              setPending(false);
            }
          }}
        />
      ) : null}
    </main>
  );
}

function formatTournamentStatus(
  status: AdminAnnouncementTournamentOption["status"]
) {
  if (status === "registration_open") return "Registration Open";
  if (status === "in_progress") return "In Progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function WithdrawalDialog({
  announcement,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  announcement: AdminAnnouncement;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []
      );
      if (!dialog || focusable.length === 0) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={pending}
        aria-labelledby="withdraw-announcement-title"
        aria-describedby="withdraw-announcement-description"
        tabIndex={-1}
        className="w-full max-w-lg border border-red-500/30 bg-zinc-950 p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="withdraw-announcement-title" className="text-xl font-black">
            Withdraw announcement?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close withdrawal confirmation"
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-white/10 text-zinc-300"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <p
          id="withdraw-announcement-description"
          className="mt-4 break-words text-sm leading-6 text-zinc-300"
        >
          “{announcement.title}” will disappear from the public feed and unread
          calculations. The audit record remains and cannot be restored here.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-4 border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-200"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 border border-white/15 px-5 font-black text-zinc-200 disabled:opacity-50"
          >
            Keep announcement
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={pending}
            className="min-h-11 bg-red-600 px-5 font-black text-white disabled:opacity-50"
          >
            {pending ? "Withdrawing…" : "Withdraw announcement"}
          </button>
        </div>
      </div>
    </div>
  );
}
