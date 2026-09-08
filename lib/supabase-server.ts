import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase-config";

export async function createAuthenticatedSupabaseClient(
  requestAccessToken?: () => Promise<string | null>
) {
  const getToken = requestAccessToken ?? (await auth()).getToken;

  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: () => getToken(),
    ...(requestAccessToken ? {
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    } : {}),
  });
}
