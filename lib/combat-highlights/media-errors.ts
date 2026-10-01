import "server-only";

export type MediaValidationCode =
  | "videoTooLarge" | "unsupportedVideo" | "invalidVideo" | "videoTooLong"
  | "videoResolution" | "videoFrameRate" | "posterTooLarge" | "invalidPoster";

const messages: Record<MediaValidationCode, string> = {
  videoTooLarge: "Choose a video no larger than 15 MB.",
  unsupportedVideo: "Use a standard MP4 (H.264/AAC) or WebM (VP8/VP9 with Opus/Vorbis) export.",
  invalidVideo: "This video could not be verified. Export the clip again and retry.",
  videoTooLong: "Choose a video no longer than 15 seconds.",
  videoResolution: "Use a landscape video no larger than 1920 × 1080.",
  videoFrameRate: "Choose a video recorded at 60 fps or lower.",
  posterTooLarge: "Choose a JPEG poster no larger than 200 KB.",
  invalidPoster: "Use a valid JPEG poster no larger than 1920 × 1080.",
};

export class MediaValidationError extends Error {
  constructor(public readonly code: MediaValidationCode) {
    super(messages[code]);
    this.name = "MediaValidationError";
  }
}

export function mediaAssert(condition: unknown, code: MediaValidationCode = "invalidVideo"): asserts condition {
  if (!condition) throw new MediaValidationError(code);
}
