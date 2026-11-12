-- LOCAL-ONLY historical fixture input for production-closure-db-test.mjs.
-- The runner first reconstructs real Production table shapes/constraints and
-- functions from a hash-pinned catalog-only capture. These fictional rows are
-- inserted before trigger installation; every real captured trigger is present
-- when the frozen migrations and normal closure entrypoint are exercised.
-- No real person, provider verification, human consent, game or Storage bytes
-- are represented. The legal rows below are fictional local test documents.
set search_path=public,ironclad_private,extensions;

insert into public.players(id,clerk_user_id,display_name,in_game_name,country,region,timezone,steam_username,steam_id64,bio)
values
 ('00000000-0000-4000-8000-000000000101','local_closure_history','LOCAL History','LOCAL History','AU','OCE','Australia/Sydney','LOCAL synthetic','90000000000000101','LOCAL archival identity fixture'),
 ('00000000-0000-4000-8000-000000000102','local_closure_delete','LOCAL Delete','LOCAL Delete','AU','OCE','Australia/Sydney',null,null,null),
 ('00000000-0000-4000-8000-000000000103','local_closure_admin','LOCAL Admin','LOCAL Admin','AU','OCE','Australia/Sydney',null,null,null),
 ('00000000-0000-4000-8000-000000000104','local_closure_peer','LOCAL Peer','LOCAL Peer','AU','OCE','Australia/Sydney',null,null,null),
 ('00000000-0000-4000-8000-000000000106','local_closure_admin2','LOCAL Admin Two','LOCAL Admin Two','AU','OCE','Australia/Sydney',null,null,null);
insert into public.profiles(clerk_user_id) values('local_closure_history'),('local_closure_delete');

insert into public.tournaments(id,title,slug,format,status,description,banner_image_url,prize_pool,registration_enabled,
 terminal_at,terminal_reason,terminated_by_clerk_user_id)
values('00000000-0000-4000-8000-000000000201','LOCAL closure historical tournament','local-closure-historical','1v1','cancelled',
 'Fictional local historical fixture; no tournament or game was played.','','',false,
 now()-interval '26 months','LOCAL historical snapshot','local_fixture_operator');
insert into public.tournament_brackets(id,tournament_id,name,elo_rules,max_players,launched_at)
values('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','Academy','0-1099 ELO',8,now()-interval '27 months');
insert into public.registrations(id,profile_id,clerk_user_id,player_name,tournament_title,bracket_name,
 tournament_id,tournament_bracket_id,registration_status,elo_status,submitted_elo)
values('00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000101','local_closure_history','LOCAL History',
 'LOCAL closure historical tournament','Academy Bracket','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202','approved','manual_review',700),
 ('00000000-0000-4000-8000-000000000207','00000000-0000-4000-8000-000000000104','local_closure_peer','LOCAL Peer',
 'LOCAL closure historical tournament','Academy Bracket','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202','approved','manual_review',700);
insert into public.generated_brackets(id,tournament_bracket_id,format,participant_count,slot_count,generated_by)
values('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000202','single_elimination',2,8,'local_closure_history');
insert into public.bracket_rounds(id,generated_bracket_id,round_number,name)
values('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000203',1,'LOCAL historical round');
insert into public.tournament_matches(id,generated_bracket_id,round_id,match_number,player_one_registration_id,
 player_two_registration_id,status,activation_version,activated_at,deadline_at)
values('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000204',1,
 '00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000207','pending_review',1,now()-interval '27 months',now()-interval '27 months'+interval '7 days');
insert into public.match_result_report_groups(id,match_id,tournament_id,submitted_by_clerk_user_id,
 submitted_by_registration_id,opponent_registration_id,winner_registration_id,player_one_score,player_two_score,confirmation_deadline_at,replay_proof_mode)
values('00000000-0000-4000-8000-000000000209','00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000201',
 'local_closure_history','00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000207','00000000-0000-4000-8000-000000000206',2,0,now()-interval '26 months','per_game_replay');
insert into public.match_result_submissions(id,match_id,submitted_by_clerk_user_id,submitted_by_registration_id,
 claimed_winner_registration_id,player_one_score,player_two_score,submission_number,game_number,report_group_id,replay_storage_path,replay_content_hash)
values('00000000-0000-4000-8000-000000000210','00000000-0000-4000-8000-000000000205','local_closure_history','00000000-0000-4000-8000-000000000206',
 '00000000-0000-4000-8000-000000000206',1,0,1,1,'00000000-0000-4000-8000-000000000209',
 'LOCAL-ONLY-NO-STORAGE-BYTES/fictional-game-1.rec',repeat('a',64)),
 ('00000000-0000-4000-8000-000000000212','00000000-0000-4000-8000-000000000205','local_closure_history','00000000-0000-4000-8000-000000000206',
 '00000000-0000-4000-8000-000000000206',1,0,2,2,'00000000-0000-4000-8000-000000000209',
 'LOCAL-ONLY-NO-STORAGE-BYTES/fictional-game-2.rec',repeat('b',64));
insert into public.match_rooms(id,match_id,room_revision,communication_generation,activation_version_snapshot,
 player_one_registration_id,player_two_registration_id,last_sequence,created_at,closed_at,closure_reason)
values('00000000-0000-4000-8000-000000000208','00000000-0000-4000-8000-000000000205',1,1,1,
 '00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000207',1,now()-interval '27 months',now()-interval '26 months','tournament_closed');
insert into public.match_messages(id,room_id,sequence,sender_kind,sender_registration_id,actor_clerk_user_id,author_player_id,client_message_id,body)
values('00000000-0000-4000-8000-000000000211','00000000-0000-4000-8000-000000000208',1,'player',
 '00000000-0000-4000-8000-000000000206','local_closure_history','00000000-0000-4000-8000-000000000101',gen_random_uuid(),'LOCAL original historical chat');
insert into public.match_room_reads(room_id,viewer_clerk_user_id,last_read_sequence)
values('00000000-0000-4000-8000-000000000208','local_closure_history',1);
insert into public.match_room_assistance(room_id,status,request_version,requested_at,resolved_at,resolved_by_clerk_user_id)
values('00000000-0000-4000-8000-000000000208','resolved',1,now()-interval '27 months',now()-interval '26 months','local_closure_history');

insert into public.player_showcases(player_id,current_thought,thought_moderated_by_clerk_user_id)
values('00000000-0000-4000-8000-000000000101','LOCAL owner thought',null),
 ('00000000-0000-4000-8000-000000000104','LOCAL peer thought','local_closure_history');
insert into public.player_combat_highlight_slots(player_id,slot_number,display_order)
values('00000000-0000-4000-8000-000000000101',1,1);
insert into ironclad_private.player_combat_highlight_uploads(id,player_id,slot_number,request_id,content_type,byte_length,
 declaration_version,title,file_name,cleanup_attempts)
values('00000000-0000-4000-8000-000000000220','00000000-0000-4000-8000-000000000101',1,'00000000-0000-4000-8000-000000000221',
 'video/mp4',100,'v1','LOCAL media title','LOCAL-synthetic.mp4',2);
update public.player_combat_highlight_slots set pending_upload_id='00000000-0000-4000-8000-000000000220'
where player_id='00000000-0000-4000-8000-000000000101';
insert into ironclad_private.player_combat_highlight_reports(id,upload_id,reporter_player_id,reason)
values('00000000-0000-4000-8000-000000000222','00000000-0000-4000-8000-000000000220','00000000-0000-4000-8000-000000000101','privacy');

insert into public.announcements(id,title,body,published_at,published_by_clerk_user_id)
values('00000000-0000-4000-8000-000000000230','LOCAL announcement','LOCAL fictional body',now()-interval '1 day','local_closure_history');
insert into public.announcement_read_states(clerk_user_id,last_seen_announcement_id,last_seen_published_at)
select 'local_closure_history',id,published_at from public.announcements where id='00000000-0000-4000-8000-000000000230';
insert into public.push_subscriptions(owner_clerk_user_id,endpoint,p256dh,auth)
values('local_closure_history','https://fcm.googleapis.com/LOCAL-ONLY-NEVER-DELIVER',repeat('A',88),repeat('B',22));

insert into public.polls(id,purpose,audience_kind,question,option_source,max_selections,winner_count,
 authority,result_visibility,opens_at,closes_at,created_by_clerk_user_id,updated_by_clerk_user_id,published_at,published_by_clerk_user_id)
values('00000000-0000-4000-8000-000000000240','community_feedback','selected_active_players','LOCAL draft fixture?','text',1,1,
 'advisory','after_close',now()+interval '1 day',now()+interval '2 days','local_closure_history','local_closure_history',null,null),
 ('00000000-0000-4000-8000-000000000241','community_feedback','selected_active_players','LOCAL published fixture?','text',1,1,
 'advisory','after_close',now()-interval '1 day',now()+interval '1 day','local_closure_history','local_closure_history',now()-interval '2 days','local_closure_history');
insert into public.poll_eligible_voters(id,poll_id,player_id)
values('00000000-0000-4000-8000-000000000242','00000000-0000-4000-8000-000000000240','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000243','00000000-0000-4000-8000-000000000241','00000000-0000-4000-8000-000000000101');

-- Fictional legal inputs for local RPC guards. Not actual published documents
-- or human consent; no acceptance row/identity is copied from either project.
insert into public.legal_documents(id,document_kind,version,immutable_url,sha256,status,published_at,effective_at)
values('00000000-0000-4000-8000-000000000251','terms','LOCAL-fixture-v1','https://example.invalid/local-terms',repeat('1',64),'effective',now()-interval '1 day',now()-interval '1 day'),
 ('00000000-0000-4000-8000-000000000252','privacy','LOCAL-fixture-v1','https://example.invalid/local-privacy',repeat('2',64),'effective',now()-interval '1 day',now()-interval '1 day');
insert into public.account_legal_acceptances(clerk_user_id,terms_document_id,terms_version,terms_url,terms_sha256,
 privacy_document_id,privacy_version,privacy_url,privacy_sha256,terms_accepted,privacy_acknowledged)
select p.clerk_user_id,'00000000-0000-4000-8000-000000000251','LOCAL-fixture-v1','https://example.invalid/local-terms',repeat('1',64),
 '00000000-0000-4000-8000-000000000252','LOCAL-fixture-v1','https://example.invalid/local-privacy',repeat('2',64),true,true from public.players p;
