"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import AdminRegistrationSelectAll from "@/components/AdminRegistrationSelectAll";
import type {
  AdminRegistrationReviewRow,
  AdminRegistrationStatus,
} from "@/lib/admin-registration-review";

export type { AdminRegistrationReviewRow } from "@/lib/admin-registration-review";

type FilterStatus = "all" | AdminRegistrationStatus;
type FocusTarget = "note" | "reject" | "manual_review";
type DesktopPresentation = "standard" | "tournament-workbench";

type ContextMenuState = {
  registration: AdminRegistrationReviewRow;
  x: number;
  y: number;
};

type MenuAction =
  | {
      kind: "direct";
      label: string;
      nextStatus: AdminRegistrationStatus;
      className: string;
    }
  | {
      kind: "details";
      label: string;
      focus?: FocusTarget;
      className: string;
    };

export default function AdminRegistrationReviewRows({
  registrations,
  activeFilter,
  formId,
  selectionScope,
  desktopPresentation = "standard",
  isTournamentTerminal,
  updateRegistrationStatusAction,
  returnHref = "/admin/registrations",
  workspaceTournamentId,
  workspaceSection,
}: {
  registrations: AdminRegistrationReviewRow[];
  activeFilter: FilterStatus;
  formId: string;
  selectionScope?: string;
  desktopPresentation?: DesktopPresentation;
  isTournamentTerminal: boolean;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
  returnHref?: string;
  workspaceTournamentId?: string;
  workspaceSection?: "registrations" | "players-waitlist";
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
            target.closest("[data-registration-action-trigger='true']")))
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

    const closeOnResize = () => setMenu(null);

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [menu]);

  const openMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    registration: AdminRegistrationReviewRow
  ) => {
    const trigger = event.currentTarget.getBoundingClientRect();
    const gutter = 16;
    const menuWidth = Math.min(272, window.innerWidth - gutter * 2);
    const menuHeight = Math.min(420, window.innerHeight - gutter * 2);
    const x = Math.max(
      gutter,
      Math.min(trigger.right - menuWidth, window.innerWidth - menuWidth - gutter)
    );
    const below = trigger.bottom + 8;
    const y =
      below + menuHeight <= window.innerHeight - gutter
        ? below
        : Math.max(gutter, trigger.top - menuHeight - 8);

    setMenu({ registration, x, y });
  };

  return (
    <>
      <div
        data-registration-review-cards="true"
        className="grid min-w-0 gap-3 xl:hidden"
      >
        {registrations.map((registration) => (
          <RegistrationCard
            key={registration.registrationId}
            registration={registration}
            activeFilter={activeFilter}
            formId={formId}
            selectionScope={selectionScope}
            isTournamentTerminal={isTournamentTerminal}
            returnHref={returnHref}
            menuOpen={
              menu?.registration.registrationId === registration.registrationId
            }
            onOpenMenu={openMenu}
          />
        ))}

        {registrations.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
            No registrations found for this status.
          </p>
        )}
      </div>

      <div className="hidden max-w-full overflow-x-auto overscroll-x-contain xl:block">
        <table className="w-full min-w-[900px] text-left text-sm 2xl:min-w-[1080px]">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-3 pr-3">
                <AdminRegistrationSelectAll
                  formId={formId}
                  name="registrationId"
                  scope={selectionScope}
                />
              </th>
              <th className="py-3 pr-5">Player / Order</th>
              <th className="py-3 pr-5">
                {desktopPresentation === "tournament-workbench"
                  ? "Division"
                  : "Tournament / Division"}
              </th>
              <th className="py-3 pr-5">
                {desktopPresentation === "tournament-workbench"
                  ? "Frozen ELO"
                  : "Registration ELO"}
              </th>
              <th className="py-3 pr-5">Verification Evidence</th>
              <th className="py-3 pr-5">Status</th>
              <th className="py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((registration) => (
              <tr
                key={registration.registrationId}
                data-registration-review-row="true"
                className="border-b border-white/5 align-top text-zinc-300 transition hover:bg-orange-500/[0.05]"
              >
                <td className="py-3 pr-3">
                  <RegistrationCheckbox
                    registration={registration}
                    formId={formId}
                    selectionScope={selectionScope}
                    isTournamentTerminal={isTournamentTerminal}
                  />
                </td>
                <td className="max-w-56 py-4 pr-5">
                  <p className="break-words font-semibold text-white">
                    {registration.playerDisplayName || "N/A"}
                  </p>
                  <p className="mt-1 text-xs font-black text-zinc-500">
                    Division order {formatPosition(registration.registrationOrder)}
                  </p>
                </td>
                <td className="max-w-64 py-4 pr-5">
                  {desktopPresentation === "tournament-workbench" ? (
                    <p className="break-words font-semibold text-white">
                      {registration.selectedBracket || "Division not assigned"}
                    </p>
                  ) : (
                    <>
                      <p className="break-words font-semibold text-white">
                        {registration.tournamentName || "N/A"}
                      </p>
                      <p className="mt-1 break-words text-xs text-zinc-500">
                        {registration.selectedBracket || "Division not assigned"}
                      </p>
                    </>
                  )}
                </td>
                <td className="py-4 pr-5">
                  <p className="font-black text-orange-200">
                    {formatElo(registration.frozenRegistrationElo)}
                  </p>
                  {desktopPresentation === "standard" && (
                    <p className="mt-1 max-w-40 text-xs leading-5 text-zinc-500">
                      Frozen at registration, not current profile ELO
                    </p>
                  )}
                </td>
                <td className="max-w-64 py-4 pr-5 text-xs leading-5">
                  {desktopPresentation === "tournament-workbench" ? (
                    <CompactVerificationEvidence registration={registration} />
                  ) : (
                    <>
                      <EvidenceLine
                        label="Verified division"
                        value={registration.verifiedDivision}
                      />
                      <EvidenceLine
                        label="Faction"
                        value={registration.verifiedFaction}
                      />
                      <EvidenceLine
                        label="Source"
                        value={formatVerificationSource(
                          registration.verificationSource
                        )}
                      />
                      <EvidenceLine
                        label="Checked"
                        value={formatDateTime(registration.verificationCheckedAt)}
                      />
                      <EvidenceLine
                        label="Rules"
                        value={registration.eligibilityRulesVersion}
                      />
                    </>
                  )}
                </td>
                <td className="py-4 pr-5">
                  <StatusBadge status={registration.status} />
                  {registration.status === "waitlisted" && (
                    <>
                      <p className="mt-2 text-xs font-black text-amber-300">
                        {registration.waitlistOfferStatus
                          ? `Offer ${formatStatus(registration.waitlistOfferStatus)}`
                          : `FIFO position ${formatPosition(
                              registration.waitlistPosition
                            )}`}
                      </p>
                    </>
                  )}
                  {registration.isDivisionLaunched && (
                    <p className="mt-2 text-xs font-black text-sky-300">
                      Division launched — roster locked
                    </p>
                  )}
                  {isTournamentTerminal && (
                    <p className="mt-2 text-xs font-black text-amber-300">
                      Terminal tournament — competition controls are locked.
                    </p>
                  )}
                </td>
                <td className="py-3 text-right">
                  <ActionMenuButton
                    registration={registration}
                    expanded={
                      menu?.registration.registrationId ===
                      registration.registrationId
                    }
                    onOpenMenu={openMenu}
                  />
                </td>
              </tr>
            ))}

            {registrations.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  No registrations found for this status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {typeof document !== "undefined" && menu
        ? createPortal(
            <RegistrationContextMenu
              menuRef={menuRef}
              menu={menu}
              activeFilter={activeFilter}
              updateRegistrationStatusAction={updateRegistrationStatusAction}
              isTournamentTerminal={isTournamentTerminal}
              returnHref={returnHref}
              workspaceTournamentId={workspaceTournamentId}
              workspaceSection={workspaceSection}
              onClose={() => setMenu(null)}
            />,
            document.body
          )
        : null}
    </>
  );
}

function RegistrationCard({
  registration,
  activeFilter,
  formId,
  selectionScope,
  isTournamentTerminal,
  returnHref,
  menuOpen,
  onOpenMenu,
}: {
  registration: AdminRegistrationReviewRow;
  activeFilter: FilterStatus;
  formId: string;
  selectionScope?: string;
  isTournamentTerminal: boolean;
  returnHref: string;
  menuOpen: boolean;
  onOpenMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    registration: AdminRegistrationReviewRow
  ) => void;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <RegistrationCheckbox
          registration={registration}
          formId={formId}
          selectionScope={selectionScope}
          isTournamentTerminal={isTournamentTerminal}
        />
        <div className="min-w-0 flex-1">
          <p className="break-words font-black text-white">
            {registration.playerDisplayName || "N/A"}
          </p>
          <p className="mt-1 text-xs font-black text-orange-300">
            Division order {formatPosition(registration.registrationOrder)}
          </p>
        </div>
        <StatusBadge status={registration.status} />
      </div>

      {registration.isDivisionLaunched && (
        <p className="mt-3 rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs font-bold text-sky-200">
          Division launched — roster decisions are locked.
        </p>
      )}
      {isTournamentTerminal && (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-950/20 p-3 text-xs font-bold text-amber-100">
          Terminal tournament — competition controls are locked.
        </p>
      )}

      <div className="mt-4 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="break-words font-semibold text-white">
          {registration.tournamentName || "N/A"}
        </p>
        <p className="mt-1 break-words text-xs text-zinc-400">
          {registration.selectedBracket || "Division not assigned"}
        </p>
      </div>

      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <EvidenceValue
          label="Frozen tournament registration ELO"
          value={formatElo(registration.frozenRegistrationElo)}
          detail="Captured at registration; not current profile ELO."
        />
        <EvidenceValue
          label="Verified division"
          value={registration.verifiedDivision}
        />
        <EvidenceValue
          label="Verified faction"
          value={registration.verifiedFaction}
        />
        <EvidenceValue
          label="Verification source"
          value={formatVerificationSource(registration.verificationSource)}
        />
        <EvidenceValue
          label="Verification / check time"
          value={formatDateTime(registration.verificationCheckedAt)}
        />
        <EvidenceValue
          label="Eligibility rules version"
          value={registration.eligibilityRulesVersion}
        />
        <EvidenceValue
          label="Registered at"
          value={formatDateTime(registration.registeredAt)}
        />
        <EvidenceValue
          label="Waitlist position"
          value={
            registration.status === "waitlisted"
              ? registration.waitlistOfferStatus
                ? `Offer ${formatStatus(registration.waitlistOfferStatus)}`
                : formatPosition(registration.waitlistPosition)
              : "Not waitlisted"
          }
        />
      </dl>

      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <a
          href={buildRegistrationHref(
            returnHref,
            activeFilter,
            registration.registrationId
          )}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-200 transition hover:border-orange-400/50 hover:text-orange-200"
        >
          Review details
        </a>
        <ActionMenuButton
          registration={registration}
          expanded={menuOpen}
          onOpenMenu={onOpenMenu}
        />
      </div>
    </article>
  );
}

function RegistrationCheckbox({
  registration,
  formId,
  selectionScope,
  isTournamentTerminal,
}: {
  registration: AdminRegistrationReviewRow;
  formId: string;
  selectionScope?: string;
  isTournamentTerminal: boolean;
}) {
  return (
    <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-black/30">
      <input
        form={formId}
        type="checkbox"
        name="registrationId"
        value={registration.registrationId}
        data-registration-selection="true"
        data-registration-selection-scope={selectionScope}
        aria-label={`Select registration for ${
          registration.playerDisplayName || "player"
        }`}
        disabled={!isBulkApprovable(registration, isTournamentTerminal)}
        className="h-5 w-5 rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500"
      />
    </label>
  );
}

function ActionMenuButton({
  registration,
  expanded,
  onOpenMenu,
}: {
  registration: AdminRegistrationReviewRow;
  expanded: boolean;
  onOpenMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    registration: AdminRegistrationReviewRow
  ) => void;
}) {
  return (
    <button
      type="button"
      data-registration-action-trigger="true"
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-label={`Open actions for ${
        registration.playerDisplayName || "player"
      }`}
      onClick={(event) => onOpenMenu(event, registration)}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-orange-200 transition hover:border-orange-300/60 hover:bg-orange-500/20"
    >
      <MoreVertical className="h-5 w-5" />
      <span className="xl:hidden">Actions</span>
    </button>
  );
}

function RegistrationContextMenu({
  menu,
  activeFilter,
  updateRegistrationStatusAction,
  isTournamentTerminal,
  returnHref,
  workspaceTournamentId,
  workspaceSection,
  onClose,
  menuRef,
}: {
  menu: ContextMenuState;
  activeFilter: FilterStatus;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
  isTournamentTerminal: boolean;
  returnHref: string;
  workspaceTournamentId?: string;
  workspaceSection?: "registrations" | "players-waitlist";
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}) {
  const registration = menu.registration;
  const actions = getMenuActions(registration, isTournamentTerminal);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Registration actions for ${registration.playerDisplayName}`}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[10050] max-h-[calc(100dvh-2rem)] w-[min(17rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-orange-500/25 bg-zinc-950/95 p-2 text-sm shadow-2xl shadow-orange-950/50 backdrop-blur-xl"
    >
      <div className="border-b border-white/10 px-3 py-2">
        <p className="text-xs font-black uppercase tracking-wider text-orange-300">
          Division order {formatPosition(registration.registrationOrder)}
        </p>
        <p className="mt-1 break-words text-sm font-bold text-white">
          {registration.playerDisplayName || "Player"}
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
              workspaceTournamentId={workspaceTournamentId}
              workspaceSection={workspaceSection}
              onSubmitStart={onClose}
            />
          ) : (
            <MenuLink
              key={`${action.kind}:${action.label}`}
              href={buildRegistrationHref(
                returnHref,
                activeFilter,
                registration.registrationId,
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
  workspaceTournamentId,
  workspaceSection,
  onSubmitStart,
}: {
  action: Extract<MenuAction, { kind: "direct" }>;
  registration: AdminRegistrationReviewRow;
  activeFilter: FilterStatus;
  updateRegistrationStatusAction: (formData: FormData) => void | Promise<void>;
  workspaceTournamentId?: string;
  workspaceSection?: "registrations" | "players-waitlist";
  onSubmitStart: () => void;
}) {
  return (
    <form action={updateRegistrationStatusAction} onSubmit={onSubmitStart}>
      <input
        type="hidden"
        name="registrationId"
        value={registration.registrationId}
      />
      <input type="hidden" name="nextStatus" value={action.nextStatus} />
      <input type="hidden" name="activeFilter" value={activeFilter} />
      <input type="hidden" name="selected" value="" />
      {workspaceTournamentId && (
        <input
          type="hidden"
          name="workspaceTournamentId"
          value={workspaceTournamentId}
        />
      )}
      {workspaceSection && (
        <input
          type="hidden"
          name="workspaceSection"
          value={workspaceSection}
        />
      )}
      <input
        type="hidden"
        name="adminNotes"
        value={registration.privateAdminNote ?? ""}
      />
      <button
        type="submit"
        role="menuitem"
        className={`min-h-11 w-full rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-wider transition ${action.className}`}
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
      role="menuitem"
      className={`flex min-h-11 items-center rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider transition ${className}`}
    >
      {label}
    </a>
  );
}

function buildRegistrationHref(
  returnHref: string,
  filter: FilterStatus,
  selected: string,
  focus?: FocusTarget
) {
  const params = new URLSearchParams();
  params.set("filter", filter);
  params.set("selected", selected);
  if (focus) {
    params.set("focus", focus);
  }
  const separator = returnHref.includes("?") ? "&" : "?";
  return `${returnHref}${separator}${params.toString()}`;
}

function getMenuActions(
  registration: AdminRegistrationReviewRow,
  isTournamentTerminal: boolean
): MenuAction[] {
  const { status } = registration;
  const detailsAction: MenuAction = {
    kind: "details",
    label: "Review Details",
    className: "text-white hover:bg-white/10",
  };
  const approveAction: MenuAction = {
    kind: "direct",
    label: "Approve",
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
    label: "Edit Private Note",
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
  const returnPendingAction: MenuAction = {
    kind: "direct",
    label: "Return to Pending Review",
    nextStatus: "pending",
    className: "text-slate-200 hover:bg-white/10",
  };

  if (registration.isDivisionLaunched || isTournamentTerminal) {
    return [detailsAction];
  }

  if (status === "pending") {
    return [
      detailsAction,
      approveAction,
      rejectAction,
      writeNoteAction,
      manualReviewAction,
    ];
  }

  if (status === "manual_review") {
    return [
      detailsAction,
      approveAction,
      rejectAction,
      writeNoteAction,
      returnPendingAction,
    ];
  }

  if (status === "waitlisted") {
    return [
      detailsAction,
      rejectAction,
      writeNoteAction,
    ];
  }

  if (status === "approved") {
    return [
      detailsAction,
      manualReviewAction,
      rejectAction,
      writeNoteAction,
    ];
  }

  if (status === "withdrawn") {
    return [detailsAction, writeNoteAction];
  }

  return [
    detailsAction,
    approveAction,
    manualReviewAction,
    writeNoteAction,
  ];
}

function isBulkApprovable(
  registration: AdminRegistrationReviewRow,
  isTournamentTerminal: boolean
) {
  return (
    !isTournamentTerminal &&
    !registration.isDivisionLaunched &&
    (registration.status === "pending" ||
      registration.status === "manual_review")
  );
}

function EvidenceValue({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number | null;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/30 p-3">
      <dt className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-white">
        {formatValue(value)}
      </dd>
      {detail && <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>}
    </div>
  );
}

function EvidenceLine({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <p className="break-words">
      <span className="text-zinc-500">{label}:</span>{" "}
      <span className="font-semibold text-zinc-200">{formatValue(value)}</span>
    </p>
  );
}

function CompactVerificationEvidence({
  registration,
}: {
  registration: AdminRegistrationReviewRow;
}) {
  return (
    <div className="space-y-1 break-words">
      <p className="font-semibold text-zinc-200">
        <span className="sr-only">Verified division: </span>
        <span>{formatValue(registration.verifiedDivision)}</span>
        <span aria-hidden="true" className="text-zinc-600">
          {" "}·{" "}
        </span>
        <span className="sr-only">Verification source: </span>
        <span>
          {formatValue(
            formatVerificationSource(registration.verificationSource)
          )}
        </span>
      </p>
      <p className="text-zinc-400">
        <span className="sr-only">Verified faction: </span>
        <span>{formatValue(registration.verifiedFaction)}</span>
        <span aria-hidden="true" className="text-zinc-600">
          {" "}·{" "}
        </span>
        <span className="sr-only">Verification checked: </span>
        <span>
          {formatValue(formatDateTime(registration.verificationCheckedAt))}
        </span>
      </p>
      <p className="text-zinc-400">
        <span className="text-zinc-500">Rules:</span>{" "}
        <span className="font-semibold text-zinc-200">
          {formatValue(registration.eligibilityRulesVersion)}
        </span>
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminRegistrationStatus }) {
  return (
    <span
      className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
        status
      )}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatVerificationSource(source: string | null) {
  if (!source) {
    return null;
  }

  if (source.toLowerCase() === "relic") {
    return "Relic";
  }

  if (source.toLowerCase() === "coh3stats") {
    return "CoH3 Stats";
  }

  return formatStatus(source);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? new Date(value).toLocaleString()
    : "Unavailable";
}

function formatElo(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString();
}

function formatPosition(value: number | null) {
  return value === null ? "Unavailable" : `#${value}`;
}

function formatValue(value: string | number | null) {
  return value === null || value === "" ? "Unavailable" : value;
}

function getStatusBadgeClass(status: AdminRegistrationStatus) {
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

  if (status === "withdrawn") {
    return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  }

  return "border-white/10 bg-white/[0.04] text-zinc-300";
}
