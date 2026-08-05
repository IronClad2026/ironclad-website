begin;

drop function if exists public.submit_verified_player_registration(
  uuid,
  text,
  uuid,
  uuid,
  text
);

commit;
