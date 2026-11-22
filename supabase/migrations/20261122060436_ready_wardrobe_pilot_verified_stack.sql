begin;

-- The web renderer verified the cigarette and face paint together. Keep the
-- existing unique item and allowlist constraints and all access controls.
alter table public.ready_wardrobe_pilot_profiles
  drop constraint ready_wardrobe_pilot_profiles_compatible_items;

commit;
