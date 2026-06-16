"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

export type AdminRegistrationReviewRow = {
  id: string;
  playerName: string;
  tournamentName: string;
  bracketName: string | null;
  createdAt: string | null;
  region: string | null;
  submittedElo: number | null;
  country: string | null;
  discordUsername: string | null;
  status: RegistrationStatus;
  adminNotes: string | null;
  waitlistPosition: number | null;
  registrationOrder: number;
};

type RegistrationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected"
  | "waitlisted";

type FilterStatus = "all" | RegistrationStatus;
type FocusTarget = "note" | "reject" | "manual_review" | "waitlist";

type ContextMenuState = {
  registration: AdminRegistrationReviewRow;
  x: number;
  y: number;
};

type MenuAction =
  | {
      kind: "direct";
      label: string;
      nextStatus: RegistrationStatus;
      className: string;
    }
  | {
      kind: "details";
      label: string;
      focus: FocusTarget;
      className: string;
    };

export default function AdminRegistrationReviewRows({
  registrations,
  activeFilter,
  formId,
  updateRegistrationStatusAction,
}: {
  registrations: AdminRegistrationReviewRow[];
  activeFilter: FilterStatus;
  formId: string;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }

    const closeMenu = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        (menuRef.current?.contains(target) ||
          (target instanceof Element &&
            target.closest("[data-registration-review-row='true']")))
      ) {
        return;
      }

      setMenu(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  return (
    <>
      <tbody>
        {registrations.map((registration) => (
          <tr
            key={registration.id}
            data-registration-review-row="true"
            onClick={(event) => {
              setMenu({
                registration,
                x: Math.min(event.clientX, window.innerWidth - 260),
                y: Math.min(event.clientY, window.innerHeight - 260),
              });
            }}
            className="cursor-pointer border-b border-white/5 text-zinc-300 transition hover:bg-orange-500/[0.05]"
          >
            <td className="py-4">
              <input
                form={formId}
                type="checkbox"
                name="registrationId"
                value={registration.id}
                data-registration-selection="true"
                aria-label={`Select registration for ${
                  registration.playerName || "player"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenu(null);
                }}
                className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500"
              />
            </td>

            <td className="py-4 font-semibold text-white">
              <span>{registration.playerName || "N/A"}</span>
              <span className="ml-2 align-middle text-[11px] font-black text-zinc-500">
                &middot; #{registration.registrationOrder}
              </span>
            </td>

            <td className="py-4">
              <p className="font-semibold text-white">
                {registration.tournamentName || "N/A"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {registration.bracketName
                  ? `${registration.bracketName} Bracket`
                  : "Bracket not assigned"}
              </p>
            </td>

            <td className="py-4">
              {registration.createdAt
                ? new Date(registration.createdAt).toLocaleDateString()
                : "N/A"}
            </td>
            <td className="py-4">{registration.region || "N/A"}</td>
            <td className="py-4">{registration.submittedElo ?? "N/A"}</td>
            <td className="py-4">{registration.country || "N/A"}</td>
            <td className="py-4">{registration.discordUsername || "N/A"}</td>

            <td className="py-4">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                  registration.status
                )}`}
              >
                {formatStatus(registration.status)}
              </span>
            </td>

            <td className="py-4">
              {registration.status === "waitlisted" ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">
                  #{registration.waitlistPosition ?? "?"}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">-</span>
              )}
            </td>
          </tr>
        ))}

        {registrations.length === 0 && (
          <tr>
            <td colSpan={10} className="py-10 text-center text-zinc-500">
              No registrations found for this status.
            </td>
          </tr>
        )}
      </tbody>

      {typeof document !== "undefined" && menu
        ? createPortal(
            <RegistrationContextMenu
              menuRef={menuRef}
              menu={menu}
              activeFilter={activeFilter}
              updateRegistrationStatusAction={updateRegistrationStatusAction}
              onClose={() => setMenu(null)}
            />,
            document.body
          )
        : null}
    </>
  );
}

function RegistrationContextMenu({
  menu,
  activeFilter,
  updateRegistrationStatusAction,
  onClose,
  menuRef,
}: {
  menu: ContextMenuState;
  activeFilter: FilterStatus;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}) {
  const registration = menu.registration;
  const actions = getMenuActions(registration.status);

  return (
    <div
      ref={menuRef}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[10050] w-56 overflow-hidden rounded-2xl border border-orange-500/25 bg-zinc-950/95 p-2 text-sm shadow-2xl shadow-orange-950/50 backdrop-blur-xl"
    >
      <div className="border-b border-white/10 px-3 py-2">
        <p className="truncate text-xs font-black uppercase tracking-wider text-orange-300">
          Registration #{registration.registrationOrder}
        </p>
        <p className="truncate text-sm font-bold text-white">
          {registration.playerName || "Player"}
        </p>
      </div>

      <div className="mt-2 space-y-1">
        {actions.map((action) =>
          action.kind === "direct" ? (
            <DirectStatusAction
              key={`${action.kind}:${action.nextStatus}`}
              action={action}
              registration={registration}
              activeFilter={activeFilter}
              updateRegistrationStatusAction={updateRegistrationStatusAction}
              onClose={onClose}
            />
          ) : (
            <MenuLink
              key={`${action.kind}:${action.focus}`}
              href={buildRegistrationHref(
                activeFilter,
                registration.id,
                action.focus
              )}
              label={action.label}
              className={action.className}
            />
          )
        )}
      </div>
    </div>
  );
}

function DirectStatusAction({
  action,
  registration,
  activeFilter,
  updateRegistrationStatusAction,
  onClose,
}: {
  action: Extract<MenuAction, { kind: "direct" }>;
  registration: AdminRegistrationReviewRow;
  activeFilter: FilterStatus;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <form action={updateRegistrationStatusAction}>
      <input type="hidden" name="registrationId" value={registration.id} />
      <input type="hidden" name="nextStatus" value={action.nextStatus} />
      <input type="hidden" name="activeFilter" value={activeFilter} />
      <input type="hidden" name="selected" value="" />
      <input
        type="hidden"
        name="adminNotes"
        value={registration.adminNotes ?? ""}
      />
      <button
        type="submit"
        onClick={onClose}
        className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-wider transition ${action.className}`}
      >
        {action.label}
      </button>
    </form>
  );
}

function MenuLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className: string;
}) {
  return (
    <a
      href={href}
      className={`block rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider transition ${className}`}
    >
      {label}
    </a>
  );
}

function buildRegistrationHref(
  filter: FilterStatus,
  selected: string,
  focus: FocusTarget
) {
  const params = new URLSearchParams();
  params.set("filter", filter);
  params.set("selected", selected);
  params.set("focus", focus);
  return `/admin?${params.toString()}`;
}

function getMenuActions(status: RegistrationStatus): MenuAction[] {
  const approveAction: MenuAction = {
    kind: "direct",
    label: status === "waitlisted" ? "Promote to Participant" : "Approve",
    nextStatus: "approved",
    className: "text-green-300 hover:bg-green-500/10",
  };
  const rejectAction: MenuAction = {
    kind: "details",
    label: "Reject",
    focus: "reject",
    className: "text-red-300 hover:bg-red-500/10",
  };
  const writeNoteAction: MenuAction = {
    kind: "details",
    label: "Write Note",
    focus: "note",
    className: "text-orange-200 hover:bg-orange-500/10",
  };
  const manualReviewAction: MenuAction = {
    kind: "details",
    label:
      status === "pending" ? "Mark Manual Review" : "Move to Manual Review",
    focus: "manual_review",
    className: "text-orange-300 hover:bg-orange-500/10",
  };
  const waitlistAction: MenuAction = {
    kind: "details",
    label: status === "approved" ? "Move Back to Waitlist" : "Move to Waitlist",
    focus: "waitlist",
    className: "text-amber-300 hover:bg-amber-500/10",
  };
  const returnPendingAction: MenuAction = {
    kind: "direct",
    label: "Return to Pending Review",
    nextStatus: "pending",
    className: "text-slate-200 hover:bg-white/10",
  };

  if (status === "pending") {
    return [
      approveAction,
      rejectAction,
      writeNoteAction,
      manualReviewAction,
      waitlistAction,
    ];
  }

  if (status === "manual_review") {
    return [
      approveAction,
      rejectAction,
      waitlistAction,
      writeNoteAction,
      returnPendingAction,
    ];
  }

  if (status === "waitlisted") {
    return [
      approveAction,
      rejectAction,
      manualReviewAction,
      writeNoteAction,
      returnPendingAction,
    ];
  }

  if (status === "approved") {
    return [manualReviewAction, waitlistAction, rejectAction, writeNoteAction];
  }

  return [approveAction, manualReviewAction, waitlistAction, writeNoteAction];
}

function formatStatus(status: string) {
  return status
    .replace("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusBadgeClass(status: RegistrationStatus) {
  if (status === "approved") {
    return "border-green-500/30 bg-green-500/10 text-green-400";
  }

  if (status === "rejected") {
    return "border-red-500/30 bg-red-500/10 text-red-400";
  }

  if (status === "manual_review") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  }

  if (status === "waitlisted") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}
