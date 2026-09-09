// Synthetic local database only. Never accepts an operating database URL.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{const db=new PGlite();try{
 await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
 await db.exec(`alter table character_master add primary key(id),add column lookup_policy text default 'INHERIT',
 add column lookup_group_policy text default 'AUTO',add column lookup_policy_updated_at timestamptz,
 add column lookup_policy_actor_id bigint,add column lookup_policy_reason text,add column relation_review_attempted_at timestamptz;
 create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(end_at timestamptz) language sql as $$select now()+interval '1 day'$$;
 create function public.kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',$2='synthetic')$$;
 create function public.kinojo_admin_member_from_credential_v325(text) returns setof member_codes language sql as $$select * from member_codes where $1='synthetic'$$;
 insert into member_codes(id,level) values(1,3);
 create table kinojo_server_automation_settings(automation_key text,running boolean,active_session_id text,active_run_id text,last_message text);
 insert into kinojo_server_automation_settings values('character_refresh',true,'test','run',null);
 insert into updater_sessions(session_id,tool_name,client_id,status) values('test','KINOJO_SERVER_AUTOMATION','SYSTEM_CRON_CHARACTER_REFRESH','starting');
 insert into server_master(server_id,race_id,is_active) values(2002,2,true);
 insert into character_master(id,character_name,server_id,class_name,char_key,legion_name,main_character_id,last_lookup_success_at,legion_updated_at,legion_source_snapshot_id,is_active,visibility_excluded)
 select i,'character'||i,2002,'궁성','1234567890'||i,'external',case when i=2 then 1 else i end,now()-interval '8 days',now()-interval '8 days',i,true,false from generate_series(1,7) i;
 insert into lookup_snapshots(id,server_id,character_name,status,raw_payload)
 select id,server_id,character_name,'OK',jsonb_build_object('officialRaw',jsonb_build_object('info',jsonb_build_object('profile',jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name)))) from character_master;`);
 for(const file of ['20260909060134_character_family_lookup_eligibility.sql','20260909082438_character_activity_lifecycle.sql','20260909092154_character_activity_relation_recheck.sql'])await db.exec(read('supabase/migrations/'+file));
 const original=read('supabase/migrations/20260908062618_character_refresh_eligibility_and_restore.sql');
 await db.exec(original.slice(original.indexOf('create or replace function public.kinojo_admin_character_lookup_policy_update('),original.indexOf('create or replace function private.kinojo_db_only_list_restore_allowed')));
 await db.exec(read('supabase/migrations/20260909143826_character_activity_inactive.sql'));
 const q=async(s,a=[])=> (await db.query(s,a)).rows;
 const policy=async id=>(await q('select private.kinojo_character_lookup_policy($1) p',[id]))[0].p;
 const reconcile=async id=>(await q('select private.kinojo_character_activity_reconcile($1) p',[id]))[0].p;
 for(let i=1;i<=7;i++)await reconcile(i);
 await db.exec(`insert into private.character_activity_checks(character_id,session_id,claim_id,claimed_at,lease_until,next_check_at,source_revision,checked_at,outcome,profile)
 select id,'old',gen_random_uuid(),now(),now()+interval '100 seconds',now()-interval '1 day',to_jsonb(c),now(),'VERIFIED',
 jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name) from character_master c;`);
 assert.equal((await reconcile(1)).inactive,false,'same-month exclusion must remain excluded');
 await db.exec("update private.character_activity_lifecycle set excluded_at=now()-interval '1 month',cleanup_candidate_at=now()-interval '1 second'");
 await db.exec("update private.character_activity_checks set checked_at=now()-interval '11 minutes' where character_id=2");
 assert.equal((await reconcile(1)).inactive,false,'stale family evidence holds');
 await db.exec("update private.character_activity_checks set checked_at=now() where character_id=2");
 await db.exec("insert into google_list_sheet_sync_queue(character_id,sync_status) values(1,'queued')");
 assert.equal((await reconcile(1)).inactive,false,'pending LIST holds');
 await db.exec("update google_list_sheet_sync_queue set sync_status='synced'");
 await db.exec("insert into lookup_session_targets(session_id,server_id,character_name,target_status) values('test',2002,'character1','claimed')");
 assert.equal((await reconcile(1)).inactive,false,'in-flight lookup holds');
 await db.exec("update lookup_session_targets set target_status='lookup_done'");
 assert.equal((await reconcile(1)).inactive,true);
 assert.equal((await policy(1)).eligible,false);
 assert.equal((await q('select is_active,visibility_excluded from character_master where id=1'))[0].is_active,false);
 await db.exec("update character_master set is_active=true,visibility_excluded=false where id=1");
 assert.equal((await q('select is_active from character_master where id=1'))[0].is_active,false,'LIST replay cannot reactivate');
 await assert.rejects(db.exec("insert into character_master(id,character_name,server_id,char_key) values(99,'renamed',2002,'12345678901')"),/REIMPORT_BLOCKED/);
 await assert.rejects(db.exec("insert into character_master(id,character_name,server_id) values(99,'character1',2002)"),/REIMPORT_BLOCKED/);
 await assert.rejects(db.exec("insert into google_list_sheet_sync_queue(character_id,sync_status) values(1,'queued')"),/LIST_WRITE_BLOCKED/);
 await reconcile(1);
 assert.equal((await q("select count(*)::int n from private.character_activity_events where character_id=1 and state='INACTIVE'"))[0].n,1,'idempotent inactivity');
 // Actual authenticated setter body, with only credential resolution mocked locally.
 assert.equal((await q("select kinojo_admin_character_lookup_policy_update('bad',1,'INCLUDE','CHARACTER','test','') p"))[0].p.code,'ADMIN_ACCESS_DENIED');
 assert.equal((await q("select kinojo_admin_character_lookup_policy_update('synthetic',1,'INCLUDE','CHARACTER','test','') p"))[0].p.ok,true);
 assert.equal((await policy(1)).inactive,false,'explicit individual include restores');
 assert.equal((await q('select is_active,visibility_excluded from character_master where id=1'))[0].visibility_excluded,false);
 assert.equal((await reconcile(3)).inactive,true);
 // Prove the real bounded claim/complete accepts inactive and restores on official return.
 const batch=(await q("select kinojo_character_activity_claim('test','synthetic') p"))[0].p;
 const t=batch.targets.find(t=>t.characterId===3);assert(t,'inactive character must be periodically checked');
 const profile={serverId:2002,characterName:'character3',className:'궁성',raceId:2,profileImage:'https://example.test/image?charKey=12345678903',regionName:'깡'};
 const result=(await q("select kinojo_character_activity_complete('test','synthetic',$1,$2,$3,null) p",[3,t.claimId,JSON.stringify({profile})]))[0].p;
 assert.equal(result.outcome,'VERIFIED');assert.equal((await policy(3)).inactive,false);
 assert.equal((await policy(3)).reason,'MANAGED_LEGION');
 assert.equal((await q('select count(*)::int n from character_master'))[0].n,7);
 assert.equal((await q('select count(*)::int n from lookup_snapshots'))[0].n,7,'history preserved');
 for(const role of ['anon','authenticated'])assert.equal((await q(`select has_function_privilege('${role}','private.kinojo_character_activity_reconcile(bigint,timestamptz)','EXECUTE') p`))[0].p,false);
 await db.exec(read('supabase/rollbacks/20260909143826_character_activity_inactive_rollback.sql'));
 // Reset one synthetic subject; the preceding claim reconciles all due rows.
 await db.exec("update character_master set activity_inactive_at=null,activity_inactive_previous=null,is_active=true where id=7");
 await db.exec("update private.character_activity_checks set outcome='VERIFIED',checked_at=now() where character_id=7");
 assert.equal((await reconcile(7)).inactive,false,'recovery freeze stops new transitions');
 assert.equal((await q('select count(*)::int n from character_master'))[0].n,7);
 console.log('PASS: DB-only inactivity, month gate, fresh family evidence, queue/lookup holds, reimport/write fences, admin/official return, idempotency, history/ACL and recovery freeze');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
