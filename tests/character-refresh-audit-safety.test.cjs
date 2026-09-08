const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`
 create schema private;
 create role anon; create role authenticated; create role service_role;
 create function kinojo_lookup_apply_admin_exclusions(text) returns jsonb language sql as 'select null::jsonb';
 create table updater_lock_state(id text primary key,is_locked boolean,status text,message text,session_id text,expires_at timestamptz,stage text,release_reason text,released_at timestamptz,session_token text);
 create table updater_runtime_jobs(session_id text,status text,last_heartbeat_at timestamptz,updated_at timestamptz,started_at timestamptz,created_at timestamptz,timeout_seconds int,current_stage text,message text,finished_at timestamptz,summary jsonb);
 create table updater_sessions(session_id text,status text,finished_at timestamptz,error_message text,message text);
 create table lookup_batches(session_id text,status text,finished_at timestamptz,memo text,updated_at timestamptz);
 create table kinojo_server_automation_settings(automation_key text primary key,running boolean,active_run_id text,active_session_id text,last_finished_at timestamptz,last_status text,last_message text,updated_at timestamptz,enabled boolean,schedule_kst jsonb,pre_block_minutes int,post_block_minutes int,last_started_at timestamptz);
 create table character_detail_refresh_jobs(id uuid primary key,character_master_id bigint,status text,completed_at timestamptz,updated_at timestamptz,created_at timestamptz,base_equipment_payload jsonb);
 create table character_skill_current_state(character_master_id bigint primary key,manual_job_id uuid,manual_refreshed_at timestamptz,manual_source_updated_at timestamptz,manual_skills jsonb,updated_at timestamptz);
 create function kinojo_character_skill_normalize_v415(jsonb) returns jsonb language sql immutable as 'select $1';
 create table private.kinojo_ranking_snapshots_v390(snapshot_id bigint primary key,status text,next_scope int,validation_report jsonb,validated_at timestamptz,updated_at timestamptz,last_error_code text,last_error_message text);
 create table private.kinojo_ranking_snapshot_scopes_v390(snapshot_id bigint,ranking_payload jsonb,hof_payload jsonb,include_subs boolean,include_all_legions boolean,pve_count int,pvp_count int,owner_metric_counts jsonb);
 create table private.kinojo_ranking_snapshot_items_v390(snapshot_id bigint,include_subs boolean,include_all_legions boolean,rank_mode text,rank_no int,server_id int,character_name text);
 create function kinojo_normalize_character_name(text) returns text language sql immutable as 'select lower($1)';
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260908080303_character_refresh_audit_safety.sql','utf8'));
 await db.exec(`
 insert into updater_lock_state values('global',true,'running','','old',now()-interval '1 minute',null,null,null,null);
 insert into updater_runtime_jobs(session_id,status,last_heartbeat_at) values('old','running',now()-interval '10 minutes');
 insert into updater_sessions(session_id,status) values('old','running');
 insert into lookup_batches(session_id,status) values('old','running');
 insert into kinojo_server_automation_settings(automation_key,running,active_run_id,active_session_id,enabled,schedule_kst,pre_block_minutes,post_block_minutes) values('character_refresh',true,'run-old','old',true,'[]',0,0);
 `);
 await db.query('select kinojo_expire_updater_lock()');
 let a=(await db.query('select * from kinojo_server_automation_settings')).rows[0];
 assert.equal(a.running,false);assert.equal(a.active_session_id,null);
 await db.exec("update kinojo_server_automation_settings set running=true,active_run_id='run-new',active_session_id='new'");
 await db.query('select kinojo_expire_updater_lock()');
 a=(await db.query('select * from kinojo_server_automation_settings')).rows[0];assert.equal(a.running,true);assert.equal(a.active_run_id,'run-new');
 await db.exec("update kinojo_server_automation_settings set active_session_id='old'");
 let w=(await db.query("select kinojo_automation_window_v377('character_refresh') as v")).rows[0].v;
 assert.equal(w.running,false);assert.equal(w.manualBlocked,false);
 assert.equal((await db.query('select running from kinojo_server_automation_settings')).rows[0].running,true); // read does not mutate
 await db.exec(`
 create trigger sync after insert or update or delete on character_detail_refresh_jobs for each row execute function kinojo_character_skill_manual_sync_v415();
 insert into character_detail_refresh_jobs values('00000000-0000-0000-0000-000000000001',1,'completed',now(),now(),now(),'{"skill":{"skillList":[{"id":1}]}}');
 `);
 let before=(await db.query('select * from character_skill_current_state')).rows[0];
 await db.exec("update character_detail_refresh_jobs set updated_at=now()+interval '1 hour'");
 assert.deepEqual((await db.query('select * from character_skill_current_state')).rows[0],before);
 await db.query('select kinojo_character_skill_manual_refresh_v415(1)');
 assert.deepEqual((await db.query('select * from character_skill_current_state')).rows[0],before);
 await db.exec(`update character_detail_refresh_jobs set base_equipment_payload='{"skill":{"skillList":[{"id":2}]}}'`);
 assert.deepEqual((await db.query('select manual_skills from character_skill_current_state')).rows[0].manual_skills,[{id:2}]);
 await db.exec(`
 insert into private.kinojo_ranking_snapshots_v390(snapshot_id,status,next_scope) values(1,'BUILDING',4);
 insert into private.kinojo_ranking_snapshot_scopes_v390
 select 1,jsonb_build_object('ok',true,'includeSubs',s,'includeAllLegions',a,'pvpItems','[]'::jsonb),
 jsonb_build_object('ok',true,'includeSubs',s,'includeAllLegions',a,'summarySections','{}'::jsonb,'pveTop',null,'pvpTop',null,'weeklyAwards',null,'rankingPeriod',null),s,a,0,0,
 '{"enhance":0,"pve":0,"pvp":0,"like":0,"dislike":0,"growth":0}'::jsonb
 from (values(false),(true)) ss(s) cross join (values(false),(true)) aa(a);
 `);
 let rank=(await db.query('select private.kinojo_ranking_snapshot_validate_v390(1) as v')).rows[0].v;
 assert.equal(rank.ok,false);assert.ok(rank.errors.includes('PAYLOAD_CONTRACT_INVALID'));
 await db.exec(`update private.kinojo_ranking_snapshots_v390 set status='BUILDING'; update private.kinojo_ranking_snapshot_scopes_v390 set ranking_payload=ranking_payload||'{"pveItems":[]}'::jsonb`);
 rank=(await db.query('select private.kinojo_ranking_snapshot_validate_v390(1) as v')).rows[0].v;assert.equal(rank.ok,true);
 assert.equal((await db.query("select has_function_privilege('anon','kinojo_lookup_apply_admin_exclusions(text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','kinojo_lookup_apply_admin_exclusions(text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role','kinojo_lookup_apply_admin_exclusions(text)','execute') as allowed")).rows[0].allowed,true);
 assert.equal((await db.query("select pg_get_functiondef('kinojo_lookup_progress_summary(text)'::regprocedure) as definition")).rows[0].definition.includes('perform public.kinojo_lookup_apply_admin_exclusions'),false);
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908080303_character_refresh_audit_safety.sql','utf8'));
 console.log('PASS: expiry matching-session cleanup, newer run preservation, read-only effective status, heartbeat/no-op skill writes, changed skills, malformed/valid ranking, rollback');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
