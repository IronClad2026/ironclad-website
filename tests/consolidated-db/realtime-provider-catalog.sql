-- DISPOSABLE LOCAL ONLY: schema-only provider reproduction from verified Production catalog.
-- Canonical Realtime send/topic bodies, parent columns, checks and RANGE partition key.
-- A default LOCAL partition receives synthetic outbox rows; no hosted Realtime/WebSocket service is claimed.
-- Real pg_cron/pg_net/Vault/pgcrypto extensions MUST already be installed; no signatures are mocked here.
create schema realtime;
create table realtime.messages (
  "topic" text not null,
  "extension" text not null,
  "payload" jsonb,
  "event" text,
  "private" boolean default false,
  "updated_at" timestamp without time zone not null default now(),
  "inserted_at" timestamp without time zone not null default now(),
  "id" uuid not null default gen_random_uuid(),
  "binary_payload" bytea,
  "skip_broadcast" boolean not null default false,
  constraint messages_payload_check CHECK (payload IS NULL OR binary_payload IS NULL),
  primary key (id,inserted_at)
) partition by range(inserted_at);
create table realtime.messages_local_default partition of realtime.messages default;
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated,anon,service_role;
grant select,insert,update on realtime.messages to authenticated,anon,service_role;
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$
;
CREATE OR REPLACE FUNCTION realtime.topic()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
select nullif(current_setting('realtime.topic', true), '')::text;
$function$
;
