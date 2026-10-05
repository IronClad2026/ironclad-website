import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreateWarfrontCompanyRpcInput = {
  actorClerkUserId: string;
  name: string;
  tag: string;
  slug: string;
  description: string | null;
  region: string | null;
};

export async function invokeCreateWarfrontCompany(
  input: CreateWarfrontCompanyRpcInput
): Promise<{ data: unknown; error: unknown }> {
  const client = createSupabaseAdminClient();

  return client.rpc("create_warfront_company_api", {
    p_actor_clerk_user_id: input.actorClerkUserId,
    p_name: input.name,
    p_tag: input.tag,
    p_slug: input.slug,
    p_description: input.description,
    p_region: input.region,
  });
}
