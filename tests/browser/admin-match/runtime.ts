// Browser fixtures never contact Clerk, Supabase or application actions.
const fixtureAction = async () => ({
  status: "success" as const,
  message: "Fixture action recorded.",
});
export const resetAdminMatch = fixtureAction;
export const saveAdminMatchResult = fixtureAction;
export const reviewMatchResult = fixtureAction;
export const reviewMatchResultReportGroup = fixtureAction;
export const confirmMatchResultReportGroup = fixtureAction;
export const disputeMatchResultReportGroup = fixtureAction;
export const submitNoShowReport = fixtureAction;
export const prepareMatchReplayUploads = fixtureAction;
export const finalizeMatchReplayResult = fixtureAction;
export const extendTournamentMatchDeadline = fixtureAction;
export const holdTournamentMatchDeadline = fixtureAction;
export const releaseTournamentMatchDeadline = fixtureAction;
export const useRouter = () => ({ refresh() {} });
export const useAuth = () => ({ getToken: async () => null });
export const createAuthenticatedBrowserSupabaseClient = () => {
  throw new Error("Fixture must not contact Supabase");
};
export const cleanupPreparedReplayUploads = fixtureAction;
export const finalizeMatchResult = fixtureAction;

// This result-management fixture has no conversation. Keep all Match Room
// boundaries synthetic; the dedicated room fixture covers their behavior.
export const resolveMatchRoom = async () => ({ ok: true as const, data: { room: null } });
const unavailableRoomAction = async () => ({ ok: false as const, code: "unavailable" as const });
export const getMatchRoomHistory = unavailableRoomAction;
export const getMatchRoomEarlierHistory = unavailableRoomAction;
export const markMatchRoomRead = unavailableRoomAction;
export const sendMatchRoomMessage = unavailableRoomAction;
export const sendAdminMatchRoomMessage = unavailableRoomAction;
export const getMatchRoomAssistance = unavailableRoomAction;
export const requestMatchAdminAssistance = unavailableRoomAction;
export const resolveMatchAdminAssistance = unavailableRoomAction;
