-- Synthetic LOCAL ONLY; complete genuine-shaped legacy divisions through normal authority.
begin;
set local request.jwt.claims='{"role":"service_role","sub":"local-consolidated-admin"}';
select pg_temp.fd_create(1,'Academy');
select pg_temp.fd_create(1,'Challenge');
select pg_temp.fd_create(1,'Main');
select pg_temp.fd_play(1,'Academy');
select pg_temp.fd_play(1,'Challenge');
select pg_temp.fd_play(1,'Main');
select pg_temp.fd_assert((select count(*)=21 from public.tournament_matches where status='completed'),'21 genuine local legacy matches completed');
select pg_temp.fd_assert((select count(*)=3 from public.leaderboard_division_settlements),'three legacy divisions settled');
select pg_temp.fd_assert((select count(*)=1 from public.leaderboard_tournament_season_memberships where qualifying_event_number=1 and scored_at is not null),'one real legacy qualifying event, no synthetic transition');
select pg_temp.fd_assert((select count(*)>0 from public.leaderboard_point_events where bracket_type='main'),'legacy Main remains main');
insert into public.account_legal_acceptances(clerk_user_id,accepted_at,terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
select p.clerk_user_id,'2025-01-01',t.id,t.version,t.immutable_url,t.sha256,v.id,v.version,v.immutable_url,v.sha256,true,true
from public.players p cross join public.legal_documents t cross join public.legal_documents v
where t.document_kind='terms' and t.status='effective' and v.document_kind='privacy' and v.status='effective';
insert into public.registration_acceptances(registration_id,tournament_id,clerk_user_id,accepted_at,
rulebook_document_id,rulebook_version,rulebook_url,rulebook_sha256,ppa_document_id,ppa_version,ppa_url,ppa_sha256,
terms_document_id,terms_version,terms_url,terms_sha256,privacy_document_id,privacy_version,privacy_url,privacy_sha256,
rulebook_accepted,ppa_accepted,terms_accepted,privacy_acknowledged,age_18_confirmed,own_ironclad_account_confirmed,linked_steam_account_confirmed)
select r.id,r.tournament_id,r.clerk_user_id,'2025-01-01',a.id,a.version,a.immutable_url,a.sha256,b.id,b.version,b.immutable_url,b.sha256,
t.id,t.version,t.immutable_url,t.sha256,v.id,v.version,v.immutable_url,v.sha256,true,true,true,true,true,true,true
from public.registrations r cross join public.legal_documents a cross join public.legal_documents b cross join public.legal_documents t cross join public.legal_documents v
where a.document_kind='rulebook' and a.status='effective' and b.document_kind='ppa' and b.status='effective'
and t.document_kind='terms' and t.status='effective' and v.document_kind='privacy' and v.status='effective';
set constraints all immediate;
commit;
