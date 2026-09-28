const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.codex-test-runtime/node_modules/@electric-sql/pglite');
const baseline=fs.readFileSync('tests/fixtures/ranking-comparison-baseline.sql','utf8');
const comparison=fs.readFileSync('supabase/migrations/20260928060149_ranking_comparison_current.sql','utf8');
const migration=fs.readFileSync('supabase/migrations/20260928070942_ranking_review_current.sql','utf8');
const rollback=fs.readFileSync('supabase/rollbacks/20260928070942_ranking_review_current.sql','utf8');
async function setup(db){
 await db.exec(`set timezone='UTC';create schema private;create role anon;create role authenticated;create role service_role;
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
  await setup(old);await setup(current);await old.exec(comparison);await current.exec(comparison);
  await current.exec(migration);
  assert.doesNotMatch((await current.query("select pg_get_functiondef('private.kinojo_ranking_snapshot_scope_payload_v426'::regproc) sql")).rows[0].sql,/public\.(character_history|growth_reviews)/);
  async function parity(){for(const a of [false,true])for(const b of [false,true])assert.deepEqual(await result(current,a,b),await result(old,a,b));}
  async function both(sql){await old.exec(sql);await current.exec(sql);await parity();}
  await parity();
  await both("insert into growth_reviews values(2,4,3,'DOWN','OK','new text','2026-08-04','2026-08-04')");
  await both("update growth_reviews set review_text='edited',updated_at='2026-08-05' where id=2");
  await both("update growth_reviews set created_at='2026-08-01' where id=2");
  await both("update growth_reviews set previous_history_id=7 where id=1");
  await both("update growth_reviews set previous_history_id=3 where id=1");
  await both("update character_history set character_master_id=2 where id=3");
  await both("update character_history set character_master_id=1 where id=3");
  await both("update character_history set character_master_id=2 where id=4");
  await both("update growth_reviews set previous_history_id=null where id=1");
  await both("update character_master set character_name='renamed',server_id=2010 where id=2");
  await both("insert into growth_reviews values(3,200,null,'UNKNOWN','OK','unclassified','2026-09-01','2026-09-01')");
  await both("insert into character_history values(200,1,260901,'POWER','OK',null,null,null,null,null,'2026-09-01')");
  assert.equal((await result(current)).pveItems.find(x=>x.character_id===1).review_updated_at,'2026-09-01T00:00:00+00:00');
  await both("update character_history set gear_type='PVE',pve_combat_power=500,pve_item_level=40 where id=200");
  await both("insert into growth_reviews values(4,6,5,'PVP','OK','pvp text',null,null)");
  for(let i=10;i<50;i++)await both("insert into growth_reviews values("+i+",200,null,'UP','OK','repeat "+i+"','2026-09-02','2026-09-02')");
  assert.ok((await current.query('select count(*)::int n from private.kinojo_ranking_review_current_v523')).rows[0].n<=9);
  await current.exec(rollback);await parity();await current.exec(migration);
  const saved=await result(current);
  await current.exec('begin');await current.exec("update growth_reviews set review_text='abort'");await current.exec('rollback');
  assert.deepEqual(await result(current),saved);
  assert.equal((await current.query("select has_table_privilege('anon','private.kinojo_ranking_review_current_v523','SELECT') allowed")).rows[0].allowed,false);
  assert.equal((await current.query("select has_function_privilege('service_role','private.kinojo_ranking_review_refresh_v523(bigint,bigint[])','EXECUTE') allowed")).rows[0].allowed,false);
  // Expired history no longer changes ranking text, timestamps, or numeric comparisons.
  await current.exec('delete from character_history');
  assert.deepEqual(await result(current),saved);
  await current.exec("update growth_reviews set review_text='edited after retention' where id=49");
  assert.equal((await result(current)).pveItems.find(x=>x.character_id===1).pve_review_text,'edited after retention');
  await current.exec("insert into growth_reviews values(100,200,null,'UP','OK','next review','2026-10-01','2026-10-01')");
  assert.equal((await result(current)).pveItems.find(x=>x.character_id===1).pve_review_text,'next review');
  const retained=await result(current);await current.exec('delete from growth_reviews');
  assert.deepEqual(await result(current),retained);
  await assert.rejects(current.exec(rollback),/ranking response changed/);await current.exec('rollback');
  assert.deepEqual(await result(current),retained);
  // Identity corrections remain meaningful after the review raw row itself expired.
  await current.exec("insert into character_master(id,server_id,character_name) values(4,2002,'four'),(5,2002,'five')");
  await current.exec("insert into character_history values(1000,4,261001,'POWER','OK','PVE',400,40,null,null,'2026-10-01')");
  await current.exec("insert into growth_reviews values(1000,1000,null,'UP','OK','move me','2026-10-01','2026-10-01')");
  await current.exec('delete from growth_reviews where id=1000');
  await current.exec('update character_history set character_master_id=5 where id=1000');
  assert.deepEqual((await current.query("select character_master_id,review_text from private.kinojo_ranking_review_current_v523 where character_master_id in(4,5)")).rows,[{character_master_id:5,review_text:'move me'}]);
  console.log('ranking review current: PASS (four scopes, verified identity, corrections, UNKNOWN timestamp, retention and new writes, bounded state, rollback guard)');
 }finally{await old.close();await current.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
