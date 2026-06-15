"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { deleteTournament } from "@/app/admin/tournaments/actions";

export type TournamentDeletionPreview = {
  registrations: number;
  brackets: number;
  generated_brackets: number;
  rounds: number;
  matches: number;
  standings: number;
  result_submissions: number;
  storage_files: number;
};

export default function DeleteTournamentControl({
  tournamentId,
  tournamentTitle,
  editHref,
  preview,
}: {
  tournamentId: string;
  tournamentTitle: string;
  editHref: string;
  preview: TournamentDeletionPreview;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const portalRoot =
    typeof document === "undefined" ? null : document.body;
  const confirmed = confirmation === "DELETE";

  useEffect(() => {
    if (!menuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmation("");
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setConfirmation("");
  };

  return (
    <>
      <div ref={menuRef} className="absolute top-3 right-3 z-20">
        <button
          type="button"
          aria-label={`Tournament actions for ${tournamentTitle}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/60 text-zinc-400 shadow-lg backdrop-blur-md transition hover:border-orange-400/60 hover:bg-orange-500/10 hover:text-orange-300"
        >
          <MoreVertical size={18} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-11 right-0 w-52 overflow-hidden rounded-xl border border-white/15 bg-zinc-950/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
            >
              <Link
                href={`${editHref}&edit=1`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-200 transition hover:bg-orange-500/15 hover:text-orange-200"
              >
                <Pencil size={15} />
                Edit Tournament
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-300 transition hover:bg-red-500/15 hover:text-red-200"
              >
                <Trash2 size={15} />
                Delete Tournament
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {portalRoot &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-[9999] grid place-items-center p-4 sm:p-8">
                <motion.button
                  type="button"
                  aria-label="Close tournament deletion confirmation"
                  onClick={closeModal}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 h-full w-full cursor-default bg-black/90 backdrop-blur-md"
                />
                <motion.section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`delete-tournament-${tournamentId}`}
                  initial={{ opacity: 0, scale: 0.96, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  className="relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-red-500/40 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.18),transparent_36%),linear-gradient(145deg,rgba(24,8,8,0.99),rgba(3,7,18,0.99))] shadow-[0_0_110px_rgba(239,68,68,0.22)] sm:w-[calc(100vw-4rem)] md:min-w-[720px] lg:w-[65vw] lg:max-w-5xl"
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-red-500 shadow-[0_0_24px_rgba(239,68,68,0.9)]" />
                  <div className="p-6 sm:p-9 lg:p-10">
                    <div className="flex items-start justify-between gap-5">
                      <div className="flex items-start gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-red-400/40 bg-red-500/15 text-red-300">
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.32em] text-red-300">
                            Warning
                          </p>
                          <h2
                            id={`delete-tournament-${tournamentId}`}
                            className="mt-2 text-2xl font-black text-white sm:text-3xl"
                          >
                            Permanently Delete Tournament
                          </h2>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closeModal}
                        className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 text-zinc-400 transition hover:border-red-400/50 hover:text-white"
                        aria-label="Close deletion modal"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5">
                      <p className="font-bold leading-7 text-red-100">
                        You are about to permanently delete this tournament and
                        all related data. This action cannot be undone.
                      </p>
                      <p className="mt-4 text-xs font-black uppercase tracking-wider text-zinc-500">
                        Tournament
                      </p>
                      <p className="mt-2 break-words text-xl font-black text-white">
                        {tournamentTitle}
                      </p>
                    </div>

                    <div className="mt-6">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-500">
                        Related Records
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Count label="Registrations" value={preview.registrations} />
                        <Count label="Tournament Brackets" value={preview.brackets} />
                        <Count label="Generated Brackets" value={preview.generated_brackets} />
                        <Count label="Bracket Rounds" value={preview.rounds} />
                        <Count label="Matches" value={preview.matches} />
                        <Count label="Standings" value={preview.standings} />
                        <Count label="Result Submissions" value={preview.result_submissions} />
                        <Count label="Storage Files" value={preview.storage_files} />
                      </div>
                    </div>

                    <form action={deleteTournament} className="mt-6">
                      <input
                        type="hidden"
                        name="tournamentId"
                        value={tournamentId}
                      />
                      <label className="block">
                        <span className="text-sm font-bold text-zinc-200">
                          Type <span className="text-red-300">DELETE</span> to
                          continue
                        </span>
                        <input
                          name="confirmation"
                          value={confirmation}
                          onChange={(event) =>
                            setConfirmation(event.target.value)
                          }
                          autoComplete="off"
                          className="mt-3 w-full rounded-xl border border-red-500/30 bg-black/50 px-4 py-3 font-mono text-white outline-none transition focus:border-red-400"
                        />
                      </label>

                      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="rounded-xl border border-white/15 px-5 py-3 font-black text-zinc-300 transition hover:border-white/30 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!confirmed}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Trash2 size={17} />
                          Permanently Delete Tournament
                        </button>
                      </div>
                    </form>
                  </div>
                </motion.section>
              </div>
            )}
          </AnimatePresence>,
          portalRoot
        )}
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="font-mono font-black text-white">{value}</span>
    </div>
  );
}
