-- Run with the guard absent/present as directed; every editor change rolls back.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
do $$ declare blocked boolean:=false; actual uuid; guarded boolean:=exists(select 1 from supabase_migrations.schema_migrations where version='20261001040810'); begin
 begin
  actual:=public.save_tournament(null,'Local old cached editor','local-cached-editor','','',null,null,null,null,'upcoming','1v1','','','',false,null,'format_a',30,
    '[{"name":"Challenge","elo_rules":"1100-1399 ELO","max_players":8}]');
 exception when sqlstate '55000' then blocked:=true; end;
 perform pg_temp.fd_assert(blocked=guarded,'old cached editor creation compatibility follows postdeployment guard');
 if not guarded then
  perform pg_temp.fd_assert((select division_model_version='legacy_three_v1' from public.tournaments where id=actual),'predeploy legacy editor remains compatible');
 end if;
 insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled)
 values(pg_temp.fd_id('editable-legacy',1),'Local existing legacy','local-existing-legacy','1v1','upcoming','','','',false);
 perform public.save_tournament(pg_temp.fd_id('editable-legacy',1),'Local existing legacy edited','local-existing-legacy','','',null,null,null,null,'upcoming','1v1','','','',false,null,'format_a',30,
   '[{"name":"Academy","elo_rules":"Below 1100 ELO","max_players":8}]');
 perform pg_temp.fd_assert((select division_model_version='legacy_three_v1' and title='Local existing legacy edited' from public.tournaments where id=pg_temp.fd_id('editable-legacy',1)),'editable legacy event remains editable without reinterpretation');
end $$;
rollback;
