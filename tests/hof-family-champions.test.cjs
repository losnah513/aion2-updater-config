'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite();const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 try{
  // Actual production candidate, with synthetic canonical scope and presentation adapters.
  await db.exec(`create schema private;create role anon;create role authenticated;create role service_role;
   create table public.fixture_characters(character_id bigint primary key,server_id bigint default 2002,server_name text default '지켈',character_name text,main_character_name text,is_main boolean,class_name text default '수호성',profile_image_url text default '',detail_url text,legion_name text,ranking_legion_name text,ranking_owner_character_id bigint,ranking_owner_character_name text,latest_pve_combat_power bigint,latest_pve_item_level int,latest_pvp_combat_power bigint,latest_pvp_item_level int,latest_power_total bigint,latest_item_level_total int,last_synced_at timestamptz,is_default_ranking_legion boolean default true,is_active boolean default true,visibility_excluded boolean default false);
   create view public.v_kinojo_ranking_character_scope_v296 as select * from public.fixture_characters where is_active and not visibility_excluded;
   create table public.v_reaction_summary(character_name text,like_count int,dislike_count int,total_count int,comments text[]);
   create function public.kinojo_normalize_character_name(text) returns text language sql as 'select lower(trim($1))';
   create function public.kinojo_aion_week_window(timestamptz) returns table(start_at timestamptz,end_at timestamptz) language sql as $$select $1,$1+interval '7 days'$$;
   create function public.kinojo_hof_weekly_deltas(timestamptz) returns table(server_id bigint,character_name text,power_delta int,item_level_delta int) language sql as $$select 2002::bigint,'Alpha'::text,5,2$$;
   create function public.kinojo_hof_display_item_v343(jsonb) returns jsonb language sql as $$select case when $1 is null then null else jsonb_build_object('characterId',($1->>'character_id')::bigint,'name',$1->>'character_name','serverId',($1->>'server_id')::bigint,'serverName',$1->>'server_name','className',$1->>'class_name','profileImageUrl',$1->>'profile_image_url') end$$;
   insert into public.fixture_characters(character_id,character_name,is_main,ranking_owner_character_id,latest_pve_combat_power) values
    (100,'Alpha',true,100,600),(101,'A-alt',false,100,300),
    (200,'Beta',true,200,450),(201,'B-alt',false,200,100),(202,'B-unknown',false,200,null),(203,'B-invalid',false,200,-50),
    (300,'External',true,300,2000),(301,'C-alt1',false,300,100),(302,'C-alt2',false,300,100),(303,'C-alt3',false,300,100),(304,'C-alt4',false,300,null),
    (400,'Beta',true,400,1),(401,'cross-server-alt',false,400,1),
    (500,'Hidden',true,500,999999),(501,'hidden-alt',false,500,999999),
    (600,'Inactive',true,600,999999),(601,'inactive-alt',false,600,999999),
    (700,'Orphan',false,999,999999),(800,'NoPower',true,800,null);
   update public.fixture_characters set is_default_ranking_legion=false where ranking_owner_character_id=300;
   update public.fixture_characters set server_id=2003,server_name='다른서버' where ranking_owner_character_id=400;
   update public.fixture_characters set visibility_excluded=true where character_id=500;
   update public.fixture_characters set is_active=false where character_id=600;
  `);
  await db.exec(read('tests/fixtures/hof-family-champions.sql'));
  await db.exec('revoke all on function private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz) from public,anon,authenticated;grant execute on function private.kinojo_ranking_hof_candidate_v476(jsonb,boolean,boolean,timestamptz) to service_role');
  const ranking={pveItems:[{character_id:100,character_name:'Alpha',server_id:2002,rank_no:1}],pvpItems:[]};
  const call=async(subs,all)=>(await db.query("select private.kinojo_ranking_hof_candidate_v476($1::jsonb,$2,$3,'2026-10-30T00:00:00Z') payload",[JSON.stringify(ranking),subs,all])).rows[0].payload;
  const baseline=[];for(const subs of [false,true])for(const all of [false,true])baseline.push(await call(subs,all));
  const beforeAcl=(await db.query("select proacl::text,proconfig from pg_proc where proname='kinojo_ranking_hof_candidate_v476'")).rows;
  await db.exec(read('supabase/migrations/20261030102944_hof_family_champions.sql'));
  let index=0;
  for(const subs of [false,true])for(const all of [false,true]){
   const value=await call(subs,all),s=value.summarySections;
   assert.equal(s.allForOne.characterId,all?300:100);assert.equal(s.allForOne.familyPower,all?2300:900);
   assert.equal(s.oneForAll.characterId,all?300:200);assert.equal(s.oneForAll.altCount,all?4:3);
   assert.equal(s.oneForAll.familyCharacterCount,all?5:4);assert.equal(s.oneForAll.knownPowerCount,all?4:2);
   delete s.allForOne;delete s.oneForAll;assert.deepEqual(value,baseline[index++],'all prior HOF metrics/provenance preserved');
  }
  assert.deepEqual((await db.query("select proacl::text,proconfig from pg_proc where proname='kinojo_ranking_hof_candidate_v476'")).rows,beforeAcl);
  await db.exec("insert into public.fixture_characters(character_id,character_name,is_main,ranking_owner_character_id,latest_pve_combat_power) values(900,'A-first-tie',true,900,900)");
  assert.equal((await call(false,false)).summarySections.allForOne.characterId,900,'deterministic tie winner');
  await db.exec('delete from public.fixture_characters where character_id<>800');
  let result=(await call(false,false)).summarySections;assert.equal(result.allForOne,null);assert.equal(result.oneForAll.characterId,800);assert.equal(result.oneForAll.altCount,0);
  await db.exec('delete from public.fixture_characters');result=(await call(false,false)).summarySections;assert.equal(result.allForOne,null);assert.equal(result.oneForAll,null);
  await db.exec(read('supabase/rollbacks/20261030102944_hof_family_champions_rollback.sql'));
  assert.equal(Object.hasOwn((await call(false,false)).summarySections,'allForOne'),false);
  console.log('PASS: actual HOF candidate, PVE family sums, alt-only counts, null/negative values, no member requirement, scopes/toggle independence, same-name servers, hidden/inactive roots, ties/empty state, old payload parity, ACL/config and rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
