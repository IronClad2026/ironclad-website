-- Synthetic LOCAL historical room/evidence; no external person or message data.
begin;
set local session_replication_role=replica;
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,
player_one_registration_id,player_two_registration_id,created_at,closed_at,closure_reason,last_sequence)
select pg_temp.fd_id('retained-room',1),m.id,1,1,m.activation_version,m.player_one_registration_id,m.player_two_registration_id,
now()-interval '2 days',now()-interval '1 day','match_completed',1
from public.tournament_matches m where m.id=pg_temp.fd_id('Main-match-1',1,1);
insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,client_message_id,body,author_player_id)
values(pg_temp.fd_id('retained-message',1),pg_temp.fd_id('retained-room',1),1,'player',pg_temp.fd_id('Main-registration',1,1),
'local-consolidated-'||pg_temp.fd_id('Main-player',0,1),pg_temp.fd_id('message-retry',1),'Synthetic local retained evidence.',pg_temp.fd_id('Main-player',0,1));
insert into public.match_room_reads(room_id,viewer_clerk_user_id,last_read_sequence)
values(pg_temp.fd_id('retained-room',1),'local-consolidated-'||pg_temp.fd_id('Main-player',0,1),1);
insert into ironclad_private.match_room_tournament_closures(tournament_id,completed_at)
select id,first_completed_at from public.tournaments where id=pg_temp.fd_id('event',1) on conflict do nothing;
insert into ironclad_private.match_room_retention_cases(room_id,case_reference,case_kind,closed_at)
values(pg_temp.fd_id('retained-room',1),pg_temp.fd_id('retained-case',1),'competition_integrity',null);
insert into ironclad_private.match_room_retention_holds(id,room_id,message_ids,case_reference,reason,created_at,expires_at)
values(pg_temp.fd_id('retained-hold',1),pg_temp.fd_id('retained-room',1),array[pg_temp.fd_id('retained-message',1)],pg_temp.fd_id('retained-case',1),'competition_integrity',now(),now()+interval '10 days');
insert into ironclad_private.match_room_privacy_audit(room_id,operation,actor_player_id,reference_id,counts)
values(pg_temp.fd_id('retained-room',1),'hold',pg_temp.fd_id('Main-player',0,1),pg_temp.fd_id('retained-hold',1),'{"synthetic":1}');
set local session_replication_role=origin;
set constraints all immediate;
commit;
