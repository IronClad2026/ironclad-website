"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MessageSquareWarning,
  ShieldAlert,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { dismissDashboardNotifications } from "@/app/dashboard/actions";
import {
  deleteSelectedInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  markVisibleInAppNotificationsRead,
} from "@/app/notifications/actions";
import type { DashboardNotification } from "@/lib/player-dashboard";
import type {
  InAppNotification,
  NotificationScope,
} from "@/lib/notifications";

type InAppNotificationCenterProps = {
  scope: NotificationScope;
  title: string;
  eyebrow?: string;
  description: string;
  emptyMessage: string;
  notifications: InAppNotification[];
  totalCount: number;
  unreadCount: number;
  error?: string | null;
  className?: string;
  matchNotifications?: DashboardNotification[];
};

export default function InAppNotificationCenter({
  scope,
  title,
  eyebrow = "Notifications",
  description,
  emptyMessage,
  notifications: initialNotifications,
  totalCount,
  unreadCount: initialUnreadCount,
  error,
  className = "",
  matchNotifications = [],
}: InAppNotificationCenterProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [notificationTotalCount, setNotificationTotalCount] =
    useState(totalCount);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialNotifications[0]?.id ?? null
  );
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<
    Set<string>
  >(new Set());
  const [dismissedMatchActionIds, setDismissedMatchActionIds] = useState<
    Set<string>
  >(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectedNotification =
    notifications.find((notification) => notification.id === selectedId) ??
    notifications[0] ??
    null;
  const matchActionNotifications = useMemo(
    () =>
      matchNotifications.filter(
        (notification) =>
          notification.status === "pending_confirmation" &&
          !notification.submittedByViewer &&
          !dismissedMatchActionIds.has(notification.id) &&
          (notification.canConfirm || notification.canDispute)
      ),
    [dismissedMatchActionIds, matchNotifications]
  );
  const visibleNotificationIds = notifications.map(
    (notification) => notification.id
  );
  const visibleMatchActionIds = matchActionNotifications.map(
    (notification) => notification.id
  );
  const visibleItemIds = [...visibleNotificationIds, ...visibleMatchActionIds];
  const selectedVisibleCount = visibleItemIds.filter((id) =>
    selectedNotificationIds.has(id)
  ).length;
  const selectedDurableCount = visibleNotificationIds.filter((id) =>
    selectedNotificationIds.has(id)
  ).length;
  const allVisibleSelected =
    visibleItemIds.length > 0 && selectedVisibleCount === visibleItemIds.length;
  const displayTotalCount =
    notificationTotalCount + matchActionNotifications.length;
  const displayUnreadCount = unreadCount + matchActionNotifications.length;

  useEffect(() => {
    if (!adminModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAdminModalOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [adminModalOpen]);

  const markRead = (notificationId: string) => {
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.readAt !== null || pending) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("scope", scope);
      formData.set("notificationId", notificationId);
      await markInAppNotificationRead(formData);

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, readAt } : item
        )
      );
      setUnreadCount((current) => Math.max(current - 1, 0));
      router.refresh();
    });
  };

  const markAllRead = () => {
    if (unreadCount === 0 || pending) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("scope", scope);
      await markAllInAppNotificationsRead(formData);

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, readAt }))
      );
      setUnreadCount(0);
      router.refresh();
    });
  };

  const toggleNotificationSelection = (notificationId: string) => {
    setSelectedNotificationIds((current) => {
      const next = new Set(current);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedNotificationIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const notificationId of visibleItemIds) {
          next.delete(notificationId);
        }
      } else {
        for (const notificationId of visibleItemIds) {
          next.add(notificationId);
        }
      }

      return next;
    });
  };

  const markSelectedRead = () => {
    const selectedIds = visibleNotificationIds.filter((notificationId) =>
      selectedNotificationIds.has(notificationId)
    );

    if (selectedIds.length === 0 || pending) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("scope", scope);
      for (const notificationId of selectedIds) {
        formData.append("notificationId", notificationId);
      }

      await markVisibleInAppNotificationsRead(formData);

      const readAt = new Date().toISOString();
      const newlyReadCount = notifications.filter(
        (notification) =>
          selectedNotificationIds.has(notification.id) &&
          notification.readAt === null
      ).length;

      setNotifications((current) =>
        current.map((notification) =>
          selectedIds.includes(notification.id)
            ? { ...notification, readAt }
            : notification
        )
      );
      setUnreadCount((current) => Math.max(current - newlyReadCount, 0));
      setSelectedNotificationIds(new Set());
      router.refresh();
    });
  };

  const deleteSelected = () => {
    const selectedIds = visibleNotificationIds.filter((notificationId) =>
      selectedNotificationIds.has(notificationId)
    );
    const selectedMatchActionIds = visibleMatchActionIds.filter((notificationId) =>
      selectedNotificationIds.has(notificationId)
    );

    if ((selectedIds.length === 0 && selectedMatchActionIds.length === 0) || pending) {
      return;
    }

    startTransition(async () => {
      if (selectedIds.length > 0) {
        const formData = new FormData();
        formData.set("scope", scope);
        for (const notificationId of selectedIds) {
          formData.append("notificationId", notificationId);
        }

        await deleteSelectedInAppNotifications(formData);
      }

      if (scope === "player" && selectedMatchActionIds.length > 0) {
        const formData = new FormData();
        for (const notificationId of selectedMatchActionIds) {
          formData.append("notificationId", notificationId);
        }
        await dismissDashboardNotifications(formData);
      }

      const deleted = new Set(selectedIds);
      const deletedUnreadCount = notifications.filter(
        (notification) =>
          deleted.has(notification.id) && notification.readAt === null
      ).length;
      const remaining = notifications.filter(
        (notification) => !deleted.has(notification.id)
      );

      setNotifications(remaining);
      setNotificationTotalCount((current) =>
        Math.max(current - selectedIds.length, 0)
      );
      setUnreadCount((current) => Math.max(current - deletedUnreadCount, 0));
      if (selectedMatchActionIds.length > 0) {
        setDismissedMatchActionIds((current) => {
          const next = new Set(current);
          for (const notificationId of selectedMatchActionIds) {
            next.add(notificationId);
          }
          return next;
        });
      }
      setSelectedNotificationIds(new Set());
      setSelectedId((current) =>
        current && deleted.has(current) ? (remaining[0]?.id ?? null) : current
      );
      router.refresh();
    });
  };

  const handlePlayerNotificationClick = (notification: InAppNotification) => {
    if (pending) return;

    if (isPlayerMatchConfirmationNotification(notification)) {
      startTransition(async () => {
        if (notification.readAt === null) {
          const formData = new FormData();
          formData.set("scope", "player");
          formData.set("notificationId", notification.id);
          await markInAppNotificationRead(formData);
        }

        router.push(notification.href ?? "/tournaments");
      });
      return;
    }

    markRead(notification.id);
  };

  if (scope === "admin") {
    return (
      <>
        <button
          type="button"
          onClick={() => setAdminModalOpen(true)}
          className={`rounded-3xl border border-orange-500/25 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.18),transparent_34%),linear-gradient(135deg,rgba(249,115,22,0.10),rgba(255,255,255,0.035))] p-6 text-left shadow-xl shadow-black/25 backdrop-blur transition hover:-translate-y-1 hover:border-orange-400/60 ${className}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-300">
                {eyebrow}
              </p>
              <h3 className="mt-4 text-2xl font-black text-white">{title}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                {description}
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
              <Bell className="h-6 w-6" />
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <CountPill label="Total" value={notificationTotalCount} />
            <CountPill label="Unread" value={unreadCount} highlight />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {notifications[0]
              ? `Recent: ${notifications[0].title}`
              : emptyMessage}
          </p>
        </button>

        {typeof document !== "undefined"
          ? createPortal(
              <AnimatePresence>
                {adminModalOpen && (
                  <AdminNotificationModal
                    notifications={notifications}
                    selectedNotification={selectedNotification}
                    unreadCount={unreadCount}
                    pending={pending}
                    error={error}
                    emptyMessage={emptyMessage}
                    selectedIds={selectedNotificationIds}
                    allVisibleSelected={allVisibleSelected}
                    selectedVisibleCount={selectedVisibleCount}
                    onClose={() => setAdminModalOpen(false)}
                    onSelect={(notification) => setSelectedId(notification.id)}
                    onToggleSelected={toggleNotificationSelection}
                    onToggleSelectAll={toggleSelectAllVisible}
                    onMarkRead={markRead}
                    onMarkSelectedRead={markSelectedRead}
                    onMarkAllRead={markAllRead}
                    onDeleteSelected={deleteSelected}
                    onOpenContext={(href) => {
                      setAdminModalOpen(false);
                      router.push(href);
                    }}
                  />
                )}
              </AnimatePresence>,
              document.body
            )
          : null}
      </>
    );
  }

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-orange-500/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.08),rgba(255,255,255,0.035))] shadow-xl shadow-black/20 backdrop-blur ${className}`}
    >
      <button
        type="button"
        onClick={() => setPlayerExpanded((current) => !current)}
        aria-expanded={playerExpanded}
        className="flex w-full flex-wrap items-center justify-between gap-4 p-6 text-left transition hover:bg-orange-500/5"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
            <Bell className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-black text-white">{title}</span>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {displayTotalCount} total - {displayUnreadCount} unread
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-zinc-400 transition ${
            playerExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {playerExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/10"
          >
            <div className="space-y-3 p-4 sm:p-5">
              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {error}
                </div>
              )}

              {displayTotalCount === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-zinc-500">
                  {emptyMessage}
                </div>
              ) : (
                <>
                  {visibleItemIds.length > 0 && (
                    <BulkActionBar
                      allVisibleSelected={allVisibleSelected}
                      selectedVisibleCount={selectedVisibleCount}
                      selectedReadableCount={selectedDurableCount}
                      pending={pending}
                      onToggleSelectAll={toggleSelectAllVisible}
                      onMarkSelectedRead={markSelectedRead}
                      onDeleteSelected={deleteSelected}
                    />
                  )}

                  {matchActionNotifications.map((notification) => (
                    <MatchActionNotificationItem
                      key={notification.id}
                      notification={notification}
                      checked={selectedNotificationIds.has(notification.id)}
                      pending={pending}
                      onToggleSelected={() =>
                        toggleNotificationSelection(notification.id)
                      }
                      onOpen={() => router.push("/tournaments")}
                    />
                  ))}

                  {notifications.map((notification) => (
                    <PlayerNotificationItem
                      key={notification.id}
                      notification={notification}
                      checked={selectedNotificationIds.has(notification.id)}
                      pending={pending}
                      onToggleSelected={() =>
                        toggleNotificationSelection(notification.id)
                      }
                      onOpen={() => handlePlayerNotificationClick(notification)}
                    />
                  ))}
                </>
              )}

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/40 hover:text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark All Read
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function BulkActionBar({
  allVisibleSelected,
  selectedVisibleCount,
  selectedReadableCount,
  pending,
  onToggleSelectAll,
  onMarkSelectedRead,
  onDeleteSelected,
}: {
  allVisibleSelected: boolean;
  selectedVisibleCount: number;
  selectedReadableCount: number;
  pending: boolean;
  onToggleSelectAll: () => void;
  onMarkSelectedRead: () => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={onToggleSelectAll}
          disabled={pending}
          className="h-4 w-4 accent-orange-500"
        />
        Select All
        {selectedVisibleCount > 0 && (
          <span className="text-orange-300">
            {selectedVisibleCount} selected
          </span>
        )}
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onMarkSelectedRead}
          disabled={pending || selectedReadableCount === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/40 hover:text-white disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" />
          Mark Selected Read
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={pending || selectedVisibleCount === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-200 transition hover:border-red-400/60 hover:bg-red-500/20 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Delete Selected
        </button>
      </div>
    </div>
  );
}

function AdminNotificationModal({
  notifications,
  selectedNotification,
  unreadCount,
  pending,
  error,
  emptyMessage,
  selectedIds,
  allVisibleSelected,
  selectedVisibleCount,
  onClose,
  onSelect,
  onToggleSelected,
  onToggleSelectAll,
  onMarkRead,
  onMarkSelectedRead,
  onMarkAllRead,
  onDeleteSelected,
  onOpenContext,
}: {
  notifications: InAppNotification[];
  selectedNotification: InAppNotification | null;
  unreadCount: number;
  pending: boolean;
  error?: string | null;
  emptyMessage: string;
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  selectedVisibleCount: number;
  onClose: () => void;
  onSelect: (notification: InAppNotification) => void;
  onToggleSelected: (notificationId: string) => void;
  onToggleSelectAll: () => void;
  onMarkRead: (notificationId: string) => void;
  onMarkSelectedRead: () => void;
  onMarkAllRead: () => void;
  onDeleteSelected: () => void;
  onOpenContext: (href: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[2147483647] grid place-items-center p-4 sm:p-6">
      <motion.button
        type="button"
        aria-label="Close admin notifications"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 h-full w-full cursor-default bg-black/85 backdrop-blur-md"
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-notification-modal-title"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative flex h-[min(78vh,52rem)] w-[min(74vw,76rem)] min-w-[min(92vw,22rem)] flex-col overflow-hidden rounded-3xl border border-orange-500/30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_35%),linear-gradient(145deg,#111827,#030712)] shadow-[0_0_70px_rgba(249,115,22,0.16)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-300">
              Admin Notifications
            </p>
            <h2
              id="admin-notification-modal-title"
              className="mt-2 text-2xl font-black text-white"
            >
              Notification Management
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {notifications.length} recent shown - {unreadCount} unread
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkSelectedRead}
              disabled={pending || selectedVisibleCount === 0}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/40 hover:text-white disabled:opacity-40"
            >
              Mark Selected Read
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={pending || selectedVisibleCount === 0}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-200 transition hover:border-red-400/60 hover:bg-red-500/20 disabled:opacity-40"
            >
              Delete Selected
            </button>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={pending || unreadCount === 0}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/40 hover:text-white disabled:opacity-40"
            >
              Mark All Read
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:border-orange-400/40 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(18rem,0.9fr)_1.4fr]">
          <aside className="min-h-0 overflow-y-auto border-b border-white/10 p-3 md:border-r md:border-b-0">
            {notifications.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-zinc-500">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={onToggleSelectAll}
                    disabled={pending}
                    className="h-4 w-4 accent-orange-500"
                  />
                  Select All
                  {selectedVisibleCount > 0 && (
                    <span className="ml-auto text-orange-300">
                      {selectedVisibleCount} selected
                    </span>
                  )}
                </label>
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      selectedNotification?.id === notification.id
                        ? "border-orange-400/50 bg-orange-500/15"
                        : notification.readAt === null
                          ? "border-orange-500/25 bg-orange-500/10 hover:border-orange-400/40"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <label className="mt-2 grid h-6 w-6 shrink-0 cursor-pointer place-items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(notification.id)}
                        onChange={() => onToggleSelected(notification.id)}
                        disabled={pending}
                        aria-label={`Select ${notification.title}`}
                        className="h-4 w-4 accent-orange-500"
                      />
                    </label>
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-black/30 text-orange-300">
                      <NotificationIcon type={notification.type} />
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelect(notification)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-black text-white">
                          {notification.title}
                        </span>
                        {notification.readAt === null && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                        )}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-400">
                        {notification.message}
                      </span>
                      <span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                        {formatTimestamp(notification.createdAt)}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <section className="min-h-0 overflow-y-auto p-5">
            {selectedNotification ? (
              <AdminNotificationDetail
                notification={selectedNotification}
                pending={pending}
                onMarkRead={onMarkRead}
                onOpenContext={onOpenContext}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-zinc-500">
                Select a notification to view details.
              </div>
            )}
          </section>
        </div>
      </motion.section>
    </div>
  );
}

function AdminNotificationDetail({
  notification,
  pending,
  onMarkRead,
  onOpenContext,
}: {
  notification: InAppNotification;
  pending: boolean;
  onMarkRead: (notificationId: string) => void;
  onOpenContext: (href: string) => void;
}) {
  return (
    <article className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
              {notification.readAt ? "Read" : "Unread"}
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">
              {notification.title}
            </h3>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-orange-500/10 text-orange-300">
            <NotificationIcon type={notification.type} />
          </span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
          {notification.message}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Type" value={notification.type} />
        <Detail label="Created" value={formatFullTimestamp(notification.createdAt)} />
        <Detail
          label="Actor"
          value={notification.actorDisplayName || "System"}
        />
        <Detail
          label="Tournament"
          value={notification.tournamentTitle || "N/A"}
        />
        <Detail label="Registration ID" value={notification.registrationId || "N/A"} />
        <Detail label="Match ID" value={notification.matchId || "N/A"} />
        <Detail label="Report Group ID" value={notification.reportGroupId || "N/A"} />
        <Detail label="Read State" value={notification.readAt ? "Read" : "Unread"} />
      </div>

      <div className="flex flex-wrap gap-3">
        {notification.readAt === null && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            disabled={pending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-300 transition hover:border-orange-400/40 hover:text-white disabled:opacity-40"
          >
            Mark Read
          </button>
        )}

        {notification.href && (
          <button
            type="button"
            onClick={() => onOpenContext(notification.href as string)}
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400"
          >
            {notification.registrationId
              ? "Open Registration"
              : notification.matchId || notification.reportGroupId
                ? "Open Match"
                : "Open Context"}
          </button>
        )}
      </div>
    </article>
  );
}

function PlayerNotificationItem({
  notification,
  checked,
  pending,
  onToggleSelected,
  onOpen,
}: {
  notification: InAppNotification;
  checked: boolean;
  pending: boolean;
  onToggleSelected: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
        notification.readAt === null
          ? "border-orange-500/30 bg-orange-500/10 hover:border-orange-400/50"
          : "border-white/10 bg-black/25 hover:border-white/20"
      }`}
    >
      <label className="mt-2 grid h-6 w-6 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelected}
          disabled={pending}
          aria-label={`Select ${notification.title}`}
          className="h-4 w-4 accent-orange-500"
        />
      </label>
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-black/30 text-orange-300">
        <NotificationIcon type={notification.type} />
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className="min-w-0 flex-1 text-left disabled:opacity-60"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-white">
            {notification.title}
          </span>
          {notification.readAt === null && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
              New
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-5 text-zinc-300">
          {notification.message}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          <Clock3 className="h-3.5 w-3.5" />
          {formatTimestamp(notification.createdAt)}
          {notification.tournamentTitle ? (
            <>
              <span>-</span>
              <span>{notification.tournamentTitle}</span>
            </>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function MatchActionNotificationItem({
  notification,
  checked,
  pending,
  onToggleSelected,
  onOpen,
}: {
  notification: DashboardNotification;
  checked: boolean;
  pending: boolean;
  onToggleSelected: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="flex w-full items-start gap-3 rounded-2xl border border-orange-500/35 bg-orange-500/10 p-4 text-left transition hover:border-orange-400/60"
    >
      <label className="mt-2 grid h-6 w-6 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelected}
          disabled={pending}
          aria-label="Select match result confirmation notification"
          className="h-4 w-4 accent-orange-500"
        />
      </label>
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-black/30 text-orange-300">
        <Bell className="h-5 w-5" />
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className="min-w-0 flex-1 text-left disabled:opacity-60"
      >
        <span className="text-sm font-black text-white">
          Match Result Confirmation Required
        </span>
        <span className="mt-1 block text-sm leading-5 text-zinc-300">
          Your opponent submitted a result for {notification.tournamentName}.
          Reported score: {notification.reportedScore}.
        </span>
        <span className="mt-2 block text-[10px] font-black uppercase tracking-wider text-orange-300">
          Open tournament to confirm or dispute
        </span>
      </button>
    </div>
  );
}

function CountPill({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <span
      className={`rounded-2xl border px-4 py-3 ${
        highlight
          ? "border-orange-400/30 bg-orange-500/10"
          : "border-white/10 bg-black/25"
      }`}
    >
      <span className="block text-3xl font-black text-white">{value}</span>
      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-bold text-white">{value}</p>
    </div>
  );
}

function NotificationIcon({ type }: { type: string }) {
  const className = "h-5 w-5";

  if (type.includes("registration.submitted")) {
    return <UserPlus className={className} />;
  }

  if (
    type.includes("registration.approved") ||
    type.includes("registration.promoted")
  ) {
    return <Trophy className={className} />;
  }

  if (type.includes("registration.rejected")) {
    return <ShieldAlert className={className} />;
  }

  if (type.includes("match.dispute")) {
    return <MessageSquareWarning className={className} />;
  }

  return <Bell className={className} />;
}

function isPlayerMatchConfirmationNotification(notification: InAppNotification) {
  return (
    notification.type === "match.confirmation_required" ||
    notification.title.toLowerCase() === "match result confirmation required"
  );
}

function formatTimestamp(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatFullTimestamp(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
