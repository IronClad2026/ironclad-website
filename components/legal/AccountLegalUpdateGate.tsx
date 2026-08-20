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
};

export default async function AccountLegalUpdateGate({
  children,
  copy,
  state,
}: AccountLegalUpdateGateProps) {
  const resolvedState = state ?? (await loadAccountLegalGateState());

  if (
    resolvedState.status === "inactive" ||
    resolvedState.status === "satisfied"
  ) {
    return (
      <>
        <AccountLegalGateRevalidation
          initiallySignedIn={
            resolvedState.status === "satisfied" ||
            resolvedState.reason === "predecessor"
          }
          watchForSuccessor={
            resolvedState.status === "inactive" &&
            resolvedState.reason === "predecessor"
          }
        />
        {children}
      </>
    );
  }

  return <AccountLegalUpdateShell state={resolvedState} copy={copy} />;
}
