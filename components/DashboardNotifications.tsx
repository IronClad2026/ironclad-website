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
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  confirmDashboardMatchResult,
  dismissDashboardNotifications,
  disputeDashboardMatchResult,
  type NotificationActionResult,
  type NotificationDismissalResult,
} from "@/app/dashboard/actions";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  useOptionalLocale,
  useOptionalTranslations,
} from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/config";
import notificationsEnglish from "@/lib/i18n/dictionaries/en/notifications";
import { formatNumber, selectPlural } from "@/lib/i18n/format";
import type { MessageValues } from "@/lib/i18n/types";
import type { DashboardNotification } from "@/lib/player-dashboard";

type NotificationTranslator = (
  path: string,
  values?: MessageValues
) => string;

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
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const locale = useOptionalLocale();
  const t = useOptionalTranslations("notifications", notificationsEnglish);
  const actionRequired = notifications.filter(
    (notification) =>
      notification.canConfirm ||
      notification.canDispute ||
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

  useEffect(() => {
    if (
      notifications.every(
        (notification) => notification.confirmationDeadlineAt === null
      )
    ) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [notifications]);

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
      setMessage(localizeDismissalResult(result, locale, t));

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

  const respondToReportGroup = (
    notification: DashboardNotification,
    decision: "confirm" | "dispute",
    disputeNotes = ""
  ) => {
    if (!notification.reportGroupId || pending) return;

    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("reportGroupId", notification.reportGroupId ?? "");
      if (decision === "dispute") {
        formData.set("disputeNotes", disputeNotes);
      }

      const result =
        decision === "confirm"
          ? await confirmDashboardMatchResult(formData)
          : await disputeDashboardMatchResult(formData);
      setMessage(localizeNotificationActionResult(result, t));

      if (result.status === "success") {
        setSelected(null);
        router.refresh();
      }
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
              {t("dashboard.title")}
            </span>
            <span className="mt-1 block truncate text-xs text-zinc-400">
              {notifications.length === 0
                ? t("dashboard.noMessages")
                : pluralMessage(
                    notifications.length,
                    locale,
                    t,
                    "message"
                  )}
              {actionRequired > 0
                ? ` · ${pluralMessage(
                    actionRequired,
                    locale,
                    t,
                    "actionRequired"
                  )}`
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
                {t("dashboard.empty")}
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
                    {allSelected
                      ? t("dashboard.clearSelection")
                      : t("dashboard.selectAll")}
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
                      {t("dashboard.deleteSelected")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        deleteNotifications([], true)
                      }
                      disabled={pending}
                      className="rounded-lg bg-red-700 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      {t("dashboard.deleteAll")}
                    </button>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      checked={selectedIds.has(notification.id)}
                      now={now}
                      pending={pending}
                      locale={locale}
                      t={t}
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
                {pending ? t("dashboard.updating") : message}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <NotificationModal
            notification={selected}
            now={now}
            pending={pending}
            locale={locale}
            t={t}
            onRespond={respondToReportGroup}
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
  now,
  pending,
  locale,
  t,
  onToggle,
  onOpen,
  onDelete,
}: {
  notification: DashboardNotification;
  checked: boolean;
  now: number;
  pending: boolean;
  locale: Locale;
  t: NotificationTranslator;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const content = notificationContent(notification, t);
  const Icon = content.icon;

  return (
    <div className="flex items-start gap-2 rounded-xl px-2 py-2 transition hover:bg-white/5">
      <label className="mt-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={pending}
          aria-label={t("dashboard.selectNotification", {
            label: notificationLabel(notification, t),
          })}
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
            {notification.tournamentName} · {notificationLabel(notification, t)}
          </span>
          {notification.confirmationDeadlineAt &&
            notification.status === "pending_confirmation" && (
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-orange-300">
                {formatTimeRemaining(
                  notification.confirmationDeadlineAt,
                  now,
                  locale,
                  t
                )}
              </span>
            )}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600">
          <HydrationSafeLocalDateTime
            value={notification.reviewedAt ?? notification.submittedAt}
            fallback={t("dashboard.unavailable")}
            options={{ month: "short", day: "numeric" }}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={t("dashboard.deleteNotification", {
          label: notificationLabel(notification, t),
        })}
        className="mt-0.5 shrink-0 rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function NotificationModal({
  notification,
  now,
  pending,
  locale,
  t,
  onRespond,
  onClose,
}: {
  notification: DashboardNotification;
  now: number;
  pending: boolean;
  locale: Locale;
  t: NotificationTranslator;
  onRespond: (
    notification: DashboardNotification,
    decision: "confirm" | "dispute",
    disputeNotes?: string
  ) => void;
  onClose: () => void;
}) {
  const [disputeNotes, setDisputeNotes] = useState("");
  const content = notificationContent(notification, t);
  const Icon = content.icon;
  const responseAvailable =
    notification.canConfirm &&
    notification.confirmationDeadlineAt !== null &&
    now < new Date(notification.confirmationDeadlineAt).getTime();
  const showConfirmationSummary =
    notification.source === "report_group" &&
    notification.status === "pending_confirmation";
  const isNoShow = notification.resultType === "no_show";

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label={t("dashboard.close")}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
      />
      <motion.article
        role="dialog"
        aria-modal="true"
        aria-labelledby={`notification-${notification.sourceId}`}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative max-h-[88vh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-orange-400/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_60px_rgba(249,115,22,0.14)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/30 ${content.iconClassName}`}
            >
              <Icon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                {t("dashboard.modalEyebrow")}
              </p>
              <h2
                id={`notification-${notification.sourceId}`}
                className="mt-1.5 break-words text-lg font-black text-white sm:text-xl"
              >
                {content.title}
              </h2>
              <p className="mt-1.5 text-xs leading-5 text-zinc-400">
                {content.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.close")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-orange-400/40 hover:text-white"
          >
            <X size={17} />
          </button>
        </header>

        {showConfirmationSummary && (
          <div className="space-y-3 border-b border-white/10 p-4 sm:p-5">
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <CompactDetail
                label={t("dashboard.opponent")}
                value={notification.opponentName}
              />
              <CompactDetail
                label={
                  isNoShow ? t("dashboard.report") : t("dashboard.score")
                }
                value={
                  isNoShow
                    ? t("dashboard.noShowForfeit")
                    : notification.reportedScore
                }
              />
              <CompactDetail
                label={t("dashboard.time")}
                value={
                  notification.confirmationDeadlineAt
                    ? formatTimeRemaining(
                        notification.confirmationDeadlineAt,
                        now,
                        locale,
                        t
                      )
                    : t("dashboard.unavailable")
                }
              />
            </div>

            {responseAvailable && (
              <div className="space-y-3 rounded-xl border border-orange-400/20 bg-orange-500/5 p-3">
                <textarea
                  value={disputeNotes}
                  onChange={(event) => setDisputeNotes(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder={t("dashboard.disputeNotes")}
                  className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRespond(notification, "confirm")}
                    className="rounded-lg bg-emerald-600 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isNoShow
                      ? t("dashboard.confirmNoShow")
                      : t("dashboard.confirmResult")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      onRespond(notification, "dispute", disputeNotes)
                    }
                    className="rounded-lg bg-red-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    {isNoShow
                      ? t("dashboard.disputeNoShow")
                      : t("dashboard.disputeResult")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          <Detail
            label={t("dashboard.tournament")}
            value={notification.tournamentName}
          />
          <Detail
            label={t("dashboard.match")}
            value={t("dashboard.matchValue", {
              roundName: notification.roundName,
              matchNumber: notification.matchNumber,
            })}
          />
          <Detail
            label={t("dashboard.submission")}
            value={notificationLabel(notification, t)}
          />
          <Detail
            label={t("dashboard.opponent")}
            value={notification.opponentName}
          />
          <Detail
            label={
              isNoShow
                ? t("dashboard.forfeitWinner")
                : t("dashboard.reportedWinner")
            }
            value={notification.reportedWinner}
          />
          <Detail
            label={
              isNoShow
                ? t("dashboard.missingPlayer")
                : t("dashboard.reportedLoser")
            }
            value={notification.reportedLoser}
          />
          <Detail
            label={
              isNoShow
                ? t("dashboard.reportType")
                : t("dashboard.reportedScore")
            }
            value={
              isNoShow
                ? t("dashboard.noShowForfeit")
                : notification.reportedScore
            }
          />
          <Detail
            label={t("dashboard.status")}
            value={formatStatus(notification.status, t)}
          />
          {notification.confirmationDeadlineAt && (
            <Detail
              label={t("dashboard.timeRemaining")}
              value={formatTimeRemaining(
                notification.confirmationDeadlineAt,
                now,
                locale,
                t
              )}
            />
          )}
          <Detail
            label={
              notification.reviewedAt
                ? t("dashboard.reviewed")
                : t("dashboard.submitted")
            }
            value={
              <HydrationSafeLocalDateTime
                value={notification.reviewedAt ?? notification.submittedAt}
                fallback={t("dashboard.unavailable")}
              />
            }
          />
        </div>

        {notification.reviewNotes && (
          <div className="mx-6 mb-6 rounded-2xl border border-orange-400/20 bg-orange-500/5 p-5 sm:mx-8 sm:mb-8">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-200">
              <MessageSquareText size={15} />
              {t("dashboard.administratorMessage")}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {notification.reviewNotes}
            </p>
          </div>
        )}

        {notification.source === "report_group" &&
          notification.status === "pending_confirmation" &&
          !responseAvailable &&
          !notification.submittedByViewer && (
            <div className="mx-4 mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100/80 sm:mx-5 sm:mb-5">
              {t("dashboard.expiredNotice")}
            </div>
          )}
      </motion.article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-bold text-white">{value}</p>
    </div>
  );
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-white">{value}</p>
    </div>
  );
}

function notificationContent(
  notification: DashboardNotification,
  t: NotificationTranslator
) {
  if (notification.status === "pending_confirmation") {
    if (notification.submittedByViewer) {
      if (notification.resultType === "no_show") {
        return {
          title: t("matchContent.noShowAwaitingTitle"),
          message: t("matchContent.noShowAwaitingMessage"),
          icon: Clock3,
          iconClassName: "text-sky-300",
        };
      }

      return {
        title: t("matchContent.submissionAwaitingTitle", {
          number: notification.submissionNumber,
        }),
        message: t("matchContent.submissionAwaitingMessage"),
        icon: Clock3,
        iconClassName: "text-sky-300",
      };
    }

    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowConfirmationTitle"),
        message: t("matchContent.noShowConfirmationMessage", {
          tournamentName: notification.tournamentName,
        }),
        icon: ShieldAlert,
        iconClassName: "text-orange-300",
      };
    }

    return {
      title: t("matchContent.resultConfirmationTitle"),
      message: t("matchContent.resultConfirmationMessage", {
        tournamentName: notification.tournamentName,
      }),
      icon: Bell,
      iconClassName: "text-orange-300",
    };
  }
  if (notification.status === "approved") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowApprovedTitle"),
        message: t("matchContent.noShowApprovedMessage"),
        icon: CheckCircle2,
        iconClassName: "text-emerald-300",
      };
    }

    return {
      title: t("matchContent.resultApprovedTitle"),
      message: t("matchContent.resultApprovedMessage"),
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "confirmed") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowConfirmedTitle"),
        message: t("matchContent.noShowConfirmedMessage"),
        icon: CheckCircle2,
        iconClassName: "text-emerald-300",
      };
    }

    return {
      title: t("matchContent.resultConfirmedTitle"),
      message: t("matchContent.resultConfirmedMessage"),
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "auto_approved") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowAutoTitle"),
        message: t("matchContent.noShowAutoMessage"),
        icon: CheckCircle2,
        iconClassName: "text-emerald-300",
      };
    }

    return {
      title: t("matchContent.resultAutoTitle"),
      message: t("matchContent.resultAutoMessage"),
      icon: CheckCircle2,
      iconClassName: "text-emerald-300",
    };
  }
  if (notification.status === "rejected") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowRejectedTitle"),
        message: t("matchContent.noShowRejectedMessage"),
        icon: XCircle,
        iconClassName: "text-red-300",
      };
    }

    return {
      title: t("matchContent.resultRejectedTitle"),
      message: t("matchContent.resultRejectedMessage"),
      icon: XCircle,
      iconClassName: "text-red-300",
    };
  }
  if (notification.status === "disputed") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowDisputedTitle"),
        message: t("matchContent.noShowDisputedMessage"),
        icon: ShieldAlert,
        iconClassName: "text-red-300",
      };
    }

    return {
      title: t("matchContent.resultDisputedTitle"),
      message: t("matchContent.resultDisputedMessage"),
      icon: ShieldAlert,
      iconClassName: "text-red-300",
    };
  }
  if (notification.status === "under_review") {
    if (notification.resultType === "no_show") {
      return {
        title: t("matchContent.noShowReviewTitle"),
        message: t("matchContent.noShowReviewMessage"),
        icon: Clock3,
        iconClassName: "text-amber-300",
      };
    }

    return {
      title: t("matchContent.resultReviewTitle"),
      message: t("matchContent.resultReviewMessage"),
      icon: Clock3,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.status === "resubmission_requested") {
    return {
      title: t("matchContent.resubmissionTitle"),
      message: t("matchContent.resubmissionMessage"),
      icon: RotateCcw,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.status === "reset") {
    return {
      title: t("matchContent.resetTitle"),
      message: t("matchContent.resetMessage"),
      icon: RotateCcw,
      iconClassName: "text-amber-300",
    };
  }
  if (notification.submittedByViewer) {
    return {
      title: t("matchContent.submittedReviewTitle", {
        number: notification.submissionNumber,
      }),
      message: t("matchContent.submittedReviewMessage"),
      icon: Clock3,
      iconClassName: "text-sky-300",
    };
  }

  return {
    title: t("matchContent.opponentSubmittedTitle"),
    message: t("matchContent.opponentSubmittedMessage"),
    icon: Bell,
    iconClassName: "text-orange-300",
  };
}

function notificationLabel(
  notification: DashboardNotification,
  t: NotificationTranslator
) {
  if (notification.resultType === "no_show") {
    return t("dashboard.noShowReport");
  }

  return notification.submissionNumber > 0
    ? t("dashboard.submissionNumber", {
        number: notification.submissionNumber,
      })
    : t("dashboard.resultConfirmation");
}

function formatStatus(
  status: DashboardNotification["status"],
  t: NotificationTranslator
) {
  return {
    pending: t("status.pending"),
    approved: t("status.approved"),
    rejected: t("status.rejected"),
    resubmission_requested: t("status.resubmissionRequested"),
    pending_confirmation: t("status.pendingConfirmation"),
    confirmed: t("status.confirmed"),
    auto_approved: t("status.autoApproved"),
    disputed: t("status.disputed"),
    under_review: t("status.underReview"),
    reset: t("status.reset"),
  }[status];
}

function formatTimeRemaining(
  value: string,
  now: number,
  locale: Locale,
  t: NotificationTranslator
) {
  const remainingMs = new Date(value).getTime() - now;

  if (!Number.isFinite(remainingMs)) {
    return t("dashboard.timeUnavailable");
  }

  if (remainingMs <= 0) {
    return t("dashboard.expired");
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formattedHours = formatNumber(hours, locale);
  const formattedMinutes = formatNumber(minutes, locale);
  const formattedSeconds = formatNumber(seconds, locale);

  if (hours > 0) {
    return t("dashboard.hoursRemaining", {
      hours: formattedHours,
      minutes: formattedMinutes,
    });
  }

  if (minutes > 0) {
    return t("dashboard.minutesRemaining", {
      minutes: formattedMinutes,
      seconds: formattedSeconds,
    });
  }

  return t("dashboard.secondsRemaining", { seconds: formattedSeconds });
}

function pluralMessage(
  count: number,
  locale: Locale,
  t: NotificationTranslator,
  prefix: "message" | "actionRequired"
) {
  const category = selectPlural(count, locale);
  const supportedCategory =
    category === "one" || category === "few" || category === "many"
      ? category
      : "other";

  const categoryKey = {
    one: "One",
    few: "Few",
    many: "Many",
    other: "Other",
  }[supportedCategory];

  return t(`dashboard.${prefix}${categoryKey}`, {
    count: formatNumber(count, locale),
  });
}

function localizeDismissalResult(
  result: NotificationDismissalResult,
  locale: Locale,
  t: NotificationTranslator
) {
  if (result.code === "deleted") {
    const count = result.dismissedIds.length;
    const category = selectPlural(count, locale);
    const supportedCategory =
      category === "one" || category === "few" || category === "many"
        ? category
        : "other";
    const categoryKey = {
      one: "One",
      few: "Few",
      many: "Many",
      other: "Other",
    }[supportedCategory];

    return t(`dashboard.actions.deleted${categoryKey}`, {
      count: formatNumber(count, locale),
    });
  }

  return t(
    {
      "sign-in-required": "dashboard.actions.signInRequired",
      "selection-required": "dashboard.actions.selectionRequired",
      "update-failed": "dashboard.actions.updateFailed",
      unavailable: "dashboard.actions.unavailable",
      "notification-unavailable":
        "dashboard.actions.notificationUnavailable",
      "already-deleted": "dashboard.actions.alreadyDeleted",
    }[result.code]
  );
}

function localizeNotificationActionResult(
  result: NotificationActionResult,
  t: NotificationTranslator
) {
  return t(
    {
      "sign-in-required": "dashboard.actions.signInRequired",
      "result-unavailable": "dashboard.actions.resultUnavailable",
      "confirm-failed": "dashboard.actions.confirmFailed",
      confirmed: "dashboard.actions.confirmed",
      "dispute-notes-too-long": "dashboard.actions.disputeNotesTooLong",
      "dispute-failed": "dashboard.actions.disputeFailed",
      disputed: "dashboard.actions.disputed",
    }[result.code]
  );
}
