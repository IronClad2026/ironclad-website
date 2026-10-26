import "server-only";

import { PartnerApiError } from "@/lib/partner-api/http";

export function invalidPartnerRequest(): never {
  throw new PartnerApiError(400, "invalid_request");
}

/** Reject unsupported and duplicate parameters, including query credentials. */
export function readPartnerQuery(request: Request, allowed: readonly string[]) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      invalidPartnerRequest();
  }
  return params;
}

export function readPartnerPagination(
  params: URLSearchParams,
  defaultLimit: number,
) {
  function integer(key: string, fallback: number, min: number, max: number) {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^(0|[1-9][0-9]{0,4})$/.test(value)) invalidPartnerRequest();
    const parsed = Number(value);
    if (parsed < min || parsed > max) invalidPartnerRequest();
    return parsed;
  }
  return {
    limit: integer("limit", defaultLimit, 1, 10),
    offset: integer("offset", 0, 0, 10000),
  };
}

export function readPartnerSlug(slug: string): string {
  if (slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    invalidPartnerRequest();
  return slug;
}

export function readPartnerRelicId(id: string): string {
  if (!/^[1-9][0-9]{0,19}$/.test(id)) invalidPartnerRequest();
  return id;
}
