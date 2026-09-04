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
