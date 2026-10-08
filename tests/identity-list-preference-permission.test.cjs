const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8'),name='20261008060429_identity_list_preference_permission.sql';
const before=read('supabase/rollbacks/'+name).split('\n').slice(1).join('\n'),after=read('supabase/migrations/'+name).split('\n').slice(2).join('\n');
const restored=after.replace('v_auth := public.kinojo_legion_tree_listless_policy_v455(p_session_id, p_session_token);','v_auth := public.kinojo_validate_updater_session(p_session_id, p_session_token);').replaceAll("coalesce((v_auth->>'listSheetSyncEnabled')::boolean, false)",'(select list_sheet_sync_enabled from public.updater_sessions where session_id=p_session_id)');
assert.equal(restored.trimEnd(),before.trimEnd());
async function run(){
 const db=new PGlite();
 try{
  await db.exec(read('tests/fixtures/character-refresh-policy-schema.sql'));
  await db.exec(read('tests/fixtures/character-refresh-relation-schema.sql'));
  await db.exec(`alter table updater_sessions add list_sheet_sync_enabled boolean;
   alter table google_list_sheet_sync_queue add unique(session_id,character_name,server_id);
   create function kinojo_validate_updater_session(text,text) returns jsonb language sql security definer as $$ select jsonb_build_object('ok',$2='synthetic-token','code','INVALID_SESSION') $$;
   create function kinojo_parse_nonnegative_int_v530(text) returns integer language sql immutable as $$ select $1::int $$;
   create function kinojo_character_identity_key_v298(text) returns text language sql immutable as $$ select lower(trim($1)) $$;
   create function kinojo_normalize_aion_class_name(text) returns text language sql immutable as $$ select nullif(trim($1),'') $$;
   grant usage on schema public,private to service_role;
   grant select,insert,update,delete on all tables in schema public,private to service_role;
   revoke all on updater_sessions from service_role;
   insert into server_master values(2002,2,'지켈','지켈',true,now()),(2003,2,'브리트라','브리',true,now()),(1001,1,'천족','천',true,now());`);
  await db.exec(read('tests/fixtures/identity-list-preference-policy.sql'));
  await db.exec('revoke all on function kinojo_legion_tree_listless_policy_v455(text,text) from public; grant execute on function kinojo_legion_tree_listless_policy_v455(text,text) to service_role;');
  const q=async(sql,args=[])=> (await db.query(sql,args)).rows;
  const val=async(sql,args=[])=> (await q(sql,args))[0].v;
  const seed=async(enabled=true)=>{
   await db.exec(`truncate character_master,lookup_session_targets,updater_sessions,character_identity_change_history,character_identity_recovery_attempts,google_list_sheet_sync_queue,private.legion_tree_assignments,private.legion_tree_configs;
    insert into updater_sessions(session_id,list_sheet_sync_enabled) values('synthetic',${enabled});
    insert into character_master(id,character_name,server_id,server_name,char_key,class_name,is_main,legion_name,is_active) values(1,'old',2002,'지켈','123456789012345678','궁성',true,'깡',true);
    insert into character_master(id,character_name,server_id,main_character_id,main_character_name,is_active) values(2,'alt',2002,1,'old',true);
    insert into lookup_session_targets(id,session_id,server_id,character_name,list_row) values(1,'synthetic',2002,'old',10);
    insert into private.legion_tree_assignments(character_id,legion_name) values(1,'깡');
    insert into private.legion_tree_configs(legion_name,revision) values('깡',1);`);
  };
  const candidate={charKey:'123456789012345678',serverId:2002,characterName:'new',className:'궁성',sourceServerId:2002,sourceCharacterName:'old',detailUrl:'https://example.test/verified'};
  const apply=async(c=candidate,token='synthetic-token',session='synthetic')=>{
   await db.exec('set role service_role');
   try{return await val('select kinojo_character_identity_recovery_apply_v1($1,$2,1,$3) v',[session,token,JSON.stringify(c)]);}
   finally{await db.exec('reset role');}
  };
  await db.exec(before);
  await db.exec('revoke all on function kinojo_character_identity_recovery_apply_v1(text,text,bigint,jsonb) from public; grant execute on function kinojo_character_identity_recovery_apply_v1(text,text,bigint,jsonb) to service_role;');
  await seed();
  await assert.rejects(()=>apply(),/permission denied for table updater_sessions/);
  assert.equal(await val('select character_name v from character_master where id=1'),'old');
  assert.equal(await val('select count(*)::int v from character_identity_change_history'),0);
  await db.exec(after);
  assert.equal(await val("select has_table_privilege('service_role','updater_sessions','select') v"),false);
  assert.equal(await val("select prosecdef v from pg_proc where proname='kinojo_character_identity_recovery_apply_v1'"),false);
  for(const enabled of [true,false]){
   await seed(enabled);
   const result=await apply();assert.equal(result.ok,true);assert.equal(result.listSyncQueued,enabled);
   assert.equal(await val('select character_name v from character_master where id=1'),'new');
   assert.equal(await val('select main_character_name v from character_master where id=2'),'new');
   assert.equal(await val('select legion_name v from character_master where id=1'),'깡');
   assert.equal(await val('select count(*)::int v from private.legion_tree_assignments'),1);
   assert.equal(await val('select count(*)::int v from character_identity_change_history'),1);
   assert.equal(await val('select count(*)::int v from character_identity_recovery_attempts'),1);
   assert.equal(await val('select count(*)::int v from google_list_sheet_sync_queue'),enabled?1:0);
  }
  await seed();
  assert.equal((await apply(candidate,'bad')).code,'INVALID_SESSION');
  assert.equal((await apply(candidate,'synthetic-token','missing')).code,'SERVER_QUEUE_SESSION_NOT_FOUND');
  for(const [changes,code] of [[{charKey:'different'},'CHAR_KEY_MISMATCH'],[{className:'검성'},'CLASS_MISMATCH'],[{serverId:1001},'SERVER_RACE_MISMATCH'],[{sourceCharacterName:'stale'},'STALE_IDENTITY_SOURCE']]){
   await seed();assert.equal((await apply({...candidate,...changes})).code,code);
   assert.equal(await val('select character_name v from character_master where id=1'),'old');
  }
  await seed();await db.exec("insert into character_master(id,character_name,server_id,is_active) values(3,'new',2002,true)");
  assert.equal((await apply()).code,'TARGET_IDENTITY_CONFLICT');
  await seed();const transfer=await apply({...candidate,serverId:2003});assert.equal(transfer.serverTransferred,true);assert.equal(transfer.legionCleared,true);
  assert.equal(await val('select count(*)::int v from private.legion_tree_assignments'),0);
  await seed();
  await db.exec("create function reject_attempt() returns trigger language plpgsql as $$ begin raise exception 'synthetic downstream failure'; end $$; create trigger reject_attempt before insert on character_identity_recovery_attempts for each row execute function reject_attempt();");
  await assert.rejects(()=>apply(),/synthetic downstream failure/);
  assert.equal(await val('select character_name v from character_master where id=1'),'old');
  assert.equal(await val('select count(*)::int v from character_identity_change_history'),0);
  assert.equal(await val('select count(*)::int v from google_list_sheet_sync_queue'),0);
  await db.exec('drop trigger reject_attempt on character_identity_recovery_attempts');
  await db.exec(before);await assert.rejects(()=>apply(),/permission denied for table updater_sessions/);
  console.log('PASS: service_role baseline failure and atomic rollback; restricted invoker rename/transfer, list ON/OFF, auth/missing session, identity guards, downstream rollback and code rollback');
 }finally{await db.close();}
}
run().catch(e=>{console.error(e.message,e.position);process.exitCode=1;});
