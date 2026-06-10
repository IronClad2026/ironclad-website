import { createClient } from "@supabase/supabase-js";
import {
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase-config";

type GetToken = () => Promise<string | null>;

export function createAuthenticatedBrowserSupabaseClient(getToken: GetToken) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: getToken,
  });
}
