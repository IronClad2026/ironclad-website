import { createClient } from "@supabase/supabase-js";
import {
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase-config";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

export function createNoStoreSupabaseClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}
