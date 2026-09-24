const fs=require('node:fs');
const assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '../.codex-test-runtime/node_modules/@electric-sql/pglite');

(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create schema private;
   create table public.character_master(id bigint primary key,server_id integer,character_name text,
     char_key text,is_active boolean default true,updated_at timestamptz default now());
   create table public.lookup_snapshots(id bigint primary key,server_id integer,character_name text,
     status text,created_at timestamptz,raw_payload jsonb);
   create function public.kinojo_character_identity_key_v298(text) returns text
     language sql immutable as 'select lower($1)';
   create function private.kinojo_normalize_equipped_titles_v466(jsonb) returns jsonb
     language sql immutable as $$select jsonb_build_array(jsonb_build_object('status',
       case when $1->'titleList'='[]'::jsonb then 'unequipped' else 'equipped' end))$$;
   insert into public.character_master(id,server_id,character_name,char_key) values
     (1,2002,'A','123'),(2,2002,'B','123'),(3,2002,'C','123'),(4,2002,'D','123'),(5,2002,'E','123');
   insert into public.lookup_snapshots values
     (1,2002,'A','OK',now()-interval '1 day','{"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=123"},"title":{"titleList":[{"name":"old"}]}}}}'),
     (2,2002,'A','OK',now(),' {"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=123"}}}}'),
     (3,2002,'B','OK',now()-interval '1 day','{"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=123"},"title":{"titleList":[{"name":"old"}]}}}}'),
     (4,2002,'B','STAT_PARSE_FAILED',now(),'{}'),
     (5,2002,'C','OK',now()-interval '1 day','{"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=123"},"title":{"titleList":[{"name":"old"}]}}}}'),
     (6,2002,'C','OK',now(),' {"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=999"}}}}'),
     (7,2002,'D','OK',now(),' {"officialRaw":{"info":{"profile":{"profileImage":"/p?charKey=123"},"title":{"titleList":[{"name":"new"}]}}}}');
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20260924092100_character_titles_latest_lookup.sql','utf8'));
  const title=async name=>(await db.query(
    'select private.kinojo_character_equipped_titles_v466(2002,$1) result',[name])).rows[0].result;
  assert.equal((await title('A')).titles[0].status,'unequipped','new success without a title never borrows the old title');
  assert.equal((await title('B')).code,'OFFICIAL_LOOKUP_FAILED','new failed lookup never borrows the old title');
  assert.equal((await title('C')).code,'OFFICIAL_LOOKUP_FAILED','identity mismatch never borrows the old title');
  assert.equal((await title('D')).titles[0].status,'equipped');
  assert.equal((await title('E')).code,'OFFICIAL_LOOKUP_FAILED','no official lookup is a failure');
  await db.exec(fs.readFileSync('supabase/rollbacks/20260924092100_character_titles_latest_lookup.sql','utf8'));
  assert.equal((await title('B')).titles[0].status,'equipped','rollback restores old bounded fallback');
  console.log('latest official title source: PASS');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
