export const CASTER_INVITATION_CONTENT_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";
export const CASTER_INVITATION_FRAME_POLICY =
  `${CASTER_INVITATION_CONTENT_POLICY}; frame-ancestors 'none'`;
