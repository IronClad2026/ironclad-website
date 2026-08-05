"use client";

import { LockKeyhole } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ActiveTournamentEloSnapshot = {
  tournamentTitle: string;
  elo: number | null;
  division: string | null;
};

type ActiveTournamentEloSnapshotIndicatorProps = {
  snapshots: ActiveTournamentEloSnapshot[];
};

export default function ActiveTournamentEloSnapshotIndicator({
  snapshots,
}: ActiveTournamentEloSnapshotIndicatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const hoveredRef = useRef(false);
  const pointerTypeRef = useRef<string | null>(null);
  const pointerWasOpenRef = useRef(false);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (snapshots.length === 0) {
    return null;
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerTypeRef.current = event.pointerType;
    pointerWasOpenRef.current = open;
  };

  const handleClick = () => {
    const pointerType = pointerTypeRef.current;
    pointerTypeRef.current = null;

    if (pointerType === "touch" || pointerType === "pen") {
      setOpen(!pointerWasOpenRef.current);
      return;
    }

    setOpen(true);
  };

  const closeAfterFocusLeaves = (event: FocusEvent<HTMLSpanElement>) => {
    if (
      !hoveredRef.current &&
      !event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      setOpen(false);
    }
  };

  return (
    <span
      ref={rootRef}
      className="relative ml-auto inline-flex shrink-0"
      onMouseEnter={() => {
        hoveredRef.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;

        if (!rootRef.current?.contains(document.activeElement)) {
          setOpen(false);
        }
      }}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={closeAfterFocusLeaves}
    >
      <button
        type="button"
        aria-label="View active tournament ELO snapshots"
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        className="grid h-7 w-7 place-items-center rounded-full border border-orange-400/35 bg-orange-400/10 text-orange-300 shadow-[0_0_18px_rgba(249,115,22,0.12)] transition hover:border-orange-300/70 hover:bg-orange-400/20 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <LockKeyhole aria-hidden="true" size={14} strokeWidth={2.25} />
      </button>

      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute top-full right-0 z-[1500] mt-2 block w-72 max-w-[calc(100vw-3rem)] border border-orange-400/35 bg-zinc-950/98 p-4 text-left shadow-[0_20px_55px_rgba(0,0,0,0.75)] backdrop-blur-xl"
        >
          <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">
            Tournament ELO Snapshot
          </span>

          <span className="mt-3 block space-y-3">
            {snapshots.map((snapshot, index) => (
              <span
                key={`${snapshot.tournamentTitle}-${index}`}
                className="block border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
              >
                <span className="block text-sm font-bold text-white">
                  {snapshot.tournamentTitle}
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-300">
                  Snapshot ELO: {snapshot.elo ?? "N/A"}
                </span>
                <span className="block text-xs leading-5 text-zinc-300">
                  Division: {snapshot.division ?? "N/A"}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
                  {"Locked for this tournament's duration."}
                </span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
