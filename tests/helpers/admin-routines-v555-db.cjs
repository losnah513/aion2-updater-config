const fs=require('node:fs');const read=p=>fs.readFileSync(p,'utf8');const name='20261008062130_character_automatic_main_alt_frequency.sql';module.exports=async db=>{
  await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
  await db.exec(read('tests/fixtures/character-refresh-relation-schema.sql'));
  await db.exec(read('tests/fixtures/character-refresh-list-preference-schema.sql'));
  const events=read('tests/fixtures/legion-add-baseline/queue-schema.sql').match(/create table public.updater_runtime_events[^;]+;/i)[0];await db.exec(events);
  await db.exec(`create schema cron;
   create table cron.job(jobid bigint primary key,jobname text,schedule text,active boolean,command text);
   create table cron.job_run_details(runid bigint primary key,jobid bigint,status text,start_time timestamptz,end_time timestamptz,return_message text);
   create function cron.alter_job(bigint,schedule text default null,active boolean default null) returns void language sql as $$ update cron.job j set schedule=coalesce($2,j.schedule),active=coalesce($3,j.active) where jobid=$1 $$;
   insert into cron.job values(11,'kinojo-character-refresh-6h-v377','0 1,13 * * *',true,'SECRET_SENTINEL'),(12,'kinojo-sanctuary-sheet-sync-12h-v377','0 5,17 * * *',false,'SECRET_SENTINEL'),(99,'unrelated','* * * * *',true,'SECRET_SENTINEL');
   insert into cron.job_run_details values(1,11,'failed',now()-interval '1 hour',now()-interval '59 minutes','SECRET_SENTINEL'),(2,11,'succeeded',now(),now(),'SECRET_SENTINEL');
   alter table kinojo_server_automation_settings add list_sheet_sync_enabled boolean default true;
   alter table updater_sessions add list_sheet_sync_enabled boolean default true;
   alter table character_master add unique(server_id,character_name);
   alter table lookup_session_targets add unique(session_id,server_id,character_name);
   create sequence synthetic_target;alter table lookup_session_targets alter id set default nextval('synthetic_target');
   create function kinojo_expire_updater_lock() returns void language sql as $$select$$;
   create function kinojo_validate_updater_session(text,text) returns jsonb language sql security definer as $$ select jsonb_build_object('ok',exists(select 1 from updater_sessions where session_id=$1 and session_token=$2)) $$;
   create function kinojo_web_admin_actor_v323(text) returns jsonb language plpgsql as $$begin
     if $1='synthetic-admin' then return '{"id":1,"level":5}'::jsonb;end if;
     if $1='synthetic-member' then return '{"id":2,"level":1}'::jsonb;end if;
     raise exception 'INVALID_WEB_SESSION';end $$;
   create function kinojo_lookup_step_upsert(text,text,integer,text,integer,integer,text,jsonb) returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;
   create function kinojo_runtime_progress(text,text,text,text,text,integer,integer,jsonb) returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;
   create function kinojo_strip_server_suffix(text) returns text language sql immutable as $$ select $1 $$;
   create function kinojo_normalize_aion_class_name(text) returns text language sql immutable as $$ select $1 $$;
   create function kinojo_character_identity_key_v298(text) returns text language sql immutable as $$select lower(trim($1))$$;
   create function kinojo_character_identity_strict_258(text,integer) returns jsonb language sql as $$select jsonb_build_object('matchable',true,'status','OK','characterName',$1,'serverId',$2)$$;
   create function kinojo_server_name_by_id(integer) returns text language sql as $$select '지켈'::text$$;
   create function kinojo_lookup_admin_exclusion_reason(integer,text) returns text language sql as $$ select case when lookup_excluded then 'synthetic exclusion' else null end from character_master where server_id=$1 and character_name=$2 limit 1 $$;
   create function private.kinojo_character_lookup_policy(bigint) returns jsonb language sql as $$ select jsonb_build_object('eligible',not coalesce(lookup_excluded,false) and character_name not like 'dormant%', 'reason',case when character_name like 'dormant%' then 'AUTO_NO_ACTIVITY' else 'MANAGED_LEGION' end) from character_master where id=$1 $$;
   create table private.character_activity_checks(character_id bigint primary key,session_id text,claim_id uuid,claimed_at timestamptz,lease_until timestamptz,next_check_at timestamptz,source_revision jsonb,outcome text,checked_at timestamptz,code text,profile jsonb);
   create table private.character_activity_lifecycle(character_id bigint,excluded_at timestamptz);
   create function private.kinojo_character_activity_session(text,text) returns boolean language sql as $$select coalesce((kinojo_validate_updater_session($1,$2)->>'ok')::boolean,false)$$;
   create function private.kinojo_character_activity_lock() returns void language sql as $$select$$;
   create function private.kinojo_character_activity_reconcile(bigint) returns void language sql as $$select$$;
   insert into kinojo_server_automation_settings(automation_key,enabled,schedule_kst,running,pre_block_minutes,post_block_minutes) values('character_refresh',true,'["10:00","22:00"]',false,15,15);
   insert into updater_lock_state(id,is_locked) values('global',false);
   insert into server_master(server_id,server_name,server_short_name,is_active) values(2002,'지켈','지켈',true);
   insert into character_master(id,character_name,server_id,is_main,main_character_name,is_active,status,lookup_excluded) values
     (1,'main',2002,true,'main',true,'OK',false),(2,'alt',2002,false,'main',true,'OK',false),
     (3,'excluded',2002,false,'main',true,'OK',true),(4,'db-alt',2002,false,'db-main',true,'OK',false),
     (5,'db-main',2002,true,'db-main',true,'OK',false),(101,'dormant-main',2002,true,'dormant-main',true,'OK',false),
     (102,'dormant-alt',2002,false,'dormant-main',true,'OK',false);`);
  await db.exec(read('supabase/migrations/'+name));
  const timetable='20261008070108_server_routine_timetable.sql';
  await db.exec(read('supabase/migrations/'+timetable));

};
