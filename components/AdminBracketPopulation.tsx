"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  GitBranch,
  RotateCcw,
  ShieldCheck,
  Trophy,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { saveBracketAssignments } from "@/app/admin/tournaments/actions";

export type BracketPopulationParticipant = {
  id: string;
  name: string;
  country: string;
  elo: number;
};

export type BracketPopulationData = {
  generatedBracketId: string;
  bracketId: string;
  bracketName: string;
  format: "single_elimination" | "round_robin";
  slotCount: number;
  assignments: Record<number, string | null>;
  participants: BracketPopulationParticipant[];
};

type BracketDragPayload = {
  registrationId: string;
  sourceSlot: number | null;
};

type AdminBracketPopulationProps = {
  tournamentId: string;
  tournamentTitle: string;
  bracket: BracketPopulationData;
  buttonLabel?: string;
};

export default function AdminBracketPopulation(
  props: AdminBracketPopulationProps
) {
  const assignmentVersion = JSON.stringify(props.bracket.assignments);

  return (
    <AdminBracketPopulationWorkspace
      key={`${props.bracket.generatedBracketId}:${assignmentVersion}`}
      {...props}
    />
  );
}

function AdminBracketPopulationWorkspace({
  tournamentId,
  tournamentTitle,
  bracket,
  buttonLabel = "Populate Bracket",
}: AdminBracketPopulationProps) {
  const [open, setOpen] = useState(false);
  const portalRoot =
    typeof document === "undefined" ? null : document.body;
  const [assignments, setAssignments] = useState(bracket.assignments);
  const [activeDropTarget, setActiveDropTarget] = useState<
    number | "pool" | null
  >(null);

  const assignedIds = useMemo(
    () =>
      new Set(
        Object.values(assignments).filter(
          (registrationId): registrationId is string =>
            Boolean(registrationId)
        )
      ),
    [assignments]
  );
  const availableParticipants = bracket.participants.filter(
    (participant) => !assignedIds.has(participant.id)
  );
  const serializedAssignments = JSON.stringify(
    Array.from({ length: bracket.slotCount }, (_, index) => ({
      slot_number: index + 1,
      registration_id: assignments[index + 1] ?? null,
    }))
  );

  const assignParticipant = (slotNumber: number, registrationId: string) => {
    setAssignments((current) => {
      const next = { ...current };

      for (const [slot, assignedId] of Object.entries(next)) {
        if (assignedId === registrationId) {
          next[Number(slot)] = null;
        }
      }

      next[slotNumber] = registrationId || null;
      return next;
    });
  };

  const beginDrag = (
    event: DragEvent<HTMLElement>,
    registrationId: string,
    sourceSlot: number | null
  ) => {
    const payload: BracketDragPayload = { registrationId, sourceSlot };
    event.dataTransfer.setData(
      "application/x-ironclad-bracket",
      JSON.stringify(payload)
    );
    event.dataTransfer.setData("text/plain", registrationId);
    event.dataTransfer.effectAllowed = "move";
  };

  const readDragPayload = (
    event: DragEvent<HTMLElement>
  ): BracketDragPayload | null => {
    const encoded = event.dataTransfer.getData(
      "application/x-ironclad-bracket"
    );

    if (encoded) {
      try {
        return JSON.parse(encoded) as BracketDragPayload;
      } catch {
        return null;
      }
    }

    const registrationId = event.dataTransfer.getData("text/plain");
    return registrationId
      ? { registrationId, sourceSlot: null }
      : null;
  };

  const dropIntoSlot = (
    targetSlot: number,
    payload: BracketDragPayload
  ) => {
    setAssignments((current) => {
      const next = { ...current };
      const displacedRegistrationId = next[targetSlot] ?? null;

      if (payload.sourceSlot === targetSlot) return current;

      for (const [slot, assignedId] of Object.entries(next)) {
        if (assignedId === payload.registrationId) {
          next[Number(slot)] = null;
        }
      }

      next[targetSlot] = payload.registrationId;

      if (payload.sourceSlot !== null) {
        next[payload.sourceSlot] = displacedRegistrationId;
      }

      return next;
    });
    setActiveDropTarget(null);
  };

  const returnToParticipantPool = (registrationId: string) => {
    setAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).map(([slot, assignedId]) => [
          Number(slot),
          assignedId === registrationId ? null : assignedId,
        ])
      )
    );
    setActiveDropTarget(null);
  };

  const closeEditor = () => {
    setAssignments(bracket.assignments);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssignments(bracket.assignments);
        setOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, bracket.assignments]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-white transition hover:bg-orange-400"
      >
        {buttonLabel}
      </button>

      {portalRoot &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[9999] isolate">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closeEditor}
              className="absolute inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-sm"
              aria-label="Close bracket management workspace"
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bracket-workspace-title"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
                  className="absolute inset-0 flex h-dvh w-screen max-w-none flex-col overflow-hidden border-r border-orange-500/30 bg-[#080c14] shadow-[24px_0_100px_rgba(0,0,0,0.75)]"
            >
              <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-r from-orange-950/60 via-slate-950 to-black px-5 py-5 sm:px-8">
                <div className="absolute inset-y-0 left-0 w-1 bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.9)]" />
                <div className="flex items-start justify-between gap-5">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl border border-orange-400/30 bg-orange-500/10 text-orange-300 sm:grid">
                      <GitBranch size={23} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                        Tournament Control Center
                      </p>
                      <h2
                        id="bracket-workspace-title"
                        className="mt-1 truncate text-xl font-black text-white sm:text-2xl"
                      >
                        Populate {bracket.bracketName}
                      </h2>
                      <p className="mt-1 truncate text-sm text-slate-400">
                        {tournamentTitle}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-white"
                    aria-label="Close bracket population editor"
                  >
                    <X size={20} />
                  </button>
                </div>
              </header>

              <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden">
                <aside className="flex min-h-0 flex-col border-b border-white/10 bg-black/25 p-5 lg:overflow-hidden lg:border-r lg:border-b-0 lg:p-6">
                  <section className="shrink-0">
                    <SectionLabel>Tournament Information</SectionLabel>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start gap-3">
                        <Trophy
                          size={18}
                          className="mt-0.5 shrink-0 text-orange-300"
                        />
                        <div className="min-w-0">
                          <p className="font-black text-white">
                            {tournamentTitle}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Manual placement workspace
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="mt-6 shrink-0">
                    <SectionLabel>Bracket Information</SectionLabel>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <InfoTile
                        label="Format"
                        value={
                          bracket.format === "single_elimination"
                            ? "Single Elim."
                            : "Round Robin"
                        }
                      />
                      <InfoTile
                        label="Slots"
                        value={String(bracket.slotCount)}
                      />
                    </div>
                  </section>

                  <section
                    onDragEnter={() => setActiveDropTarget("pool")}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      ) {
                        setActiveDropTarget(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const payload = readDragPayload(event);
                      if (payload) {
                        returnToParticipantPool(payload.registrationId);
                      }
                    }}
                    className={`mt-6 flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-2xl border p-3 transition ${
                      activeDropTarget === "pool"
                        ? "border-orange-400/60 bg-orange-500/10 shadow-[0_0_28px_rgba(249,115,22,0.12)]"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <SectionLabel>Approved Participants</SectionLabel>
                        <p className="mt-1 text-xs text-slate-500">
                          Drag a player into a bracket slot
                        </p>
                      </div>
                      <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-black text-sky-200">
                        {availableParticipants.length}
                      </span>
                    </div>

                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                      {availableParticipants.map((participant) => (
                        <div
                          key={participant.id}
                          draggable
                          onDragStart={(event) =>
                            beginDrag(event, participant.id, null)
                          }
                          onDragEnd={() => setActiveDropTarget(null)}
                          className="cursor-grab rounded-xl border border-white/10 bg-black/30 p-3 transition hover:border-orange-400/40 active:cursor-grabbing"
                        >
                          <p className="font-bold text-white">
                            {participant.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                          {participant.country} - ELO {participant.elo}
                          </p>
                        </div>
                      ))}
                      {availableParticipants.length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                          Every approved participant is currently assigned.
                        </div>
                      )}
                    </div>
                  </section>
                </aside>

                <main className="min-h-0 min-w-0 overflow-y-auto p-5 sm:p-7 lg:p-8">
                  <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent p-4">
                    <div>
                      <SectionLabel>Current Assignments</SectionLabel>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignedIds.size} of {bracket.slotCount} slots populated
                          {" - "}
                        {availableParticipants.length} players available
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                      <ShieldCheck size={16} />
                      Server Validated
                    </div>
                  </section>

                  <section className="mt-7">
                    <SectionLabel>Bracket Structure</SectionLabel>
                    <h3 className="mt-1 text-xl font-black text-white">
                      Opening-round slots
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Drag approved participants into exact positions or use
                      the slot selectors.
                    </p>

                    <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
                      {Array.from(
                        { length: bracket.slotCount },
                        (_, index) => index + 1
                      ).map((slotNumber) => {
                        const registrationId = assignments[slotNumber] ?? "";
                        const participant = bracket.participants.find(
                          (item) => item.id === registrationId
                        );
                        const slotLabel =
                          bracket.format === "single_elimination"
                            ? `Opening Match ${Math.ceil(
                                slotNumber / 2
                        )} - Player ${
                                slotNumber % 2 === 1 ? "1" : "2"
                              }`
                            : `Entrant Slot ${slotNumber}`;

                        return (
                          <div
                            key={slotNumber}
                            onDragEnter={() =>
                              setActiveDropTarget(slotNumber)
                            }
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDragLeave={(event) => {
                              if (
                                !event.currentTarget.contains(
                                  event.relatedTarget as Node | null
                                )
                              ) {
                                setActiveDropTarget(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const payload = readDragPayload(event);
                              if (payload) {
                                dropIntoSlot(slotNumber, payload);
                              }
                            }}
                            className={`min-w-0 rounded-2xl border p-4 transition ${
                              activeDropTarget === slotNumber
                                ? "scale-[1.01] border-orange-300/80 bg-orange-500/15 shadow-[0_0_32px_rgba(249,115,22,0.18)]"
                                : participant
                                ? "border-orange-400/40 bg-orange-500/10 shadow-[0_0_24px_rgba(249,115,22,0.06)]"
                                : "border-white/10 bg-white/[0.03]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="inline-flex rounded-md border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">
                                  Slot {slotNumber}
                                </span>
                                <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                                  {slotLabel}
                                </p>
                              </div>
                              <div className="shrink-0">
                                {participant ? (
                                  <Check
                                    size={16}
                                    className="text-emerald-300"
                                  />
                                ) : (
                                  <Users size={16} className="text-slate-600" />
                                )}
                              </div>
                            </div>

                            {participant && (
                              <div
                                draggable
                                onDragStart={(event) =>
                                  beginDrag(
                                    event,
                                    participant.id,
                                    slotNumber
                                  )
                                }
                                onDragEnd={() => setActiveDropTarget(null)}
                                className="mt-3 cursor-grab rounded-lg border border-orange-400/20 bg-black/30 px-3 py-2 active:cursor-grabbing"
                              >
                                <p className="truncate text-sm font-black text-white">
                                  {participant.name}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  Drag to another slot or back to the player pool
                                </p>
                              </div>
                            )}

                            <select
                              value={registrationId}
                              onChange={(event) =>
                                assignParticipant(
                                  slotNumber,
                                  event.target.value
                                )
                              }
                              className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none transition focus:border-orange-400"
                            >
                              <option value="">TBD / Empty Slot</option>
                              {bracket.participants.map((option) => {
                                const assignedElsewhere =
                                  assignedIds.has(option.id) &&
                                  option.id !== registrationId;
                                return (
                                  <option
                                    key={option.id}
                                    value={option.id}
                                    disabled={assignedElsewhere}
                                  >
                        {option.name} - ELO {option.elo}
                        {assignedElsewhere ? " - Assigned" : ""}
                                  </option>
                                );
                              })}
                            </select>

                            {participant && (
                              <button
                                type="button"
                                onClick={() =>
                                  assignParticipant(slotNumber, "")
                                }
                                className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400 transition hover:text-orange-300"
                              >
                                <UserMinus size={14} />
                                Remove Assignment
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </main>
              </div>

              <footer className="shrink-0 border-t border-white/10 bg-black/70 px-5 py-4 backdrop-blur-xl sm:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <SectionLabel>Save / Reset Controls</SectionLabel>
                    <p className="mt-1 text-xs text-slate-600">
                      Unsaved changes are discarded when this workspace closes.
                    </p>
                  </div>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setAssignments(bracket.assignments)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-black text-slate-300 transition hover:border-white/30 hover:text-white"
                    >
                      <RotateCcw size={16} />
                      Reset Changes
                    </button>
                    <form action={saveBracketAssignments}>
                      <input
                        type="hidden"
                        name="tournamentId"
                        value={tournamentId}
                      />
                      <input
                        type="hidden"
                        name="generatedBracketId"
                        value={bracket.generatedBracketId}
                      />
                      <input
                        type="hidden"
                        name="assignments"
                        value={serializedAssignments}
                      />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-white transition hover:bg-orange-400"
                      >
                        Save Bracket Assignments
                      </button>
                    </form>
                  </div>
                </div>
              </footer>
            </motion.div>
          </div>
            )}
          </AnimatePresence>,
          portalRoot
        )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">
      {children}
    </p>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}
