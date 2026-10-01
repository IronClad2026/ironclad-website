-- LOCAL REPLAY ONLY. Reproduce observed current Production catalog ACLs.
-- Supabase provider defaults added these existing non-CRUD permissions; the
-- repository replay does not reproduce them. Never apply this file live or
-- bundle it into a forward migration. RLS and private column ACLs remain exact.
grant truncate,references,trigger,maintain on public.players,public.profiles,
 public.registrations,public.tournament_brackets,public.tournaments to anon,authenticated;
