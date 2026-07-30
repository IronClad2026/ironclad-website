begin;

update storage.buckets
set public = false
where id = 'player-avatars';

commit;
