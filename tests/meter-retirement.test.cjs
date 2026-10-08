const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261007041302_retire_meter.sql');
const {PGlite}=require(process.env.PGLITE_MODULE||path.join(root,'.codex-test-runtime/node_modules/@electric-sql/pglite'));
async function fixture(){
 const db=new PGlite();
 await db.exec(`create schema private;
 create table public.lookup_session_targets(id bigint);
 create table public.character_master(id bigint);
 create table public.member_codes(id bigint);
 create table public.kinojo_banner_campaigns(id integer,page_code text);
 create table public.kinojo_banner_auto_pools_v407(id integer,target_pages text[]);
 create table private.kinojo_banner_event_groups_v391(id integer,target_pages text[]);
 create table public.shared_sentinel(id integer primary key,value text);
 insert into public.shared_sentinel values(1,'keep');
 insert into public.kinojo_banner_campaigns values(1,'HOME'),(2,'METER');
 insert into public.kinojo_banner_auto_pools_v407 values(1,array['HOME','METER']),(2,array['METER']);
 insert into private.kinojo_banner_event_groups_v391 values(1,array['ALL']),(2,array['METER']),(3,array['METER','HOF']);`);
 const names=sql.split('drop table if exists\n')[1].split(' restrict;')[0].split(',\n');
 assert.equal(names.length,80);
 for(const name of names)await db.exec(`create table ${name}(id integer primary key); insert into ${name} values(1);`);
 await db.exec("create function public.kinojo_meter_semver_key_50011(text) returns integer language sql immutable as 'select 1';");
 for(const [table,names] of Object.entries({"meter_core_download_audit":["ck_meter_core_audit_current_50016","ck_meter_core_audit_launcher_50016"],"meter_core_release_master":["ck_meter_core_launcher_minimum_50016","ck_meter_core_minimum_50016","ck_meter_core_version_50016","ck_meter_core_version_order_50016"],"meter_desktop_release_master":["ck_meter_desktop_release_minimum_50011","ck_meter_desktop_release_version_50011","ck_meter_desktop_release_version_order_50011"],"meter_launcher_release_master":["ck_meter_launcher_minimum_50016","ck_meter_launcher_version_50016","ck_meter_launcher_version_order_50016"]}))for(const name of names)await db.exec(`alter table public.${table} add constraint ${name} check(public.kinojo_meter_semver_key_50011(id::text)>0);`);
 await db.exec('alter table public.meter_combat_targets add column record_id integer references public.meter_combat_records(id);');
 return db;
}
(async()=>{
 const db=await fixture();
 await db.exec(sql);
 assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind='r' and c.relname like 'meter_%'")).rows[0].n,0);
 assert.deepEqual((await db.query('select * from public.shared_sentinel')).rows,[{id:1,value:'keep'}]);
 assert.deepEqual((await db.query('select page_code from public.kinojo_banner_campaigns order by id')).rows,[{page_code:'HOME'}]);
 assert.deepEqual((await db.query('select target_pages from public.kinojo_banner_auto_pools_v407 order by id')).rows,[{target_pages:['HOME']}]);
 assert.deepEqual((await db.query('select target_pages from private.kinojo_banner_event_groups_v391 order by id')).rows,[{target_pages:['ALL']},{target_pages:['HOF']}]);
 for(const [value,expected] of [[null,null],['',null],[' 2002 ',2002],['0',0],['2147483647',2147483647],['2147483648',null],['-1',null],['1.2',null],['abc',null],['99999999999',null]]){
  assert.equal((await db.query('select public.kinojo_parse_nonnegative_int_v530($1) v',[value])).rows[0].v,expected);
 }
 for(const page of ['HOME','HOF','RANKING','LEGION_TREE','LEGION_ROSTER','SANCTUARY','SANCTUARY_SCHEDULE'])assert.equal((await db.query('select private.kinojo_banner_manifest_target_valid_v387($1,\'LEFT\') ok',[page])).rows[0].ok,true);
 assert.equal((await db.query("select private.kinojo_banner_manifest_target_valid_v387('METER','LEFT') ok")).rows[0].ok,false);
 const contract=(await db.query('select private.kinojo_banner_target_page_contract_v404() v')).rows[0].v;
 assert.equal(contract.sidePages.length,7);assert.ok(contract.sidePages.every(x=>x.pageCode!=='METER'));
 const refs=(await db.query("select prosrc from pg_proc where proname in('kinojo_character_identity_recovery_apply_v1','kinojo_admin_character_identity_apply_v1','kinojo_identity_review_upsert_v287')")).rows;
 assert.equal(refs.length,3);assert.ok(refs.every(x=>x.prosrc.includes('kinojo_parse_nonnegative_int_v530')&&!x.prosrc.includes('kinojo_meter_')));
 await db.close();
 const blocked=await fixture();await blocked.exec('create table public.shared_dependency(id integer references public.meter_combat_records(id));');
 await assert.rejects(blocked.exec(sql),/depend|constraint/i);await blocked.exec('rollback');
 assert.equal((await blocked.query('select count(*)::int n from public.meter_combat_records')).rows[0].n,1);
 assert.equal((await blocked.query("select count(*)::int n from public.kinojo_banner_campaigns where page_code='METER'")).rows[0].n,1);
 await blocked.close();
 for(const p of ['meter/index.html','m/meter/index.html','meter/js/meter-app.js','launcher-content.json'])assert.equal(fs.existsSync(path.join(root,p)),false,p);
 for(const p of ['admin/index.html','m/admin/index.html']){
  const html=read(p);assert.doesNotMatch(html,/data-admin-(?:tab|pane)="meter"|data-meter-/);
  assert.match(html,/id="characterAutomationToggle"/);assert.match(html,/자동 실행 일정을 불러오는 중/);assert.match(html,/admin-automation-control-row/);
 }
 console.log('PASS Meter retirement: 80 tables, shared identity, banner isolation, RESTRICT rollback, automation UI.');
})().catch(error=>{console.error(error.message,error.position,sql.slice(Number(error.position)-80,Number(error.position)+80));process.exit(1);});
