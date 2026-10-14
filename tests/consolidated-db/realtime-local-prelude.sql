-- LOCAL ONLY. This compatibility outbox checks PostgreSQL transaction and RLS
-- behavior, not the hosted websocket service. Never apply to Supabase.
create schema realtime;
create table realtime.messages (
  id uuid primary key default gen_random_uuid(), topic text not null,
  extension text not null, payload jsonb, event text, private boolean default false
);
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated, anon;
grant select, insert on realtime.messages to authenticated, anon;
create function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '');
$$;
-- Same transaction-bound insert and random id as the inspected Staging helper.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
declare generated_id uuid := gen_random_uuid(); final_payload jsonb;
begin
  final_payload := case when payload ? 'id' then payload else jsonb_set(payload, '{id}', to_jsonb(generated_id)) end;
  perform set_config('realtime.topic', topic, true);
  insert into realtime.messages(id, payload, event, topic, private, extension)
  values(generated_id, final_payload, event, topic, private, 'broadcast');
exception when others then
  raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
end;
$$;
