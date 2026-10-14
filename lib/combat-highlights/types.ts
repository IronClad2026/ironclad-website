export type HighlightClip = {
  uploadId: string;
  title: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  contentType: "video/mp4" | "video/webm";
  hasPoster: boolean;
};
export type PublicHighlightClip = HighlightClip & { videoUrl: string; posterUrl: string | null };
export type HighlightSlot = {
  slotNumber: number;
  displayOrder: number;
  revision: number;
  hidden: boolean;
  clip: HighlightClip | null;
  pendingUploadId: string | null;
};
export type HighlightsState = {
  playerId: string;
  enabled: boolean;
  publicProfileEnabled: boolean;
  slots: HighlightSlot[];
};
export type HighlightResult = { ok: boolean; code: string; state?: HighlightsState };
export type ReserveHighlightInput = {
  slotNumber: number;
  expectedRevision: number;
  fileName: string;
  contentType: string;
  byteLength: number;
  posterByteLength: number;
  title: string;
  declarationAccepted: boolean;
  declarationVersion: number;
};
export type HighlightUploadGrant = {
  uploadId: string;
  videoUrl: string;
  videoAuthorization: string;
  posterUrl: string | null;
  posterAuthorization: string | null;
  clerkToken: string;
};
export type ReserveHighlightResult = HighlightResult & { upload?: HighlightUploadGrant };
export type OwnerHighlightAccess = { ok: boolean; code: string; videoUrl?: string; clerkToken?: string };
export type HighlightEditorActions = {
  reserve: (input: ReserveHighlightInput) => Promise<ReserveHighlightResult>;
  complete: (uploadId: string) => Promise<HighlightResult>;
  cancel: (uploadId: string, expectedRevision: number) => Promise<HighlightResult>;
  clear: (slotNumber: number, expectedRevision: number) => Promise<HighlightResult>;
  reorder: (slotNumbers: number[], expectedRevisions: number[]) => Promise<HighlightResult>;
  preview: (uploadId: string) => Promise<OwnerHighlightAccess>;
};
