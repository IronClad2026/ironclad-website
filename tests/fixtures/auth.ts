export type MockAuthIdentity = {
  userId: string | null;
  sessionClaims: {
    metadata?: {
      role?: string;
    };
  } | null;
  getToken: () => Promise<string | null>;
};

export const anonymousIdentity: MockAuthIdentity = Object.freeze({
  userId: null,
  sessionClaims: null,
  getToken: async () => null,
});

export const playerIdentity: MockAuthIdentity = Object.freeze({
  userId: "user_test_player",
  sessionClaims: {
    metadata: {
      role: "player",
    },
  },
  getToken: async () => "test-player-token",
});

export const adminIdentity: MockAuthIdentity = Object.freeze({
  userId: "user_test_admin",
  sessionClaims: {
    metadata: {
      role: "admin",
    },
  },
  getToken: async () => "test-admin-token",
});
