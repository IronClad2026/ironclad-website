"use client";

import { useAuth } from "@clerk/nextjs";
import ReadyAssistant from "./ReadyAssistant";
import ReadyPoster from "./ReadyPoster";
import styles from "./ReadyAssistant.module.css";

export default function ReadyHeader({ wardrobePilotEnabled = false }: { wardrobePilotEnabled?: boolean }) {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  if (!isLoaded || (isSignedIn && !sessionId)) {
    return (
      <div className={styles.brand}>
        <span className={styles.dock} data-ready-dock="" data-ready-status="loading" aria-hidden="true">
          <ReadyPoster />
        </span>
      </div>
    );
  }

  const scope = sessionId ?? "visitor";
  return <ReadyAssistant key={scope} workspaceScope={scope} signedIn={isSignedIn === true}
    wardrobePilotEnabled={wardrobePilotEnabled} />;
}
