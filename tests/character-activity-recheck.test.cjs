const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
 await db.exec(`alter table character_master add primary key(id),add column lookup_policy text default 'INHERIT',
 add column lookup_group_policy text default 'AUTO',add column lookup_policy_updated_at timestamptz,
 add column lookup_policy_actor_id bigint,add column relation_review_attempted_at timestamptz;
 create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(end_at timestamptz) language sql as $$select now()$$;
 create function public.kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select jsonb_build_object('ok',$2='synthetic')$$;
 create table kinojo_server_automation_settings(automation_key text,running boolean,active_session_id text,active_run_id text,last_message text);
 insert into kinojo_server_automation_settings values('character_refresh',true,'test','run',null);
 insert into updater_sessions(session_id,tool_name,client_id,status,raw_payload) values('test','KINOJO_SERVER_AUTOMATION','SYSTEM_CRON_CHARACTER_REFRESH','starting','{"automationRunId":"run"}');
 insert into server_master(server_id,race_id,is_active) values(2002,2,true);
 insert into character_master(id,character_name,server_id,class_name,char_key,legion_name,main_character_id,last_lookup_success_at,legion_updated_at,legion_source_snapshot_id,latest_pve_combat_power)
 select i,'character'||i,2002,'궁성','1234567890'||i,'external',case when i=2 then 1 else i end,now()-interval '8 days',now()-interval '8 days',i,123456 from generate_series(1,8) i;
 insert into lookup_snapshots(id,server_id,character_name,status,raw_payload)
 select id,server_id,character_name,'OK',jsonb_build_object('officialRaw',jsonb_build_object('info',jsonb_build_object('profile',jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name)))) from character_master;
 update character_master set lookup_excluded=true where id=8;`);
 await db.exec(read('supabase/migrations/20260909060134_character_family_lookup_eligibility.sql'));
 await db.exec(read('supabase/migrations/20260909082438_character_activity_lifecycle.sql'));
 await db.exec(read('supabase/migrations/20260909092154_character_activity_relation_recheck.sql'));
 // Match the pre-existing production service boundary; protected session/token
 // tables receive only the explicit column grants from the migration above.
 await db.exec(`grant usage on schema private to service_role;
 grant select,update on character_master to service_role;
 grant select on lookup_snapshots,server_master to service_role;
 grant select,update on private.sanctuary_management_teams_v412,private.sanctuary_management_slots_v412,
 private.sanctuary_management_schedule_rules_v412,private.sanctuary_management_schedule_exceptions_v412 to service_role;`);
 const q=async(s,a=[])=> (await db.query(s,a)).rows;
 const serviceQ=async(s,a=[])=>{await db.exec('set role service_role');try{return await q(s,a);}finally{await db.exec('reset role');}};
 const claim=async(token='synthetic')=>(await serviceQ('select kinojo_character_activity_claim($1,$2) p',['test',token]))[0].p;
 assert.equal((await claim('bad')).code,'ACTIVITY_SESSION_INVALID');
 assert.equal((await q('select count(*)::int n from private.character_activity_checks'))[0].n,0);
 const batch=await claim();assert.equal(batch.targets.length,5);assert.equal((await claim()).repeated,true);
 const complete=async(t,profile,code=null)=>(await serviceQ('select kinojo_character_activity_complete($1,$2,$3,$4,$5,$6) p',['test','synthetic',t.characterId,t.claimId,JSON.stringify({profile}),code]))[0].p;
 const profile=(i,extra={})=>({serverId:2002,characterName:'character'+i,className:'궁성',raceId:2,profileImage:'https://example.test/image?charKey=1234567890'+i,regionName:'external',...extra});
 assert.equal((await complete(batch.targets[0],profile(1))).outcome,'VERIFIED');
 assert.equal((await complete(batch.targets[1],profile(2,{regionName:'깡'}))).outcome,'VERIFIED');
 assert.equal((await q('select private.kinojo_character_lookup_policy(1) p'))[0].p.reason,'MANAGED_LEGION_FAMILY');
 assert.equal((await q('select state,cleanup_candidate_at from private.character_activity_lifecycle where character_id=1'))[0].state,'RESTORED');
 assert.equal((await complete(batch.targets[1],profile(2))).repeated,true);
 assert.equal((await complete(batch.targets[2],profile(3,{className:'치유성'}))).outcome,'HELD');
 assert.equal((await complete(batch.targets[3],profile(4,{regionName:null}))).code,'ACTIVITY_LEGION_MISSING');
 await db.exec("update character_master set lookup_policy='EXCLUDE' where id=5");
 assert.equal((await complete(batch.targets[4],profile(5,{regionName:'깡'}))).outcome,'STALE');
 assert.equal((await q('select legion_name from character_master where id=5'))[0].legion_name,'external');
 assert.equal((await q('select count(*)::int n from character_master where latest_pve_combat_power<>123456'))[0].n,0);
 assert.equal((await q('select count(*)::int n from google_list_sheet_sync_queue'))[0].n,0);
 for(const role of ['anon','authenticated'])for(const fn of ['kinojo_character_activity_claim(text,text)','kinojo_character_activity_complete(text,text,bigint,uuid,jsonb,text)'])
 assert.equal((await q(`select has_function_privilege('${role}','public.${fn}','execute') allowed`))[0].allowed,false);
 await db.exec("update updater_sessions set session_id='next'; update kinojo_server_automation_settings set active_session_id='next'");
 const next=(await q("select kinojo_character_activity_claim('next','synthetic') p"))[0].p;
 assert.deepEqual(next.targets.map(t=>t.characterId),[6,7],'fairness, manual exclusion and seven-day backoff');
 assert.equal((await q("select has_column_privilege('service_role','updater_sessions','session_token','SELECT') p"))[0].p,false);
 assert.equal((await q("select has_column_privilege('service_role','updater_sessions','status','UPDATE') p"))[0].p,false);
 await db.exec(read('supabase/rollbacks/20260909092154_character_activity_relation_recheck_rollback.sql'));
 assert.equal((await q("select has_function_privilege('service_role','kinojo_character_activity_claim(text,text)','EXECUTE') p"))[0].p,false);
 assert.equal((await q('select count(*)::int n from private.character_activity_checks'))[0].n,7,'rollback preserves observations');
 console.log('PASS: actual SQL bounded claim, session auth, replay, family return, mismatch/missing legion/manual race, stats/LIST preservation, ACL and weekly fairness');
 }finally{await db.close();}
 const source=read('supabase/functions/character-refresh-worker/index.ts');
 const section=source.slice(source.indexOf('async function runActivityRecheck'),source.indexOf('Deno.serve('));
 const calls=[],ctx=vm.createContext({Date,URL,clean:v=>String(v||''),positiveInt:Number,WorkerError:class extends Error{constructor(m,c){super(m);this.code=c;}},
 storedDetailIdentity:()=>({serverId:2002,characterId:'encrypted'}),candidateFromStoredInfo:()=>({ok:true}),
 officialJson:async()=>{calls.push('official');const e=Error('rate');e.code='PLAYNC_HTTP_429';e.retryAfterMs=60000;throw e;},
 rpc:async(name,body)=>{calls.push({name,body});if(name==='kinojo_character_activity_claim')return{ok:true,targets:[1,2].map(i=>({characterId:i,charKey:'12345678901',serverId:2002,claimId:'test'}))};return{ok:true,outcome:'HELD'};}});
 vm.runInContext(section,ctx);await ctx.runActivityRecheck({sessionId:'synthetic',sessionToken:'synthetic'});
 assert.equal(calls.filter(c=>c==='official').length,1,'429 stops subsequent provider requests');
 assert.equal(calls.filter(c=>c.name==='kinojo_character_activity_complete').length,2);
 assert.equal(calls.find(c=>c.name==='kinojo_official_rate_limit_report_v276').body.p_target_id,null);
 assert.match(source,/action==="activityRecheck"[\s\S]*?if\(!internalRequest\(request\)\)/);
 const maintenance=read('supabase/functions/scheduled-maintenance-control/index.ts');
 assert(maintenance.indexOf("action: 'activityRecheck'")<maintenance.indexOf("action: 'prepareList'"));
 console.log('PASS: Worker global rate gate/429 stop, pending result holds and internal-only routing, maintenance before prepare');
})().catch(e=>{console.error(e);process.exitCode=1;});
