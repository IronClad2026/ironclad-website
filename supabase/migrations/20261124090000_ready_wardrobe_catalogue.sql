begin;

-- Keep the original three-item projection readable if Staging rolls back.
create function public.ready_wardrobe_catalogue_ids_valid(items text[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select case
    when coalesce(array_ndims(items), 1) <> 1 or coalesce(array_lower(items, 1), 1) <> 1
      then false
    else items <@ array[
      'eyewear_smoked_aviators',
      'mouth_cigarette',
      'face_swat_cheek_guard',
      'headwear_wwii_full_face_helmet',
      'helmet_trim_wwii_paratrooper_net',
      'headwear_tanker_beret',
      'eyewear_field_veteran_eyepatch',
      'eyewear_protruding_eyes',
      'eyewear_tanker_dust_goggles',
      'headwear_open_cranium',
      'mouth_diamond_grin',
      'helmet_trim_lucky_dog_tags',
      'helmet_trim_ace_of_spades_helmet_band',
      'headwear_australian_slouch_hat',
      'helmet_trim_dynamite_helmet_band',
      'mouth_sparking_dynamite_stick',
      'face_clown_makeup',
      'headwear_flip_up_welding_mask',
      'sergeant_majors_moustache',
      'tankers_crown'
    ]::text[]
    and array_position(items, null) is null
    and cardinality(items) = (select count(distinct id) from unnest(items) as allowed(id))
  end
$$;

revoke all on function public.ready_wardrobe_catalogue_ids_valid(text[]) from public, anon, authenticated;
grant execute on function public.ready_wardrobe_catalogue_ids_valid(text[]) to service_role;

alter table public.ready_wardrobe_pilot_profiles
  add column catalogue_item_ids text[],
  add column dynamite_restore text[],
  add constraint ready_wardrobe_catalogue_ids_valid
    check (public.ready_wardrobe_catalogue_ids_valid(catalogue_item_ids)),
  add constraint ready_wardrobe_dynamite_restore_valid
    check (dynamite_restore is null or (
      public.ready_wardrobe_catalogue_ids_valid(dynamite_restore)
      and coalesce(catalogue_item_ids @> array[
        'helmet_trim_dynamite_helmet_band', 'mouth_sparking_dynamite_stick'
      ]::text[], false)
    ));

commit;
