export const HIGHLIGHT_BUTTON = "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 border border-white/15 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";

const messages: Record<string, string> = {
  saved: "Combat Highlights updated.",
  conflict: "These clips changed in another session. Review the refreshed slots and try again.",
  "profile-required": "Complete your player profile before adding a clip.",
  "legal-required": "Review and accept the current account agreements before adding a clip.",
  "feature-disabled": "Combat Highlights are currently unavailable.",
  "invalid-input": "Check the clip details and try again.",
  "upload-limit": "The temporary upload limit has been reached. Please try again later.",
  "upload-pending": "Finish or cancel the pending upload before changing this slot.",
  "upload-expired": "This upload expired. Choose the file again to retry.",
  unavailable: "Combat Highlights could not be updated. Please try again.",
  forbidden: "This clip is not available to your account.",
  "invalid-media": "Use an MP4 with H.264/AVC video and AAC audio, or WebM with VP8/VP9 video and Opus/Vorbis audio.",
  "too-large": "Choose a clip no larger than 15 MB.",
  "sign-in-required": "Sign in before reporting a clip.",
  "too-long": "Choose a clip no longer than 15 seconds.",
  "too-high-resolution": "Choose a clip no larger than 1920 × 1080.",
  "too-high-framerate": "Choose a clip at 60 fps or below.",
  cancelled: "Upload cancelled. Your previous clip has been kept.",
  "cancel-failed": "The upload stopped, but cancellation could not be confirmed. Refresh before trying again.",
};

export function highlightMessage(code: string): string {
  return messages[code] ?? "The request could not be completed. Please try again.";
}

export function highlightDuration(durationMs: number): string {
  return `${Math.max(1, Math.ceil(durationMs / 1000))}s`;
}
