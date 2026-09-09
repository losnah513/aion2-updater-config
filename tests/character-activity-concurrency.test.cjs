// Real PostgreSQL, synthetic data only. No production URL/credentials accepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {Client}=require('./runtime/postgres/node_modules/pg');
(async()=>{
 const binaries=await (await import(pathToFileURL(path.resolve('tests/runtime/postgres/node_modules/embedded-postgres/dist/binary.js')))).default();
 const parent=path.resolve('tests/runtime/postgres/data');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'activity-'));
 const net=require('node:net'),probe=net.createServer();
 await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;
 await new Promise(r=>probe.close(r));
 execFileSync(binaries.initdb,['-D',dir,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe',timeout:30000});
 // pg_ctl uses PostgreSQL's normal restricted-token startup on Windows.
 // No OS user/service is created and the listener is loopback-only.
 execFileSync(binaries.pg_ctl,['-D',dir,'-l',path.join(dir,'server.log'),'-o',`-p ${port} -h 127.0.0.1 -c statement_timeout=5000`,'start','-w','-t','15'],{windowsHide:true,stdio:'ignore',timeout:20000});
 const clients=[];
 try{
   for(let n=0;n<100;n++){
     const c=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:500});
     try{await c.connect();clients.push(c);break;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}
   }
   assert.equal(clients.length,1,'local PostgreSQL connection failed');
   const a=clients[0],b=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
   await b.connect();clients.push(b);
   await a.query(fs.readFileSync('tests/fixtures/character-refresh-policy-schema.sql','utf8'));
   await a.query(`alter table character_master add primary key(id),add column lookup_policy text default 'INHERIT',
     add column lookup_group_policy text default 'AUTO',add column lookup_policy_updated_at timestamptz,
     add column lookup_policy_actor_id bigint,add column relation_review_attempted_at timestamptz;
     create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date) returns table(end_at timestamptz)
       language sql as $$select now()+interval '1 day'$$;
     insert into character_master(id,character_name,server_id,legion_name,main_character_id,last_lookup_success_at,legion_updated_at,legion_source_snapshot_id)
       values(1,'root',2008,'external',1,now(),now(),1),(2,'alt',2008,'external',1,now(),now(),2);
     insert into lookup_snapshots(id,server_id,character_name,status,raw_payload)
       select id,server_id,character_name,'OK',jsonb_build_object('officialRaw',jsonb_build_object('info',jsonb_build_object('profile',
       jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name)))) from character_master;`);
   await a.query(fs.readFileSync('supabase/migrations/20260909060134_character_family_lookup_eligibility.sql','utf8'));
   await a.query(fs.readFileSync('supabase/migrations/20260909082438_character_activity_lifecycle.sql','utf8'));
   await a.query(`create table public.synthetic_prepare_calls(id int);
     create function public.kinojo_validate_updater_session(text,text) returns jsonb language sql
       as $$select jsonb_build_object('ok',$2='synthetic','code','SYNTHETIC_SESSION')$$;
     create function public.kinojo_prepare_lookup_queue_from_list_v296(text,text,jsonb,jsonb) returns jsonb language plpgsql
       as $$begin insert into synthetic_prepare_calls values(1);return '{"ok":true}'::jsonb;end$$;
     create function public.kinojo_is_full_list_lookup_v297(jsonb) returns boolean language sql as $$select true$$;`);
   const reconcile=()=>a.query('select private.kinojo_character_activity_reconcile(1) p');
   const cases=[
     ['same character',"update character_master set lookup_policy='INCLUDE' where id=1"],
     ['family return',"update character_master set server_id=2002,legion_name='깡' where id=2"],
     ['new family witness',"insert into character_master(id,character_name,server_id,legion_name,main_character_id) values(3,'new-alt',2002,'깡',1)"],
     ['new Sanctuary slot',"insert into private.sanctuary_management_slots_v412(team_id,character_id) values(1,2)"],
     ['schedule change',"insert into private.sanctuary_management_schedule_versions_v437(schedule_id,status) values(1,'ACTIVE')"],
     ['official evidence change',"update lookup_snapshots set status='ERROR' where id=2"]
   ];
   for(const [label,sql] of cases){
     await b.query('begin');await b.query(sql);
     let code=null;const started=performance.now();
     try{await reconcile();}catch(e){code=e.code;}
     await b.query('rollback');
     assert.equal(code,'55P03',label+' must fail closed on an uncommitted competing write');
     assert.ok(performance.now()-started<1500,label+' must not wait for the writer');
     assert.equal(Number((await a.query('select count(*) n from private.character_activity_lifecycle')).rows[0].n),0);
     console.log('PASS: concurrent '+label);
   }
   await a.query('begin');await reconcile();
   await assert.rejects(b.query('select private.kinojo_character_activity_reconcile(2)'),e=>e.code==='55P03','parallel evaluators must not deadlock while upgrading locks');
   const invalid=(await b.query("select kinojo_prepare_lookup_queue_from_list('test','invalid','[]'::jsonb,'{}'::jsonb) p")).rows[0].p;
   assert.equal(invalid.code,'SYNTHETIC_SESSION','auth precedes lock access');
   const busy=(await b.query("select kinojo_prepare_lookup_queue_from_list('test','synthetic','[]'::jsonb,'{}'::jsonb) p")).rows[0].p;
   assert.equal(busy.code,'ACTIVITY_RELATION_BUSY');assert.equal(busy.retryable,true);
   assert.equal(Number((await b.query('select count(*) n from synthetic_prepare_calls')).rows[0].n),0);
   // The reverse ordering must also protect a new relationship until A commits.
   await b.query("set lock_timeout='100ms'");
   await assert.rejects(b.query("insert into private.sanctuary_management_slots_v412(team_id,character_id) values(1,2)"),e=>e.code==='55P03');
   await a.query('commit');
   assert.equal(Number((await a.query('select count(*) n from private.character_activity_events')).rows[0].n),1);
   await b.query("update character_master set server_id=2002,legion_name='깡' where id=2");
   assert.equal((await reconcile()).rows[0].p.reason,'MANAGED_LEGION_FAMILY');
   assert.equal((await a.query('select cleanup_candidate_at from private.character_activity_lifecycle')).rows[0].cleanup_candidate_at,null);
   console.log('PASS: reverse ordering, committed return, audit and deletion-candidate cancellation');
   await a.query(`create index on character_master(main_character_id);
     create unique index on lookup_snapshots(id);
     insert into character_master(id,character_name,server_id,legion_name,main_character_id,last_lookup_success_at,legion_updated_at,legion_source_snapshot_id)
       select id,'synthetic-'||id,2008,'external',id,now(),now(),id from generate_series(3,190) id;
     insert into lookup_snapshots(id,server_id,character_name,status,raw_payload)
       select id,server_id,character_name,'OK',jsonb_build_object('officialRaw',jsonb_build_object('info',jsonb_build_object('profile',
       jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name))))
       from character_master where id>=3;`);
   const sweep=`do $$declare v_id bigint;begin
     perform private.kinojo_character_activity_lock();
     for v_id in select cm.id from character_master cm
       where exists(select 1 from private.character_activity_lifecycle l where l.character_id=cm.id)
       or private.kinojo_character_lookup_policy(cm.id)->>'reason'='AUTO_NO_ACTIVITY' order by cm.id
     loop perform private.kinojo_character_activity_reconcile(v_id);end loop;
   end$$`;
   for(const phase of ['first','repeat']){
     const started=performance.now();await a.query(sweep);const elapsedMs=Math.round(performance.now()-started);
     assert.ok(elapsedMs<1500,'190-row lifecycle sweep exceeded local safety budget');
     console.log(JSON.stringify({test:'lifecycle sweep',phase,characters:190,elapsedMs,localOnly:true}));
   }
   // Add the DB-only lifecycle to the same real two-connection harness.
   await a.query(`alter table character_master add column lookup_policy_reason text;
     create table kinojo_server_automation_settings(automation_key text,running boolean,active_session_id text,last_message text);`);
   await a.query(fs.readFileSync('supabase/migrations/20260909092154_character_activity_relation_recheck.sql','utf8'));
   const adminSource=fs.readFileSync('supabase/migrations/20260908062618_character_refresh_eligibility_and_restore.sql','utf8');
   await a.query(adminSource.slice(adminSource.indexOf('create or replace function public.kinojo_admin_character_lookup_policy_update('),adminSource.indexOf('create or replace function private.kinojo_db_only_list_restore_allowed')));
   await a.query(fs.readFileSync('supabase/migrations/20260909143826_character_activity_inactive.sql','utf8'));
   await a.query(`update character_master set server_id=2008,legion_name='external',is_active=true,class_name='궁성',char_key='1234567890'||id where id in(1,2);
     insert into private.character_activity_checks(character_id,session_id,claim_id,claimed_at,lease_until,next_check_at,source_revision,checked_at,outcome,profile)
     select id,'synthetic',gen_random_uuid(),now(),now()+interval '1 minute',now()+interval '7 days',to_jsonb(c),now(),'VERIFIED',
       jsonb_build_object('serverId',server_id,'characterName',character_name,'regionName',legion_name) from character_master c where id in(1,2);
     select private.kinojo_character_activity_reconcile(1);
     update private.character_activity_lifecycle set excluded_at=now()-interval '1 month',cleanup_candidate_at=now()-interval '1 second' where character_id=1;`);
   await b.query('begin');
   await b.query("insert into google_list_sheet_sync_queue(character_id,sync_status) values(1,'queued')");
   await assert.rejects(reconcile(),e=>e.code==='55P03','an uncommitted LIST enqueue fences inactivity');
   await b.query('rollback');
   await a.query('begin');assert.equal((await reconcile()).rows[0].p.inactive,true);
   await assert.rejects(b.query("insert into google_list_sheet_sync_queue(character_id,sync_status) values(1,'queued')"),e=>e.code==='55P03','inactivity fences a concurrent queue writer');
   await a.query('commit');
   await assert.rejects(b.query("insert into google_list_sheet_sync_queue(character_id,sync_status) values(1,'queued')"),/CHARACTER_INACTIVE_LIST_WRITE_BLOCKED/);
   await b.query("update character_master set is_active=true,visibility_excluded=false where id=1");
   assert.equal((await a.query('select is_active from character_master where id=1')).rows[0].is_active,false);
   await b.query("update character_master set server_id=2002,legion_name='깡' where id=2");
   assert.equal((await reconcile()).rows[0].p.inactive,false);
   console.log('PASS: inactive/LIST two-way transaction fence, stale replay and family restoration');
 }finally{
   for(const c of clients){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
   execFileSync(binaries.pg_ctl,['-D',dir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'pipe',timeout:10000});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
