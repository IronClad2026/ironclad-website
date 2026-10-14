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

// Match Room itself has a separate browser suite; this workspace fixture keeps
// its optional room unavailable without importing or calling server actions.
export const resolveMatchRoom = async () => ({ ok: true as const, data: { room: null } });
const unavailableRoom = async () => ({ ok: false as const, code: "unavailable" as const });
export const getMatchRoomHistory = unavailableRoom;
export const getMatchRoomEarlierHistory = unavailableRoom;
export const markMatchRoomRead = unavailableRoom;
export const sendAdminMatchRoomMessage = unavailableRoom;
export const sendMatchRoomMessage = unavailableRoom;
export const getMatchRoomAssistance = unavailableRoom;
export const requestMatchAdminAssistance = unavailableRoom;
export const resolveMatchAdminAssistance = unavailableRoom;
export const getMatchRoomOpponentDiscord = async () => ({ discordUsername: null });
