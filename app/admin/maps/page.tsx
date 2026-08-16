import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AdminMapCatalogue from "@/components/AdminMapCatalogue";
import {
  COH3_MAP_SOURCE_TYPES,
  COH3_MAP_STATUSES,
  mapCoh3MapDatabaseRow,
  type Coh3MapDatabaseRow,
} from "@/lib/coh3-maps";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type AdminMapsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminMapsPage({ searchParams }: AdminMapsPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)
    ?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const query = single(params.query).trim();
  const sourceType = allowed(single(params.sourceType), COH3_MAP_SOURCE_TYPES);
  const status = allowed(single(params.status), COH3_MAP_STATUSES);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("coh3_maps")
    .select("id, slug, display_name, source_type, creator_name, game_mode, status, thumbnail_path, source_reference, admin_note, created_at, updated_at, created_by_clerk_user_id, updated_by_clerk_user_id")
    .order("display_name");

  if (error) {
    console.error("Admin map catalogue load failed.");
  }

  const normalizedQuery = query.toLowerCase();
  const maps = ((data ?? []) as Coh3MapDatabaseRow[])
    .map(mapCoh3MapDatabaseRow)
    .filter((map) =>
      (!normalizedQuery || `${map.displayName} ${map.slug} ${map.creatorName ?? ""}`.toLowerCase().includes(normalizedQuery)) &&
      (!sourceType || map.sourceType === sourceType) &&
      (!status || map.status === status)
    );

  return (
    <AdminMapCatalogue
      maps={maps}
      filters={{ query, sourceType, status }}
      notice={single(params.notice) || (error ? "load-failed" : undefined)}
      detail={single(params.detail) || undefined}
    />
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function allowed<Value extends string>(value: string, choices: readonly Value[]): Value | "" {
  return choices.includes(value as Value) ? (value as Value) : "";
}
