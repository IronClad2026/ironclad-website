"use client";

import { useActionState, useState } from "react";
import { Copy, Mic, Plus } from "lucide-react";
import type { CasterInvitation, CasterInvitationEvent } from "@/lib/caster/contracts";
import { updateCasterInvitation, type InvitationActionResult } from "./actions";
import CasterAdminNavigation from "./CasterAdminNavigation";

const initialState: InvitationActionResult = { kind: "idle" };
const panel = "rounded-2xl border border-white/10 bg-zinc-950/85 p-5 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-50";
const secondary = `${button} border-white/15 bg-black/45 text-white hover:border-orange-400/50`;
const input = "min-h-11 min-w-0 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-orange-300";
const statuses = { valid: "Available", expired: "Expired", revoked: "Revoked", claimed: "Claimed" };
const date = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });

export default function InvitationManagement({ invitations, events, page, hasMore }: {
  invitations: CasterInvitation[]; events: CasterInvitationEvent[]; page: number; hasMore: boolean;
}) {
  const [state, action, pending] = useActionState(updateCasterInvitation, initialState);

  return (
    <main className="min-h-svh bg-black text-white">
      <div className="mx-auto max-w-6xl space-y-5 px-4 pb-14 pt-28 sm:px-8">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-orange-300"><Mic size={18} aria-hidden /> IronClad Admin</p>
          <h1 className="text-3xl font-black sm:text-4xl">Caster Management</h1>
          <p className="mt-2 text-zinc-400">Issue and track individual invitations for the Official Caster Programme.</p>
        </div>

        <CasterAdminNavigation current="invitations" />

        <section className={panel} aria-labelledby="generate-invitation">
          <h2 id="generate-invitation" className="mb-4 text-xl font-bold">Generate an invitation</h2>
          <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <input type="hidden" name="intent" value="issue" />
            <label className="flex-1 space-y-2 text-sm font-bold">
              <span>Internal reference <span className="font-normal text-zinc-400">(optional)</span></span>
              <input name="reference" className={input} maxLength={100} placeholder="Public nickname" />
            </label>
            <button type="submit" className={`${button} border-orange-400 bg-orange-500 text-black hover:bg-orange-300`} disabled={pending}>
              <Plus size={16} aria-hidden /> Generate invitation
            </button>
          </form>
          <p className="mt-3 text-sm text-zinc-400">Seven days to claim. Send privately to one person.</p>
          {pending && <p className="mt-4" role="status">Saving…</p>}
          {state.message && <p className="mt-4 text-orange-200" role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
          {state.issued && <IssuedInvitation key={state.issued.recovery} {...state.issued} />}
        </section>

        <section className={panel} aria-labelledby="invitation-history">
          <h2 id="invitation-history" className="mb-3 text-xl font-bold">Invitations</h2>
          {invitations.length ? <ul className="divide-y divide-white/10">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="break-words font-bold">{invitation.reference || "Individual invitation"} <span className="ml-2 text-orange-300">{statuses[invitation.status]}</span></p>
                  <p className="text-zinc-400">Issued {date.format(new Date(invitation.created_at))} · Expires {date.format(new Date(invitation.expires_at))} Sydney time</p>
                  <p className="break-all font-mono text-xs text-zinc-400">{invitation.id}</p>
                  {invitation.claimed_by && <p className="break-all text-zinc-300">Claimed by <span className="font-mono">{invitation.claimed_by}</span> {invitation.claimed_at && `· ${date.format(new Date(invitation.claimed_at))}`}</p>}
                  {invitation.replaces && <p className="break-all text-zinc-400">Replaces {invitation.replaces}</p>}
                </div>
                {invitation.status !== "claimed" && (
                  <form action={action} className="flex flex-wrap gap-2">
                    <input type="hidden" name="invitation" value={invitation.id} />
                    {invitation.status === "valid" && <button type="submit" name="intent" value="revoke" className={secondary} disabled={pending}>Revoke unused</button>}
                    <button type="submit" name="intent" value="replace" className={secondary} disabled={pending}>Generate replacement</button>
                  </form>
                )}
              </li>
            ))}
          </ul> : <p className="text-zinc-400">No invitations on this page.</p>}
        </section>

        <section className={panel} aria-labelledby="invitation-audit">
          <h2 id="invitation-audit" className="mb-3 text-xl font-bold">Activity</h2>
          {events.length ? <ul className="space-y-3 text-sm">
            {events.map((event) => <li key={event.id} className="break-words border-b border-white/10 pb-2">
              <span className="font-bold capitalize text-orange-300">{event.event_type}</span> · {date.format(new Date(event.created_at))}
              <p className="break-all font-mono text-xs text-zinc-400">{event.invitation_id} · {event.actor}</p>
            </li>)}
          </ul> : <p className="text-zinc-400">No invitation activity on this page.</p>}
          {(page > 1 || hasMore) && <nav aria-label="Invitation history pages" className="mt-5 flex gap-3">
            {page > 1 && <a className={secondary} href={`?page=${page - 1}`}>Previous</a>}
            {hasMore && <a className={secondary} href={`?page=${page + 1}`}>Next</a>}
          </nav>}
        </section>
      </div>
    </main>
  );
}

function IssuedInvitation({ link, recovery }: { link: string; recovery: string }) {
  const [clipboardStatus, setClipboardStatus] = useState("");

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setClipboardStatus(`${label} copied.`);
    } catch {
      setClipboardStatus(`Clipboard unavailable. Select and copy the ${label.toLowerCase()} manually.`);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-orange-400/40 bg-orange-500/10 p-4">
      <p className="text-sm text-orange-100">Copy these values now. Both are single-use and will only be shown here once.</p>
      {[["Invitation link", link], ["Recovery value", recovery]].map(([label, value]) => (
        <div key={label} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1 text-sm font-bold"><span>{label}</span>
            <input className={input} autoComplete="off" readOnly value={value} onFocus={(event) => event.target.select()} />
          </label>
          <button type="button" className={secondary} onClick={() => copy(value, label)}><Copy size={16} aria-hidden /> Copy {label.toLowerCase()}</button>
        </div>
      ))}
      <p role="status" className="text-sm text-orange-200">{clipboardStatus}</p>
    </div>
  );
}
