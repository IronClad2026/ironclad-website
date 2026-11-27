import type { ReactNode } from "react";
import AccountLegalGateRevalidation from "@/components/legal/AccountLegalGateRevalidation";
import AccountLegalUpdateShell, {
  type AccountLegalUpdateCopy,
} from "@/components/legal/AccountLegalUpdateShell";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import type { AccountLegalGateState } from "@/lib/account-legal-acceptance";

export type AccountLegalUpdateGateProps = {
  children: ReactNode;
  copy: AccountLegalUpdateCopy;
  state?: AccountLegalGateState;
  casterSubmission?: boolean;
  formError?: "acceptance-required" | "unavailable";
};

export default async function AccountLegalUpdateGate({
  children,
  copy,
  state,
  casterSubmission,
  formError,
}: AccountLegalUpdateGateProps) {
  const resolvedState = state ?? (await loadAccountLegalGateState());

  if (
    resolvedState.status === "inactive" ||
    resolvedState.status === "satisfied"
  ) {
    return (
      <>
        <AccountLegalGateRevalidation
          initiallySignedIn={resolvedState.status === "satisfied"}
          watchForLegalChange={resolvedState.status === "satisfied"}
        />
        {children}
      </>
    );
  }

  return <AccountLegalUpdateShell state={resolvedState} copy={copy} casterSubmission={casterSubmission} formError={formError} />;
}
