"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  Clock3,
  MessageSquareText,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissDashboardNotifications } from "@/app/dashboard/actions";
import type { DashboardNotification } from "@/lib/player-dashboard";

export default function DashboardNotifications({
  notifications: initialNotifications,
}: {
  notifications: DashboardNotification[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<DashboardNotification | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const actionRequired = notifications.filter(
    (notification) =>
      notification.status === "rejected" ||
      notification.status === "resubmission_requested"
  ).length;
  const allSelected =
    notifications.length > 0 && selectedIds.size === notifications.length;

  useEffect(() => {
    if (!selected) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  const deleteNotifications = (
    notificationIds: string[],
    deleteAll = false
  ) => {
    if ((!deleteAll && notificationIds.length === 0) || pending) return;

    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      for (const notificationId of notificationIds) {
        formData.append("notificationId", notificationId);
      }
      if (deleteAll) formData.set("deleteAll", "true");

      const result = await dismissDashboardNotifications(formData);
      setMessage(result.message);

      if (result.status === "error") return;

      const dismissed = new Set(result.dismissedIds);
      setNotifications((current) =>
        current.filter((notification) => !dismissed.has(notification.id))
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const dismissedId of dismissed) next.delete(dismissedId);
        return next;
      });
      if (selected && dismissed.has(selected.id)) setSelected(null);
      router.refresh();
    });
  };

  const toggleSelected = (notificationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  };

  return (
    <section className="relative mt-8 max-w-xl">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-orange-500/25 bg-[linear-gradient(135deg,rgba(249,115,22,0.09),rgba(255,255,255,0.03))] p-5 text-left shadow-xl shadow-black/20 transition hover:border-orange-400/45"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <Bell size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black uppercase tracking-[0.18em] text-white">
              Notifications
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400">
              {notifications.length === 0
                ? "No match messages"
                : `${notifications.length} match ${
                    notifications.length === 1 ? "message" : "messages"
                  }`}
              {actionRequired > 0
                ? ` · ${actionRequired} require action`
                : ""}
            </span>
          </span>
        </span>
        <ChevronDown
          size={19}
          className={`shrink-0 text-zinc-400 transition ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="relative z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12]/95 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {notifications.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">
                Match submissions and administrator decisions will appear here.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        allSelected
                          ? new Set()
                          : new Set(
                              notifications.map(
                                (notification) => notification.id
                              )
                            )
                      )
                    }
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/30 hover:text-white disabled:opacity-50"
                  >
                    <CheckSquare2 size={14} />
                    {allSelected ? "Clear Selection" : "Select All"}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotifications([...selectedIds])
                      }
                      disabled={pending || selectedIds.size === 0}
                      className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-200 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Delete Selected
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotifications([], true)
                      }
                      disabled={pending}
                      className="rounded-lg bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      Delete All
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      checked={selectedIds.has(notification.id)}
                      pending={pending}
                      onToggle={() => toggleSelected(notification.id)}
                      onOpen={() => setSelected(notification)}
                      onDelete={() =>
                        deleteNotifications([notification.id])
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {message && (
              <p
                aria-live="polite"
                className="border-t border-white/10 px-4 py-3 text-xs text-zinc-400"
              >
                {pending ? "Updating notifications..." : message}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <NotificationModal
            notification={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function NotificationRow({
  notification,
  checked,
  pending,
  onToggle,
  onOpen,
  onDelete,
}: {
  notification: DashboardNotification;
  checked: boolean;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const content = notificationContent(notification);
  const Icon = content.icon;

  return (
    <div className="flex items-start gap-2 rounded-xl px-2 py-2 transition hover:bg-white/5">
      <label className="mt-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={pending}
          aria-label={`Select notification ${notification.submissionNumber}`}
          className="h-4 w-4 accent-orange-500"
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-1 py-1 text-left"
      >
        <span className={`mt-0.5 shrink-0 ${content.iconClassName}`}>
          <Icon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">
            {content.title}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-500">
            {notification.tournamentName} · Submission #
            {notification.submissionNumber}
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600">
          {formatCompactDate(
            notification.reviewedAt ?? notification.submittedAt
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={`Delete notification ${notification.submissionNumber}`}
        className="mt-0.5 shrink-0 rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function NotificationModal({
  notification,
  onClose,
}: {
  notification: DashboardNotification;
  onClose: () => void;
}) {
  const content = notificationContent(notification);
  const Icon = content.icon;

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label="Close notification"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
      />
      <motion.article
        role="dialog"
        aria-modal="true"
        aria-labelledby={`notification-${notification.id}`}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_80px_rgba(249,115,22,0.16)]"
      >
        <header className="flex items-start justify-between gap-5 border-b border-white/10 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 ${content.iconClassName}`}
            >
              <Icon size={22} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                Match Notification
              </p>
              <h2
                id={`notification-${notification.id}`}
                className="mt-2 text-2xl font-black text-white"
              >
                {content.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {content.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2.5 text-zinc-400 transition hover:border-orange-400/40 hover:text-white"
          >
            <X size={19} />
          </button>
        </header>

        <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-8">
          <Detail label="Tournament" value={notification.tournamentName} />
          <Detail
            label="Match"
            value={`${notification.roundName} · Match ${notification.matchNumber}`}
          />
          <Detail
            label="Submission"
            value={`#${notification.submissionNumber} · Game ${notification.gameNumber}`}
          />
          <Detail label="Opponent" value={notification.opponentName} />
          <Detail label="Reported Winner" value={notification.reportedWinner} />
          <Detail label="Reported Loser" value={notification.reportedLoser} />
          <Detail label="Reported Score" value={notification.reportedScore} />
          <Detail label="Status" value={formatStatus(notification.status)} />
          <Detail
            label={notification.reviewedAt ? "Reviewed" : "Submitted"}
            value={formatDate(
              notification.reviewedAt ?? notification.submittedAt
            )}
          />
        </div>

        {notification.reviewNotes && (
          <div className="mx-6 mb-6 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5 sm:mx-8 sm:mb-8">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-200">
              <MessageSquareText size={15} />
              Administrator Message
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {notification.reviewNotes}
            </p>
          </div>
        )}
      </motion.article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function notificationContent(notification: DashboardNotification) {
  if (notification.status === "approved") {
    return {
      title: "Match result approved",
      message: "The official result has been approved and recorded.",
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "rejected") {
    return {
      title: "Match result rejected",
      message:
        "Review the administrator message before submitting corrected evidence.",
      icon: XCircle,
      iconClassName: "text-red-300",
    };
  }
  if (notification.status === "resubmission_requested") {
    return {
      title: "Result resubmission requested",
      message:
        "The administrator requires a corrected result or additional proof.",
      icon: RotateCcw,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.submittedByViewer) {
    return {
      title: `Submission #${notification.submissionNumber} is under review`,
      message: "Your match result was submitted successfully.",
      icon: Clock3,
      iconClassName: "text-sky-300",
    };
  }

  return {
    title: "Your opponent submitted a match result",
    message:
      "The reported result is now under administrator review. Open this message to inspect the report.",
    icon: Bell,
    iconClassName: "text-orange-300",
  };
}

function formatStatus(status: DashboardNotification["status"]) {
  return {
    pending: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmission_requested: "Resubmission Requested",
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
