const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create table character_master(id bigint primary key,char_key text,server_id int,character_name text);
 create table extension_character_payloads(id bigint primary key,session_id text,server_id int,character_name text,char_key text,gear_type text,master_sync_status text);
 create table master_sync_events(id bigint primary key,session_id text,payload_id bigint,character_name text,status text,after_data jsonb,raw_payload jsonb,created_at timestamptz);
 create function kinojo_normalize_character_name(text) returns text language sql immutable as $$select lower(replace($1,' ',''))$$;
 create function kinojo_json_int(jsonb,text) returns int language sql immutable as $$select ($1->>$2)::int$$;
 create function kinojo_hof_weekly_gear_deltas(timestamptz default now())
 returns table(server_id int,character_name text,gear_type text,baseline_power int,latest_power int,power_delta int,baseline_item_level int,latest_item_level int,item_level_delta int,period_start timestamptz,period_end timestamptz,baseline_at timestamptz,latest_at timestamptz,baseline_payload_id bigint,latest_payload_id bigint,sample_count int)
 language sql as $$select null::int,null::text,null::text,null::int,null::int,null::int,null::int,null::int,null::int,null::timestamptz,null::timestamptz,null::timestamptz,null::timestamptz,null::bigint,null::bigint,null::int where false$$;`);
 await db.exec(fs.readFileSync('tests/evidence/20260908-character-refresh-audit/weekly-existing-functions.sql','utf8'));
 await db.exec("create role anon; create role authenticated; revoke all on function kinojo_hof_weekly_gear_deltas(timestamptz) from public");
 await db.exec(fs.readFileSync('supabase/migrations/20260908085012_character_weekly_growth_stable_identity.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260908131116_character_weekly_identity_query_plan.sql','utf8'));
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'kinojo_hof_weekly_gear_deltas(timestamptz)','execute') allowed",[role])).rows[0].allowed,false);
 await db.exec("insert into character_master values(1,'111111111111111111',2003,'renamed'),(2,'222222222222222222',2002,'old')");
 const event=async(id,master,name,server,gear,power,at,override={})=>{
  const key=master===1?'111111111111111111':'222222222222222222';
  await db.query("insert into extension_character_payloads values($1,$2,$3,$4,$5,$6,'synced')",[id,'s'+id,server,name,key,gear]);
  const after={id:master,char_key:key,server_id:server,character_name:name,latest_payload_id:id,
   [gear==='PVE'?'latest_pve_combat_power':'latest_pvp_combat_power']:power,
   [gear==='PVE'?'latest_pve_item_level':'latest_pvp_item_level']:10,...override};
  await db.query("insert into master_sync_events values($1,$2,$1,$3,'synced',$4,'{}',$5)",[id,'s'+id,name,JSON.stringify(after),at]);
 };
 await event(1,1,'old',2002,'PVE',100,'2026-09-02T06:00:00+09:00');
 await event(2,1,'renamed',2003,'PVE',150,'2026-09-08T12:00:00+09:00');
 await event(3,2,'old',2002,'PVE',200,'2026-09-03T12:00:00+09:00');
 await event(4,2,'old',2002,'PVE',900,'2026-09-08T12:00:00+09:00');
 await event(5,1,'old',2002,'PVP',20,'2026-09-03T12:00:00+09:00');
 await event(6,1,'renamed',2003,'PVP',35,'2026-09-08T12:00:00+09:00');
 // Exclude previous/next week, missing or numeric key, wrong Master/key, payload/session/name proof.
 await event(7,1,'old',2002,'PVE',9999,'2026-09-02T05:59:59+09:00');
 await event(8,1,'renamed',2003,'PVE',9999,'2026-09-09T06:00:00+09:00');
 await event(9,1,'renamed',2003,'PVE',9999,'2026-09-08T13:00:00+09:00',{id:2});
 await event(10,1,'renamed',2003,'PVE',9999,'2026-09-08T13:00:00+09:00',{char_key:null});
 await event(11,1,'renamed',2003,'PVE',9999,'2026-09-08T13:00:00+09:00',{latest_payload_id:99});
 await event(12,1,'renamed',2003,'PVE',9999,'2026-09-08T13:00:00+09:00',{character_name:'someone'});
 await event(13,1,'renamed',2003,'PVE',9999,'2026-09-08T13:00:00+09:00');
 await db.exec("update master_sync_events set session_id='wrong' where id=13");
 const at='2026-09-08T14:00:00+09:00';
 const rows=(await db.query('select * from kinojo_hof_weekly_gear_deltas($1)',[at])).rows;
 assert.equal(rows.length,3);
 const renamed=rows.find(x=>x.character_name==='renamed'&&x.gear_type==='PVE');
 assert.equal(renamed.power_delta,50);assert.equal(renamed.sample_count,2);assert.equal(renamed.server_id,2003);
 assert.equal(rows.find(x=>x.character_name==='old').power_delta,700);
 const combined=(await db.query('select * from kinojo_hof_weekly_deltas($1)',[at])).rows;
 assert.equal(combined.length,2);assert.equal(combined.find(x=>x.character_name==='renamed').power_delta,65);
 assert.equal((await db.query('select character_name from master_sync_events where id=1')).rows[0].character_name,'old');
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908085012_character_weekly_growth_stable_identity.sql','utf8'));
 assert.equal((await db.query('select count(*)::int n from master_sync_events')).rows[0].n,13);
 console.log('PASS: actual weekly SQL and combined wrapper; rename+transfer continuity; namesake separation; PVE/PVP; Wednesday 06:00 boundaries; invalid proof excluded; raw history and rollback preserved');
 await db.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
