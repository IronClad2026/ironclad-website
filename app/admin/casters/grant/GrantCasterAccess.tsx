"use client";

import { useActionState } from "react";
import { grantCasterAccess, searchCasterAccounts } from "../application-actions";
import { CASTER_REVIEW_FEEDBACK_LIMIT, type CasterAdminAccountSearch, type CasterAdminResult } from "../admin-application-contracts";
import { casterAdminInput, casterAdminPanel, casterAdminPrimary, casterAdminSecondary } from "../admin-application-styles";

const initialSearch: CasterAdminAccountSearch = { kind: "idle" };
const initialGrant: CasterAdminResult = { kind: "idle" };

export default function GrantCasterAccess() {
  const [search, searchAction, searching] = useActionState(searchCasterAccounts, initialSearch);
  const [grant, grantAction, granting] = useActionState(grantCasterAccess, initialGrant);
  const accounts = search.accounts ?? [];
  const hasVerifiedAccount = accounts.some((account) => account.verified);

  return (
    <section className={casterAdminPanel} aria-labelledby="find-caster-account">
      <h2 id="find-caster-account" className="text-xl font-bold">Find an existing IronClad account</h2>
      <form action={searchAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid grow gap-1 text-sm font-bold sm:max-w-lg">
          Account name, email or account ID
          <input
            className={casterAdminInput}
            name="query"
            autoComplete="off"
            minLength={3}
            maxLength={100}
            required
          />
        </label>
        <button type="submit" className={casterAdminSecondary} disabled={searching || granting}>
          {searching ? "Searching…" : "Search accounts"}
        </button>
      </form>
      {search.message && <p role="alert" className="mt-3 text-sm text-orange-200">{search.message}</p>}
      {search.kind === "ok" && !accounts.length && (
        <p role="status" className="mt-3 text-sm text-zinc-400">No matching accounts. Try a more specific name, email or ID.</p>
      )}

      {accounts.length > 0 && (
        <form action={grantAction} className="mt-6 space-y-4 border-t border-white/10 pt-5">
          <fieldset disabled={searching || granting} className="space-y-2">
            <legend className="mb-2 font-bold">Select the account you verified</legend>
            {accounts.map((account) => (
              <label key={account.id} className="flex min-h-14 items-start gap-3 rounded-xl border border-white/15 bg-black/45 p-3">
                <input
                  type="radio"
                  name="target"
                  value={account.id}
                  className="mt-1 size-5 shrink-0 accent-orange-500"
                  required
                  disabled={!account.verified}
                />
                <span className="min-w-0">
                  <span className="block break-words font-bold">{account.name}</span>
                  {account.email && <span className="block break-all text-sm text-zinc-300">{account.email}</span>}
                  <span className="block text-sm text-zinc-400">
                    {account.verified ? "Primary email verified" : "Primary email needs verification"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {hasVerifiedAccount && (
            <>
              <label className="grid gap-2 text-sm font-bold">
                Reason for granting access
                <textarea name="feedback" className={casterAdminInput} rows={3} maxLength={CASTER_REVIEW_FEEDBACK_LIMIT} required />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
                <input type="checkbox" name="confirm" value="yes" className="size-5 shrink-0 accent-orange-500" required />
                I verified the selected account and approve it for official caster access.
              </label>
              <button type="submit" className={casterAdminPrimary} disabled={searching || granting}>
                {granting ? "Recording grant…" : "Grant official caster access"}
              </button>
            </>
          )}
        </form>
      )}
      {grant.message && <p role={grant.kind === "error" ? "alert" : "status"} className="mt-3 text-sm text-orange-200">{grant.message}</p>}
    </section>
  );
}
