import type { ReactNode } from "react";
import type {
  WarfrontOperationRoomBootstrap,
  WarfrontRoomCompany,
  WarfrontRoomDiceGame,
  WarfrontRoomResultScore,
  WarfrontRoomSide,
} from "@/lib/warfront/contracts";
import type { WarfrontOperationRoomBootstrapFailureCode } from "@/lib/warfront/room";

export default function WarfrontRoom({ bootstrap }: { bootstrap: WarfrontOperationRoomBootstrap }) {
  const challengerRoster = bootstrap.rosters.filter((entry) => entry.side === "challenger");
  const opponentRoster = bootstrap.rosters.filter((entry) => entry.side === "opponent");

  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-24 text-zinc-100 sm:px-6 sm:pt-28">
      <section className="mx-auto max-w-7xl">
        <header className="border border-orange-500/35 bg-gradient-to-br from-orange-500/15 via-zinc-950 to-black p-5 shadow-2xl shadow-orange-950/20 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Warfront Operation Room</p>
          <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                {bootstrap.challengerCompany.name}<span className="mx-3 text-orange-400">VS</span>{bootstrap.opponentCompany.name}
              </h1>
              <p className="mt-3 text-sm text-zinc-400">Participant view · {sideLabel(bootstrap.viewerSide)} side</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
              <StatusChip label="Status" value={bootstrap.logicalStatus} />
              <StatusChip label="Format" value={bootstrap.format} />
              <StatusChip label="Series" value={`BO${bootstrap.seriesBestOf}`} />
              <StatusChip label="Region" value={bootstrap.region ?? "Unspecified"} />
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <CompanyRoster company={bootstrap.challengerCompany} roster={challengerRoster} side="challenger" teamElo={bootstrap.challengerRosterEloSnapshot} />
          <CompanyRoster company={bootstrap.opponentCompany} roster={opponentRoster} side="opponent" teamElo={bootstrap.opponentRosterEloSnapshot} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <OperationStatus bootstrap={bootstrap} />
          <DiceStatus bootstrap={bootstrap} />
          <ResultStatus bootstrap={bootstrap} />
          <RoomMetadata bootstrap={bootstrap} />
        </div>
      </section>
    </main>
  );
}

export function WarfrontRoomUnavailable({ code }: {
  code: Exclude<WarfrontOperationRoomBootstrapFailureCode, "unauthenticated">;
}) {
  const message = {
    invalid_operation_id: "This operation link is invalid.",
    inaccessible: "This operation room is unavailable to your account.",
    malformed_response: "The operation room could not be loaded safely. Please try again later.",
    unavailable: "The operation room is temporarily unavailable. Please try again later.",
  }[code];

  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-24 text-zinc-100 sm:px-6 sm:pt-28">
      <section className="mx-auto max-w-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Warfront Operation Room</p>
        <h1 className="mt-3 text-2xl font-black text-white">Room unavailable</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
      </section>
    </main>
  );
}

function CompanyRoster({ company, roster, side, teamElo }: {
  company: WarfrontRoomCompany;
  roster: WarfrontOperationRoomBootstrap["rosters"];
  side: WarfrontRoomSide;
  teamElo: number;
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-950/75 p-5 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">{sideLabel(side)}</p><h2 className="mt-1 truncate text-2xl font-black text-white">{company.name}</h2><p className="mt-1 text-sm text-zinc-400">[{company.tag}]</p></div>
        <div className="shrink-0 border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Team ELO</p><p className="text-lg font-black text-orange-200">{formatNumber(teamElo)}</p></div>
      </div>
      <ul className="mt-4 divide-y divide-white/10">
        {roster.map((entry, index) => <li key={`${side}-${entry.selectedAt}-${index}`} className="flex items-center justify-between gap-4 py-3"><span className="min-w-0 truncate font-semibold text-zinc-100">{entry.displayName}</span><span className="shrink-0 text-sm font-bold text-orange-200">{formatNumber(entry.eloSnapshot)} ELO</span></li>)}
      </ul>
    </section>
  );
}

function OperationStatus({ bootstrap }: { bootstrap: WarfrontOperationRoomBootstrap }) {
  return <RoomPanel title="Operation status" eyebrow="Lifecycle"><dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2"><Timestamp label="Opened" value={bootstrap.openedAt} /><Timestamp label="Expires" value={bootstrap.expiresAt} /><Timestamp label="Accepted" value={bootstrap.acceptedAt} /><Timestamp label="Started" value={bootstrap.startedAt} /><Timestamp label="Completed" value={bootstrap.completedAt} /><Timestamp label="Cancelled" value={bootstrap.cancelledAt} /></dl></RoomPanel>;
}

function DiceStatus({ bootstrap }: { bootstrap: WarfrontOperationRoomBootstrap }) {
  return <RoomPanel title="Dice status" eyebrow="Read-only rolloff"><p className="text-sm text-zinc-400">{bootstrap.dice.isActionable ? "The rolloff is currently actionable in the authoritative Room state." : `Read-only${bootstrap.dice.readOnlyReason ? `: ${bootstrap.dice.readOnlyReason}` : "."}`}</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{bootstrap.dice.games.map((game) => <DiceGame key={game.gameNumber} game={game} />)}</div><p className="mt-4 text-xs text-zinc-500">Dice controls are not available in this read-only phase.</p></RoomPanel>;
}

function DiceGame({ game }: { game: WarfrontRoomDiceGame }) {
  return <article className="border border-zinc-800 bg-black/35 p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-black text-white">Game {game.gameNumber}</h3><span className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200">{game.state}</span></div><dl className="mt-3 space-y-2 text-xs text-zinc-400"><DataRow label="Availability" value={game.available ? "Available" : "Locked"} /><DataRow label="Tie round" value={game.currentTieRound === null ? "—" : String(game.currentTieRound)} /><DataRow label="Winner" value={game.winnerSide ? sideLabel(game.winnerSide) : "—"} /><DataRow label="Rounds recorded" value={String(game.rounds.length)} /></dl></article>;
}

function ResultStatus({ bootstrap }: { bootstrap: WarfrontOperationRoomBootstrap }) {
  const { result } = bootstrap;
  return <RoomPanel title="Result status" eyebrow="Confirmation and finalization"><div className="grid gap-4 sm:grid-cols-2"><ResultScore title="Submitted result" score={result.submittedResult} /><ResultScore title="Final result" score={result.finalResult} /></div><dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2"><DataRow label="Challenger confirmed" value={result.challengerConfirmed ? "Yes" : "No"} /><DataRow label="Opponent confirmed" value={result.opponentConfirmed ? "Yes" : "No"} /><DataRow label="Dispute" value={result.disputed ? "Active" : "None"} /><DataRow label="Disputing side" value={result.disputingSide ? sideLabel(result.disputingSide) : "—"} /><Timestamp label="Confirmation deadline" value={result.confirmationDeadline} /><Timestamp label="Finalized" value={result.finalizedAt} /></dl><p className="mt-4 text-xs text-zinc-500">Result controls are not available in this read-only phase.</p></RoomPanel>;
}

function ResultScore({ title, score }: { title: string; score: WarfrontRoomResultScore | null }) {
  return <article className="border border-zinc-800 bg-black/35 p-3"><h3 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">{title}</h3>{score ? <p className="mt-2 font-bold text-white">{score.challengerWins} — {score.opponentWins}<span className="ml-2 text-sm font-medium text-orange-200">{score.winnerSide}</span></p> : <p className="mt-2 text-sm text-zinc-500">Not recorded</p>}</article>;
}

function RoomMetadata({ bootstrap }: { bootstrap: WarfrontOperationRoomBootstrap }) {
  const { assistance, capabilities, chat } = bootstrap;
  return <RoomPanel title="Room intelligence" eyebrow="Assistance, chat, and state"><div className="grid gap-4 sm:grid-cols-2"><article className="border border-zinc-800 bg-black/35 p-3"><h3 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Assistance</h3><p className="mt-2 text-lg font-black capitalize text-white">{assistance.status}</p><p className="mt-2 text-xs text-zinc-500">No assistance controls are available in this phase.</p></article><article className="border border-zinc-800 bg-black/35 p-3"><h3 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Chat</h3><p className="mt-2 text-lg font-black capitalize text-white">{chat.contentState}</p><dl className="mt-3 space-y-2 text-xs text-zinc-400"><DataRow label="Unread" value={String(chat.unreadCount)} /><DataRow label="Latest sequence" value={chat.latestSequence === null ? "—" : String(chat.latestSequence)} /><DataRow label="Last read sequence" value={chat.lastReadSequence === null ? "—" : String(chat.lastReadSequence)} /></dl><p className="mt-3 text-xs text-zinc-500">{chat.contentState === "purged" ? "Chat content is no longer available." : "Transcript access is not included in this read-only phase."}</p></article></div><div className="mt-4 border-t border-white/10 pt-4"><h3 className="text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Room-state indicators</h3><ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><Capability label="Dice" value={capabilities.canRollByRoomState} /><Capability label="Submit result" value={capabilities.canSubmitResultByRoomState} /><Capability label="Confirm result" value={capabilities.canConfirmResultByRoomState} /><Capability label="Dispute result" value={capabilities.canDisputeByRoomState} /><Capability label="Read chat" value={capabilities.canReadChat} /><Capability label="Send chat" value={capabilities.canSendChatByRoomState} /></ul></div></RoomPanel>;
}

function RoomPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="border border-zinc-800 bg-zinc-950/75 p-5 shadow-xl shadow-black/20 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-300">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-white">{title}</h2><div className="mt-4">{children}</div></section>;
}

function StatusChip({ label, value }: { label: string; value: string }) { return <div className="border border-white/10 bg-black/30 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-1 font-bold text-zinc-100">{value}</p></div>; }
function Timestamp({ label, value }: { label: string; value: string | null }) { return <DataRow label={label} value={value ? formatTimestamp(value) : "—"} />; }
function DataRow({ label, value }: { label: string; value: string }) { return <div className="flex items-baseline justify-between gap-3"><dt className="text-zinc-500">{label}</dt><dd className="text-right font-semibold text-zinc-200">{value}</dd></div>; }
function Capability({ label, value }: { label: string; value: boolean }) { return <li className="flex items-center justify-between gap-3 border border-zinc-800 bg-black/35 px-3 py-2"><span className="text-zinc-300">{label}</span><span className={value ? "font-bold text-orange-200" : "font-bold text-zinc-500"}>{value ? "Room state ready" : "Not ready"}</span></li>; }
function sideLabel(side: WarfrontRoomSide): string { return side === "challenger" ? "Challenger" : "Opponent"; }
function formatTimestamp(value: string): string { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
function formatNumber(value: number): string { return new Intl.NumberFormat("en").format(value); }
