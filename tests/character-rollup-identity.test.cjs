const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create schema private;
 create table character_history(id bigint primary key,character_master_id bigint,history_date int,character_name text,record_type text,status text,gear_type text,
 pve_combat_power int,pve_item_level int,pvp_combat_power int,pvp_item_level int,server_id int,created_at timestamptz);
 create function kinojo_character_identity_key_v298(text) returns text language sql immutable as $$select lower($1)$$;`);
 await db.exec(fs.readFileSync('tests/evidence/20260908-character-refresh-audit/rollup-existing-fixture.sql','utf8'));
 await db.exec("create trigger trg_character_history_growth_rollup_insert_v424 after insert on character_history for each row execute function private.kinojo_growth_rollup_history_insert_v424()");
 const insert=async(id,master,name,power,date='260902',server=2002,gear='PVE')=>db.query(`insert into character_history(id,character_master_id,history_date,character_name,record_type,status,gear_type,pve_combat_power,pve_item_level,pvp_combat_power,pvp_item_level,server_id,created_at)
 values($1,$2,$3::int,$4,'POWER','OK',$5,$6,$7,$8,$9,$10,to_date(($3::int)::text,'YYMMDD')::timestamptz) on conflict(id) do nothing`,
 [id,master,date,name,gear,gear==='PVE'?power:null,gear==='PVE'?10:null,gear==='PVP'?power:null,gear==='PVP'?10:null,server]);
 await insert(100,null,'legacy',5);
 const legacy=JSON.stringify((await db.query("select * from private.character_growth_rollups order by granularity")).rows);
 await db.exec(fs.readFileSync('supabase/migrations/20260908090023_character_rollup_identity_writer.sql','utf8'));
 await insert(1,1,'old',100);await insert(2,1,'renamed',150,'260908',2003);
 await insert(3,2,'old',500);await insert(4,2,'old',900,'260908');
 await insert(5,1,'renamed',20,'260908',2003,'PVP');
 let rows=(await db.query("select * from private.character_growth_rollups where granularity='WEEK' and character_master_id is not null order by character_master_id,gear_type")).rows;
 assert.equal(rows.length,3);assert.equal(rows[0].power_delta,50);assert.equal(rows[0].source_count,2);assert.equal(rows[0].server_id,2003);
 assert.equal(rows[2].power_delta,400);assert.equal(rows[2].source_count,2);
 const before=JSON.stringify(rows);
 await insert(2,1,'renamed',150,'260908',2003);
 await db.exec('update character_history set character_master_id=character_master_id where id=2');
 rows=(await db.query("select * from private.character_growth_rollups where granularity='WEEK' and character_master_id is not null order by character_master_id,gear_type")).rows;
 assert.equal(JSON.stringify(rows),before);
 await insert(6,null,'unknown',55);
 assert.equal((await db.query("select growth_identity_rolled_up f from character_history where id=6")).rows[0].f,false);
 await db.exec('update character_history set character_master_id=3 where id=6');
 await db.exec('update character_history set character_master_id=3 where id=6');
 assert.equal((await db.query("select source_count from private.character_growth_rollups where character_master_id=3 and granularity='MONTH'")).rows[0].source_count,1);
 await assert.rejects(db.exec('update character_history set character_master_id=4 where id=6'),/ROLLUP_IDENTITY_CORRECTION_REQUIRED/);
 assert.equal((await db.query("select character_master_id from character_history where id=6")).rows[0].character_master_id,3);
 await db.exec(`create function reject_test() returns trigger language plpgsql as $$begin if new.id=99 then raise exception 'FORCED_FAILURE';end if;return new;end$$;
 create trigger zz_reject after insert on character_history for each row execute function reject_test();`);
 await assert.rejects(insert(99,99,'rejected',40),/FORCED_FAILURE/);
 assert.equal((await db.query('select count(*)::int n from private.character_growth_rollups where character_master_id=99')).rows[0].n,0);
 const legacyNow=(await db.query("select * from private.character_growth_rollups where character_master_id is null order by granularity")).rows.map(({character_master_id,...r})=>r);
 assert.equal(JSON.stringify(legacyNow),legacy);
 assert.equal((await db.query("select period_start::text d from private.character_growth_rollups where character_master_id=1 and granularity='WEEK' limit 1")).rows[0].d,'2026-09-02');
 const count=(await db.query('select count(*)::int n from private.character_growth_rollups')).rows[0].n;
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908090023_character_rollup_identity_writer.sql','utf8'));
 assert.equal((await db.query('select count(*)::int n from private.character_growth_rollups')).rows[0].n,count);
 console.log('PASS: real DAY/WEEK/MONTH trigger; rename/transfer and namesake separation; conflict retry/no-op relink counted once; unlinked skip; bounded history relink; atomic failure; legacy preservation; rollback');
 await db.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
