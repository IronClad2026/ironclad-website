export type AdminRegistrationStatus =
  | "pending"
  | "manual_review"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "withdrawn";

export type AdminWaitlistOfferStatus =
  | "offered"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export type AdminRegistrationOrderInput = {
  registrationId: string;
  tournamentId: string | null;
  tournamentBracketId: string | null;
  createdAt: string;
  status: AdminRegistrationStatus;
  waitlistOfferStatus?: AdminWaitlistOfferStatus | null;
};

export type AdminRegistrationEvidenceInput = {
  playerDisplayName: string;
  tournamentName: string;
  selectedBracket: string | null;
  submittedElo: number | null;
  verifiedElo: number | null;
  verifiedDivision: string | null;
  verifiedFaction: string | null;
  verificationSource: string | null;
  verificationCheckedAt: string | null;
  eligibilityRulesVersion: string | null;
  status: AdminRegistrationStatus;
  registeredAt: string;
  registrationOrder: number | null;
  waitlistPosition: number | null;
  waitlistOfferStatus: AdminWaitlistOfferStatus | null;
};

export type AdminRegistrationEvidence = {
  playerDisplayName: string;
  tournamentName: string;
  selectedBracket: string | null;
  frozenRegistrationElo: number | null;
  verifiedDivision: string | null;
  verifiedFaction: string | null;
  verificationSource: string | null;
  verificationCheckedAt: string | null;
  eligibilityRulesVersion: string | null;
  status: AdminRegistrationStatus;
  registeredAt: string;
  registrationOrder: number | null;
  waitlistPosition: number | null;
  waitlistOfferStatus: AdminWaitlistOfferStatus | null;
};

export type AdminRegistrationReviewRow = AdminRegistrationEvidence & {
  registrationId: string;
  tournamentId: string | null;
  privateAdminNote: string | null;
  isDivisionLaunched: boolean;
};

export function compareRegistrationChronology(
  left: AdminRegistrationOrderInput,
  right: AdminRegistrationOrderInput
) {
  const timeDelta = getRegistrationTime(left.createdAt) - getRegistrationTime(right.createdAt);

  return timeDelta || left.registrationId.localeCompare(right.registrationId);
}

export function buildRegistrationOrderMap(
  registrations: AdminRegistrationOrderInput[]
) {
  return buildScopedPositionMap(registrations);
}

export function buildWaitlistPositionMap(
  registrations: AdminRegistrationOrderInput[]
) {
  return buildScopedPositionMap(
    registrations.filter(
      (registration) =>
        registration.status === "waitlisted" &&
        registration.waitlistOfferStatus === null
    )
  );
}

export function buildAdminRegistrationEvidence(
  input: AdminRegistrationEvidenceInput
): AdminRegistrationEvidence {
  return {
    playerDisplayName: input.playerDisplayName,
    tournamentName: input.tournamentName,
    selectedBracket: input.selectedBracket,
    frozenRegistrationElo: input.verifiedElo ?? input.submittedElo,
    verifiedDivision: input.verifiedDivision,
    verifiedFaction: input.verifiedFaction,
    verificationSource: input.verificationSource,
    verificationCheckedAt: input.verificationCheckedAt,
    eligibilityRulesVersion: input.eligibilityRulesVersion,
    status: input.status,
    registeredAt: input.registeredAt,
    registrationOrder: input.registrationOrder,
    waitlistPosition:
      input.status === "waitlisted" ? input.waitlistPosition : null,
    waitlistOfferStatus: input.waitlistOfferStatus,
  };
}

function buildScopedPositionMap(registrations: AdminRegistrationOrderInput[]) {
  const positions = new Map<string, number>();
  const registrationsByScope = new Map<
    string,
    AdminRegistrationOrderInput[]
  >();

  for (const registration of registrations) {
    const scope = getRegistrationScope(registration);

    if (!scope) {
      continue;
    }

    const group = registrationsByScope.get(scope) ?? [];
    group.push(registration);
    registrationsByScope.set(scope, group);
  }

  for (const group of registrationsByScope.values()) {
    group
      .slice()
      .sort(compareRegistrationChronology)
      .forEach((registration, index) => {
        positions.set(registration.registrationId, index + 1);
      });
  }

  return positions;
}

function getRegistrationScope(registration: AdminRegistrationOrderInput) {
  if (!registration.tournamentId || !registration.tournamentBracketId) {
    return null;
  }

  return JSON.stringify([
    registration.tournamentId,
    registration.tournamentBracketId,
  ]);
}

function getRegistrationTime(value: string) {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}
