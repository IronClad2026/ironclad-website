import type {
  CasterApplicationRevision,
  CasterApplicationStatus,
} from "@/lib/caster/application";

export const CASTER_APPLICATIONS_ADMIN_PATH = "/admin/casters/applications";
export const CASTER_GRANTS_ADMIN_PATH = "/admin/casters/grant";
export const ADMIN_APPLICATION_PAGE_SIZE = 25;
export const ADMIN_APPLICATION_MAX_PAGE = 100;
export const CASTER_REVIEW_FEEDBACK_LIMIT = 2_000;

export const applicationStatuses: Record<CasterApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Pending verification",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

export type CasterReviewDecision = "approve" | "reject" | "request_changes" | "reopen";

export const casterReviewDecisions: Record<CasterReviewDecision, string> = {
  approve: "Approve application",
  reject: "Reject application",
  request_changes: "Request changes",
  reopen: "Reopen application",
};

export type CasterAdminApplicationRow = {
  id: string;
  owner_clerk_user_id: string;
  status: CasterApplicationStatus;
  display_name: string | null;
  submitted_at: string | null;
  updated_at: string;
};

export type CasterAdminApplicationList = {
  status: string;
  applications: CasterAdminApplicationRow[];
  has_more: boolean;
};
export type CasterAdminApplicationFilter = CasterApplicationStatus | "all";
export type CasterAdminApplicationSearch = CasterAdminResult & {
  snapshot?: CasterAdminApplicationList;
  filter?: CasterAdminApplicationFilter;
  query?: string;
  page?: number;
};

export type CasterAdminApplicationDetail = {
  status: string;
  application: {
    id: string;
    owner_clerk_user_id: string;
    status: CasterApplicationStatus;
    submitted_revision_id: string | null;
    revision: CasterApplicationRevision | null;
    feedback: string | null;
    membership_active: boolean;
  } | null;
  invitation: { id: string; reference: string | null; created_at: string; claimed_at: string | null } | null;
  history: {
    id: number | string;
    decision: "submitted" | "approve" | "reject" | "request_changes" | "reopen" | "grant";
    actor: string;
    revision_id: string | null;
    feedback: string | null;
    created_at: string;
  }[];
};

export type CasterAdminAccount = {
  id: string;
  name: string;
  email: string | null;
  verified: boolean;
  available: boolean;
};

export type CasterAdminResult = {
  kind: "idle" | "ok" | "error";
  message?: string;
};

export type CasterAdminAccountSearch = CasterAdminResult & { accounts?: CasterAdminAccount[] };

const sydneyTime = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

export function casterAdminDate(value: string | null) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? sydneyTime.format(timestamp) : "—";
}

export function isCasterApplicationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function isCasterAccountId(value: unknown): value is string {
  return typeof value === "string" && /^user_[A-Za-z0-9_]{1,244}$/.test(value);
}

export function isCasterAdminApplicationFilter(value: unknown): value is CasterAdminApplicationFilter {
  return typeof value === "string" && (value === "all" || Object.hasOwn(applicationStatuses, value));
}

export function casterAdminApplicationPage(value: unknown): number {
  return typeof value === "string" && /^\d{1,3}$/.test(value)
    ? Math.min(ADMIN_APPLICATION_MAX_PAGE, Math.max(1, Number(value))) : 1;
}
