begin;

update public.tournaments
set grand_final_at = coalesce(end_date, start_date)
where grand_final_at is null
  and (end_date is not null or start_date is not null);

commit;
