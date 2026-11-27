import type { CasterMembershipStatus, PublicCasterProfile } from "@/lib/caster/publication";
import type { CasterAdminResult } from "./admin-application-contracts";

export const CASTER_MODERATION_PATH = "/admin/casters/moderation";

export const membershipLabels: Record<CasterMembershipStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  inactive: "Inactive",
};

export const moderationLabels = {
  hide: "Hide public profile",
  restore: "Restore public visibility",
  suspend: "Suspend caster membership",
  reinstate: "Reinstate caster membership",
} as const;

export type CasterModerationAction = keyof typeof moderationLabels;
export type CasterModerationFilter = CasterMembershipStatus | "all";

export type CasterModerationEntry = {
  application_id: string;
  owner_clerk_user_id: string;
  display_name: string | null;
  membership_status: CasterMembershipStatus;
  hidden: boolean;
  slug: string | null;
  publication_id: string | null;
  moderation_version: number;
  closed: boolean;
};

export type CasterModerationList = {
  status: string;
  casters: CasterModerationEntry[];
  has_more: boolean;
};

export type CasterModerationSearch = CasterAdminResult & {
  snapshot?: CasterModerationList;
  filter?: CasterModerationFilter;
  page?: number;
  query?: string;
};

export type CasterModerationDetail = {
  status: string;
  caster: CasterModerationEntry | null;
  publication: PublicCasterProfile | null;
  history: {
    id: number | string;
    action: CasterModerationAction;
    actor: string;
    reason: string;
    created_at: string;
    publication_id: string | null;
  }[];
  publications: { id: string; version: number; display_name: string; created_at: string }[];
};

export function isCasterModerationFilter(value: string): value is CasterModerationFilter {
  return value === "all" || Object.hasOwn(membershipLabels, value);
}
