import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase-config";

export async function createAuthenticatedSupabaseClient() {
  const { getToken } = await auth();

  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: () => getToken(),
  });
}
