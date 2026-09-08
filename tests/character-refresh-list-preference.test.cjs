const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
const name='20260908073247_character_refresh_list_write_preference.sql';
const definition=(sql,name)=>{const a=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert.ok(a>=0);const b=sql.indexOf('$function$',sql.indexOf('AS $function$',a)+14);return sql.slice(a,b+10)+';';};
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
 await db.exec(read('tests/fixtures/character-refresh-relation-schema.sql'));
 await db.exec(read('tests/fixtures/character-refresh-list-preference-schema.sql'));
 await db.exec('alter table updater_session_progress_current add primary key(session_id)');
 await db.exec('create function kinojo_expire_updater_lock() returns void language sql as $$select$$');
 await db.exec(`
 create function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',exists(select 1 from updater_sessions where session_id=$1 and session_token=$2))$$;
 create function kinojo_get_updater_actor(text) returns table(level int,main_character_name text) language sql as $$select case when $1='test-master' then 5 else 3 end,'synthetic'$$;
 create function kinojo_automation_admin_status_v377(text) returns jsonb language sql as $$select jsonb_build_object('ok',true,'canManage',true,'characterRefresh',kinojo_automation_window_v377('character_refresh'))$$;
 `.replace(/create function kinojo_automation_admin_status_v377[\s\S]*/,'')); // defined after migration below
 await db.exec(read('supabase/migrations/'+name));
 await db.exec(read('supabase/migrations/20260908134927_character_listless_completion_lease.sql'));
 await db.exec(`create function kinojo_server_queue_postprocess_claim_v271(text,text,text) returns jsonb language plpgsql as $$begin
 if (select raw_payload->>'adminControlState' from updater_sessions where session_id=$1)='paused' then return '{"ok":true,"acquired":false,"paused":true}'::jsonb;end if;
 update lookup_batches set worker_id=$3 where session_id=$1 and worker_id is null;
 return jsonb_build_object('ok',true,'acquired',found);end$$;`);
 await db.exec(`
 create function kinojo_automation_admin_status_v377(text) returns jsonb language sql as $$select jsonb_build_object('ok',true,'canManage',true,'characterRefresh',kinojo_automation_window_v377('character_refresh'))$$;
 create function private.kinojo_legion_tree_finalize_relation_v373(text) returns jsonb language plpgsql as $$begin raise exception 'ordinary OFF must not mutate legion-tree relations';end$$;
 create function kinojo_runtime_finish(text,text,text,text,jsonb) returns jsonb language sql as $$select '{"ok":true}'::jsonb$$;
 create function kinojo_lookup_step_upsert(text,text,int,text,int,int,text,jsonb) returns void language sql as $$insert into lookup_session_steps(session_id,step_key,step_order,status,progress_current,progress_total,message,detail,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())$$;
 insert into kinojo_server_automation_settings(automation_key,running,enabled,schedule_kst,pre_block_minutes,post_block_minutes) values('character_refresh',false,false,'[]',0,0);
 insert into updater_sessions(session_id,session_token,status,raw_payload) values('old','token','running','{}'),('off','token','running','{"serverQueue":true,"listSheetSyncEnabled":false}');
 `);
 const audit=read('supabase/migrations/20260908080303_character_refresh_audit_safety.sql');
 await db.exec(definition(audit,'kinojo_lookup_progress_summary'));
 await db.exec(definition(audit,'kinojo_automation_window_v377'));
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 const val=async(s,p=[])=>(await q(s,p))[0].v;
 assert.equal(await val("select list_sheet_sync_enabled v from updater_sessions where session_id='old'"),true);
 await assert.rejects(()=>db.exec("insert into updater_sessions(raw_payload) values('{\"listSheetSyncEnabled\":\"false\"}')"),/INVALID_LIST/);
 await assert.rejects(()=>db.exec("insert into updater_sessions(raw_payload) values('{\"listSheetSyncEnabled\":false}')"),/REQUIRES_SERVER_QUEUE/);
 await assert.rejects(()=>db.exec("update updater_sessions set list_sheet_sync_enabled=true where session_id='off'"),/FROZEN/);
 await db.exec("update updater_sessions set raw_payload='{\"listSheetSyncEnabled\":true}' where session_id='off'");
 assert.equal(await val("select (raw_payload->>'listSheetSyncEnabled')::boolean v from updater_sessions where session_id='off'"),false);
 await db.exec("insert into updater_sessions(session_id,raw_payload) values('retry','{\"serverQueue\":true,\"retryFailedRowsOnly\":true,\"sourceSessionId\":\"off\"}')");
 assert.equal(await val("select list_sheet_sync_enabled v from updater_sessions where session_id='retry'"),false);
 assert.equal((await val("select kinojo_automation_admin_list_write_save('test-manager',false) v")).code,'MASTER_ACCESS_REQUIRED');
 assert.equal((await val("select kinojo_automation_admin_list_write_save('test-master',false) v")).status.characterRefresh.listSheetSyncEnabled,false);
 await db.exec("update kinojo_server_automation_settings set running=true");
 assert.equal((await val("select kinojo_automation_admin_list_write_save('test-master',true) v")).code,'AUTOMATION_RUNNING');
 assert.equal((await val("select kinojo_queue_list_sheet_sync_session('off','token') v")).queuedCount,0);
 assert.equal((await val("select kinojo_legion_tree_listless_policy_v455('off','bad') v")).ok,false);
 await db.exec(`
 insert into lookup_batches(session_id,status,worker_id,postprocess_master_done,postprocess_review_done,postprocess_ranking_done,postprocess_snapshot_required) values('off','running','worker',true,true,true,false);
 insert into lookup_session_targets(id,session_id,target_status,lookup_order,character_name) values(1,'off','lookup_done',1,'synthetic'),(2,'off','final_failed',2,'synthetic-failed');
 insert into lookup_session_steps(session_id,step_key,status,progress_current,progress_total) select 'off',k,'done',2,2 from unnest(array['LIST_MASTER_COMPARE','CHARACTER_LOOKUP','MISSING_RECHECK','MASTER_SYNC','GROWTH_REVIEW','RANKING_REBUILD']) k;
 `);
 const complete=async(worker='worker')=>val("select kinojo_legion_tree_listless_complete_v455('off','token',$1) v",[worker]);
 assert.equal((await complete('stale')).code,'POSTPROCESS_WORKER_MISMATCH');
 await db.exec("update lookup_batches set postprocess_ranking_done=false");
 assert.equal((await complete()).code,'POSTPROCESS_NOT_COMPLETE');
 await db.exec("update lookup_batches set postprocess_ranking_done=true;update lookup_session_targets set target_status='queued' where id=2");
 assert.equal((await complete()).code,'LOOKUP_NOT_SETTLED');
 await db.exec("update lookup_session_targets set target_status='final_failed' where id=2");
 // Real stage completion clears worker_id; finalization must reacquire, not reject it.
 await db.exec("update lookup_batches set worker_id=null;update updater_sessions set raw_payload=raw_payload||'{\"adminControlState\":\"paused\"}'::jsonb where session_id='off'");
 assert.equal((await complete()).paused,true);
 assert.equal(await val("select worker_id v from lookup_batches where session_id='off'"),null);
 await db.exec("update updater_sessions set raw_payload=raw_payload||'{\"adminControlState\":\"running\"}'::jsonb where session_id='off'");
 let result=await complete();
 assert.equal(result.ok,true);assert.equal(result.partialSuccess,true);assert.equal(result.listSheetComplete,false);
 assert.equal(Number(result.progress.overallProgressPercent),100);assert.equal(result.progress.listWriteSkipped,true);
 assert.equal((await complete()).partialSuccess,true);
 // Execute the actual materialized path used by the administrator page, not only the legacy summary.
 await db.exec("select private.kinojo_queue_summary_refresh_core_v422('off');update updater_session_progress_current set total_count=2,completed_count=2,success_count=1,failed_count=1,skipped_count=0,queued_count=0,claimed_count=0,retry_pending_count=0,remaining_count=0 where session_id='off';select private.kinojo_queue_summary_refresh_progress_v422('off')");
 const cached=await val("select progress_payload v from updater_session_progress_current where session_id='off'");
 assert.equal(Number(cached.overallProgressPercent),100);assert.equal(cached.listSheetSyncEnabled,false);
 assert.equal(cached.listWriteSkipped,true);assert.equal(cached.phases[6].status,'skipped');assert.equal(cached.step3Status,'done');
 assert.match(await val("select handoff->>'message' v from updater_session_progress_current where session_id='off'"),/생략/);
 assert.equal(await val("select count(*)::int v from google_list_sheet_sync_queue"),0);
 await db.exec(`
 create table updater_runtime_events(session_id text,job_id text,event_type text,stage text,progress_current int,progress_total int,message text,payload jsonb);
 update kinojo_server_automation_settings set running=true,active_run_id='synthetic-run';
 insert into updater_lock_state(id,is_locked) values('global',false);
 `);
 const automatic=await val("select kinojo_automation_system_character_start_v377('synthetic-run') v");
 assert.equal(automatic.ok,true);assert.equal(automatic.payload.listSheetSyncEnabled,false);
 assert.equal(await val("select list_sheet_sync_enabled v from updater_sessions where session_id=$1",[automatic.sessionId]),false);
 console.log('PASS: real automatic start snapshots OFF and actual materialized seven-phase admin summary ends skipped at 100%');
 await db.exec(read('supabase/rollbacks/'+name));
 assert.equal(await val("select list_sheet_sync_enabled v from updater_sessions where session_id='off'"),false);
 console.log('PASS: default ON, strict OFF, immutable session, retry inheritance, admin permissions/running lock, queue bypass, completion fences, partial+100% skip, rollback preserves history');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
