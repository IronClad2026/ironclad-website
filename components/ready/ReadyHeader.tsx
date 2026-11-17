"use client";

import { useAuth } from "@clerk/nextjs";
import ReadyAssistant from "./ReadyAssistant";
import styles from "./ReadyAssistant.module.css";

export default function ReadyHeader() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  if (!isLoaded || (isSignedIn && !sessionId)) {
    return <span className={styles.dock} data-ready-dock="" aria-hidden="true" />;
  }

  const scope = sessionId ?? "visitor";
  return <ReadyAssistant key={scope} workspaceScope={scope} signedIn={isSignedIn === true} />;
}
