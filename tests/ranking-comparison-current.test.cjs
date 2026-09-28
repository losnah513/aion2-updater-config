const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/20260928060149_ranking_comparison_current.sql','utf8');
const rollback=fs.readFileSync('supabase/rollbacks/20260928060149_ranking_comparison_current.sql','utf8');
const baseline=fs.readFileSync('tests/fixtures/ranking-comparison-baseline.sql','utf8');
async function setup(db){
 await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
 create table character_master(id bigint primary key,server_id int,server_name text,character_name text,
 main_character_name text,is_main boolean,class_name text,profile_image_url text,detail_url text,legion_name text,
 latest_pve_combat_power int,latest_pve_item_level int,latest_pvp_combat_power int,latest_pvp_item_level int,
 latest_power_total int,latest_item_level_total int,last_synced_at timestamptz);
 create view v_kinojo_ranking_character_scope_v296 as select id character_id,m.*,
 legion_name ranking_legion_name,id ranking_owner_character_id,character_name ranking_owner_character_name,
 (legion_name='깡') is_default_ranking_legion from character_master m;
 create view v_reaction_summary as select ''::text character_name,0::int like_count,0::int dislike_count,
 0::int total_count,array[]::text[] comments where false;
 create table character_history(id bigint primary key,character_master_id bigint,history_date int,record_type text,
 status text,gear_type text,pve_combat_power int,pve_item_level int,pvp_combat_power int,pvp_item_level int,created_at timestamptz);
 create table growth_reviews(id bigint,current_history_id bigint,previous_history_id bigint,
 growth_label text,growth_status text,review_text text,created_at timestamptz,updated_at timestamptz);
 insert into character_master(id,server_id,character_name,is_main,legion_name,latest_pve_combat_power,latest_pve_item_level,
 latest_pvp_combat_power,latest_pvp_item_level) values
 (1,2002,'same',true,'깡',800,50,1000,60),(2,2003,'same',false,'other',500,40,800,50),(3,2004,'empty',true,'깡',0,0,0,0);
 insert into character_history values
 (1,1,260801,'POWER','OK','PVE',90,10,null,null,'2026-08-01'),
 (2,1,260802,'POWER','OK','PVE',100,11,null,null,'2026-08-02'),
 (3,1,260802,'POWER','OK','PVE',80,12,null,null,'2026-08-02 01:00Z'),
 (4,1,260803,'POWER','OK','PVE',120,13,null,null,'2026-08-03'),
 (5,1,260802,'POWER','OK','PVP',null,null,700,31,'2026-08-02'),
 (6,1,260804,'POWER','OK','PVP',null,null,750,32,'2026-08-04'),
 (7,2,260805,'POWER','OK',null,450,33,null,null,'2026-08-05'),
 (8,null,260806,'POWER','OK','PVE',99999,99,null,null,'2026-08-06'),
 (9,1,260807,'POWER','FAILED','PVE',99999,99,null,null,'2026-08-07');
 insert into growth_reviews values(1,4,3,'UP','OK','fixture','2026-08-03','2026-08-03');`);
 await db.exec(baseline);
}
async function result(db,a=true,b=true){return(await db.query('select private.kinojo_ranking_snapshot_scope_payload_v426($1,$2) r',[a,b])).rows[0].r;}
(async()=>{
 const old=new PGlite(),current=new PGlite();
 try{
  await setup(old);await setup(current);await current.exec(migration);
  async function parity(){for(const a of [false,true])for(const b of [false,true])assert.deepEqual(await result(current,a,b),await result(old,a,b));}
  async function both(sql){await old.exec(sql);await current.exec(sql);await parity();}
  await parity();
  // Same-day last success, not maximum power. Permanent IDs isolate identical names.
  assert.equal((await result(current)).pveItems.find(x=>x.character_id===1).previous_pve_power,80);
  await both("update character_master set character_name='renamed',server_id=2010 where id=1");
  await both("insert into character_history values(10,1,260802,'POWER','OK','PVE',70,14,null,null,'2026-08-02 02:00Z')");
  await both("update character_history set pve_combat_power=72 where id=10");
  await both("update character_history set status='FAILED' where id=10");
  await both("update character_history set character_master_id=2 where id=3");
  await both("update character_history set character_master_id=1 where id=8");
  await both("update character_history set gear_type='PVP',pve_combat_power=null,pve_item_level=null,pvp_combat_power=40,pvp_item_level=5 where id=8");
  await both("insert into character_history values(11,1,260804,'POWER','OK','PVE',50,20,null,null,null)");
  // Bounded state after repeated collection, including out-of-order days.
  for(let i=20;i<60;i++)await both(`insert into character_history values(${i},1,260900+${i%20},'POWER','OK','PVE',${i},20,null,null,'2026-09-01')`);
  assert.ok((await current.query('select count(*)::int n from private.kinojo_ranking_comparison_current_v522')).rows[0].n<=12);
  const saved=await result(current);
  await current.exec('begin');await current.exec("update character_history set status='FAILED' where id>=20");await current.exec('rollback');
  assert.deepEqual(await result(current),saved);
  assert.equal((await current.query("select has_table_privilege('anon','private.kinojo_ranking_comparison_current_v522','SELECT') allowed")).rows[0].allowed,false);
  assert.equal((await current.query("select has_function_privilege('service_role','private.kinojo_ranking_comparison_refresh_v522(bigint,bigint)','EXECUTE') allowed")).rows[0].allowed,false);
  await current.exec(rollback);await parity();await current.exec(migration);
  // Raw retention must not erase the two numeric observations or require source rows.
  const before=(await result(current)).pveItems.find(x=>x.character_id===1);
  await current.exec('delete from character_history where id>=20');
  const after=(await result(current)).pveItems.find(x=>x.character_id===1);
  assert.equal(after.previous_pve_power,before.previous_pve_power);
  assert.equal(after.previous_pve_date,before.previous_pve_date);
  // Refuse a downgrade that would silently lose the preserved comparison.
  await assert.rejects(current.exec(rollback),/ranking response changed/);await current.exec('rollback');
  assert.equal((await result(current)).pveItems.find(x=>x.character_id===1).previous_pve_power,before.previous_pve_power);
  console.log('ranking comparison current: PASS (four scopes, identity, corrections, retention, bounded state, rollback guard)');
 }finally{await old.close();await current.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
