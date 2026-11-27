export { CASTER_INVITATION_PATH as INVITATION_PATH, CASTER_STUDIO_PATH, CASTER_SIGN_IN_PATH, CASTER_SIGN_UP_PATH } from "./routes";
export const CASTER_ADMIN_PATH = "/admin/casters";

export type CasterApplication = { id: string; status: "draft"; created_at: string };

export type CasterInvitation = {
  id: string;
  reference: string | null;
  status: "valid" | "expired" | "revoked" | "claimed";
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  revoked_at: string | null;
  replaces: string | null;
};

export type CasterInvitationEvent = {
  id: string | number;
  invitation_id: string;
  event_type: "issued" | "replaced" | "revoked" | "claimed";
  actor: string;
  created_at: string;
};
