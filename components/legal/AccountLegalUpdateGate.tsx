import type { ReactNode } from "react";
import AccountLegalGateRevalidation from "@/components/legal/AccountLegalGateRevalidation";
import AccountLegalUpdateShell, {
  type AccountLegalUpdateCopy,
} from "@/components/legal/AccountLegalUpdateShell";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";

export type AccountLegalUpdateGateProps = {
  children: ReactNode;
  copy: AccountLegalUpdateCopy;
};

export default async function AccountLegalUpdateGate({
  children,
  copy,
}: AccountLegalUpdateGateProps) {
  const state = await loadAccountLegalGateState();

  if (state.status === "inactive" || state.status === "satisfied") {
    return (
      <>
        <AccountLegalGateRevalidation
          initiallySignedIn={
            state.status === "satisfied" || state.reason === "predecessor"
          }
          watchForSuccessor={
            state.status === "inactive" && state.reason === "predecessor"
          }
        />
        {children}
      </>
    );
  }

  return <AccountLegalUpdateShell state={state} copy={copy} />;
}
