const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`
 create function public.kinojo_identity_name_v285(text) returns text language sql immutable as $$select lower(replace($1,' ',''))$$;
 create table public.extension_character_payloads(id bigint,server_id int,character_name text,gear_type text,received_at timestamptz);
 insert into public.extension_character_payloads values(1,2002,'LAURA','PVE',now()-interval '1 day'),(2,2002,'laura','PVP',now()),(3,2008,'LAURA','PVE',now()),(4,2002,'other','PVE',now());
 `);
 const query="select id from extension_character_payloads where server_id=2002 and public.kinojo_identity_name_v285(character_name)='laura' order by received_at desc,id desc";
 const before=(await db.query(query)).rows;
 await db.exec(fs.readFileSync('supabase/migrations/20260908143736_character_payload_identity_index.sql','utf8'));
 assert.deepEqual((await db.query(query)).rows,before);
 assert.deepEqual(before,[{id:2},{id:1}]);
 assert.equal((await db.query("select count(*)::int n from pg_indexes where indexname='idx_extension_payloads_identity_latest'")).rows[0].n,1);
 await db.exec(fs.readFileSync('supabase/rollbacks/20260908143736_character_payload_identity_index_rollback.sql','utf8'));
 assert.deepEqual((await db.query(query)).rows,before);
 await db.close();console.log('PASS: normalized identity index preserves server/name/gear rows and rollback');
})().catch(e=>{console.error(e);process.exitCode=1});
