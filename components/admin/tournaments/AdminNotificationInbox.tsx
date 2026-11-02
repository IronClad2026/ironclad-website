"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import {
  dismissSelectedAdminNotifications,
  markAllAdminNotificationsRead,
  markSelectedAdminNotificationsRead,
} from "@/app/admin/notifications/actions";
import type { AdminInboxData, AdminInboxScope } from "@/lib/admin-notification-inbox";
import { requestNotificationBadgeReconciliation } from "@/lib/app-badge";

type Props = { data: AdminInboxData; baseHref: string; title: string };
type InboxAction = typeof markSelectedAdminNotificationsRead;

function scopeKey(scope: AdminInboxScope) {
  return scope.kind === "tournament" ? `${scope.kind}:${scope.tournamentId}` : scope.kind;
}

export default function AdminNotificationInbox(props: Props) {
  // A changed server snapshot remounts only this inbox. It cannot retain a
  // selection or late action response from another scope, filter or page.
  const revision = JSON.stringify(props.data);
  return <InboxView key={revision} {...props} />;
}

function InboxView({ data: initialData, baseHref, title }: Props) {
  const [data, setData] = useState(initialData);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const detail = data.selectedNotification;
  const allSelected = data.notifications.length > 0 &&
    data.notifications.every((notification) => selectedIds.has(notification.id));

  const href = (filter: "all" | "unread", page = 1, selected?: string) => {
    const params = new URLSearchParams({ filter, page: String(page) });
    if (selected) params.set("selected", selected);
    return `${baseHref}${baseHref.includes("?") ? "&" : "?"}${params.toString()}`;
  };

  const mutate = (action: InboxAction, ids: string[], success: string) => {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      setStatus(null);
      const form = new FormData();
      form.set("kind", data.scope.kind);
      if (data.scope.kind === "tournament") form.set("tournamentId", data.scope.tournamentId);
      form.set("filter", data.filter);
      form.set("page", String(data.page));
      if (detail) form.set("selected", detail.id);
      for (const id of ids) form.append("notificationId", id);
      try {
        const result = await action(form);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (scopeKey(result.data.scope) !== scopeKey(data.scope)) {
          setError("The inbox response could not be confirmed. Reopen this inbox before trying again.");
          return;
        }
        setData(result.data);
        setSelectedIds(new Set());
        setStatus(success);
        requestNotificationBadgeReconciliation();
      } catch {
        setError("Notifications could not be updated. Reopen this inbox to check the latest state before retrying.");
      }
    });
  };

  const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-orange-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section aria-label={title} aria-busy={pending} className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <h2 className="break-words text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-amber-100">
        Shared admin inbox. Reading or removing a notification affects all administrators.
      </p>
      <p className="mt-1 text-sm leading-6 text-zinc-400">
        Removal hides the notification from this inbox. Registration records and assistance history remain separate.
        Reading or removing a notification does not resolve an assistance request.
      </p>
      <Link href={data.scope.kind === "tournament"
        ? `/admin/notifications/legacy-assistance?kind=tournament&tournamentId=${data.scope.tournamentId}`
        : "/admin/notifications/legacy-assistance?kind=unassigned"}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-orange-200 underline underline-offset-4">
        {data.scope.kind === "tournament" ? "Open legacy assistance requests for this tournament" : "Legacy assistance with no tournament"}
      </Link>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-300">
        <span>Total: <strong>{data.totalCount}</strong></span>
        <span>Unread: <strong>{data.unreadCount}</strong></span>
      </div>
      <nav aria-label="Notification filters" className="mt-4 flex flex-wrap gap-2">
        {(["all", "unread"] as const).map((filter) => (
          <Link key={filter} href={href(filter)} aria-current={data.filter === filter ? "page" : undefined} className={buttonClass}>
            {filter === "all" ? "All notifications" : "Unread notifications"}
          </Link>
        ))}
      </nav>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-white/10 py-4">
        <button type="button" className={buttonClass} disabled={pending || selectedIds.size === 0}
          onClick={() => mutate(markSelectedAdminNotificationsRead, [...selectedIds], "Selected notifications marked read for all administrators.")}>
          Mark selected read
        </button>
        <button type="button" className={buttonClass} disabled={pending || selectedIds.size === 0}
          onClick={() => mutate(dismissSelectedAdminNotifications, [...selectedIds], "Selected notifications removed from the shared inbox.")}>
          Remove selected from inbox
        </button>
        {data.scope.kind === "tournament" && (
          <button type="button" className={buttonClass} disabled={pending || data.unreadCount === 0}
            onClick={() => mutate(markAllAdminNotificationsRead, [], "All active inbox notifications in this tournament marked read for all administrators.")}>
            Mark all in this tournament read
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 p-3 text-sm text-red-200">{error}</p>}
      {status && <p role="status" className="mt-4 text-sm text-green-200">{status}</p>}
      {pending && <p role="status" className="mt-4 text-sm text-zinc-400">Updating shared inbox…</p>}

      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300">
            <input type="checkbox" checked={allSelected} disabled={pending || data.notifications.length === 0}
              onChange={() => setSelectedIds(allSelected ? new Set() : new Set(data.notifications.map((notification) => notification.id)))}
              className="h-5 w-5 accent-orange-500" />
            Select all on this page
          </label>
          <p className="mb-3 text-xs leading-5 text-zinc-500">
            Selected actions apply only to the checked notifications.
            {data.scope.kind === "tournament" && " Mark all covers this tournament across every page and filter."}
          </p>
          {data.notifications.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-zinc-400">No notifications match this filter.</p>
          ) : (
            <ul aria-label="Notifications" className="space-y-2">
              {data.notifications.map((notification) => (
                <li key={notification.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <input type="checkbox" aria-label={`Select ${notification.title}`} checked={selectedIds.has(notification.id)} disabled={pending}
                    onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(notification.id)) next.delete(notification.id);
                      else next.add(notification.id);
                      return next;
                    })} className="mt-1 h-5 w-5 shrink-0 accent-orange-500" />
                  <Link href={href(data.filter, data.page, notification.id)} aria-current={detail?.id === notification.id ? "true" : undefined}
                    className="min-w-0 flex-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                    <span className="block break-words text-sm font-bold text-white">{notification.title}</span>
                    <span className="mt-1 line-clamp-2 block break-words text-xs leading-5 text-zinc-400">{notification.message}</span>
                    <span className="mt-1 block text-xs text-orange-200">{notification.readAt ? "Read" : "Unread"}</span>
                    <span className="mt-1 block break-words text-xs text-zinc-400">
                      <HydrationSafeLocalDateTime value={notification.createdAt} fallback="Time unavailable" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Notification pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            {data.page > 1 ? <Link href={href(data.filter, data.page - 1)} className={buttonClass}>Previous</Link> : <span />}
            <span className="text-zinc-400">Page {data.page} of {data.pageCount} · {data.filteredCount} matching</span>
            {data.page < data.pageCount ? <Link href={href(data.filter, data.page + 1)} className={buttonClass}>Next</Link> : <span />}
          </nav>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
          {detail ? (
            <article aria-label="Notification details" className="min-w-0 space-y-4">
              <h3 className="break-words text-xl font-black text-white">{detail.title}</h3>
              <p className="text-xs font-bold text-orange-200">{detail.readAt ? "Read" : "Unread"}</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{detail.message}</p>
              <p className="text-xs text-zinc-500"><HydrationSafeLocalDateTime value={detail.createdAt} fallback="Time unavailable" /></p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} disabled={pending || detail.readAt !== null}
                  onClick={() => mutate(markSelectedAdminNotificationsRead, [detail.id], "Notification marked read for all administrators.")}>Mark this notification read</button>
                <button type="button" className={buttonClass} disabled={pending}
                  onClick={() => mutate(dismissSelectedAdminNotifications, [detail.id], "Notification removed from the shared inbox.")}>Remove this notification from inbox</button>
                {detail.href && <Link href={detail.href} className={buttonClass}>Open related record</Link>}
              </div>
            </article>
          ) : <p className="text-sm text-zinc-400">Select a notification to view its details.</p>}
        </div>
      </div>
    </section>
  );
}
