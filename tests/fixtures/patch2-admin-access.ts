type MockIdentity = {
  userId?: string | null;
  sessionClaims?: { metadata?: { role?: unknown } } | null;
};

// Tests of downstream authorization and data flow supply their own session.
// The provider checks themselves are exercised in patch2-admin-access.test.ts.
export function createPatch2AdminAccessFixture(auth: () => Promise<MockIdentity>) {
  const hasCurrentPatch2AdminAccess = async (
    userId: string | null | undefined,
    sessionClaims: MockIdentity["sessionClaims"],
  ) => Boolean(userId && sessionClaims?.metadata?.role === "admin");

  return {
    hasCurrentPatch2AdminAccess,
    async requireCurrentPatch2Admin() {
      try {
        const { userId, sessionClaims } = await auth();
        if (userId && await hasCurrentPatch2AdminAccess(userId, sessionClaims)) return userId;
      } catch {
        // Keep the same fail-closed error for callers.
      }
      throw new Error("Unauthorized");
    },
  };
}
