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
  await db.exec(`create table public.member_codes(id bigint,main_character_name text);
 insert into public.member_codes values(1,'Alpha'),(2,'NoPower');
 create function public.kinojo_member_from_web_credential_v326(text) returns setof public.member_codes language sql as $$select * from public.member_codes where id=case when $1='fixture-alpha' then 1 when $1='fixture-empty' then 2 end$$;
 create table private.kinojo_ranking_snapshots_v390(snapshot_id bigint,status text);
 create table private.kinojo_ranking_snapshot_pointer_v390(snapshot_id bigint,published_at timestamptz,singleton boolean);
 insert into private.kinojo_ranking_snapshots_v390 values(1,'PUBLISHED');
 insert into private.kinojo_ranking_snapshot_pointer_v390 values(1,now(),true);
 create table private.kinojo_ranking_snapshot_scopes_v390(snapshot_id bigint,include_subs boolean,include_all_legions boolean,hof_payload jsonb);
 insert into private.kinojo_ranking_snapshot_scopes_v390 select 1,s,a,'{}'::jsonb from unnest(array[false,true]) s cross join unnest(array[false,true]) a;
 create table private.kinojo_ranking_snapshot_owner_metrics_v390(snapshot_id bigint,include_subs boolean,include_all_legions boolean,owner_name_key text,metric text,row_data jsonb,rank_no int,score numeric);
 `);
  await db.exec(read('supabase/migrations/20261030105542_hof_family_rankings_on_demand.sql'));
  const query=async(metric='power',page=1,all=false)=>(await db.query('select public.kinojo_web_get_hof_family_rankings_v541($1,$2,$3) result',[metric,page,all])).rows[0].result;
  const mine=async(token)=>(await db.query('select public.kinojo_web_get_my_hof_ranking_v329($1,false,false) result',[token])).rows[0].result;
  let result=await query();assert.equal(result.items[0].name,'Alpha');assert.equal(result.items[0].familyPower,900);assert.equal(result.total,3);
  result=await query('alts');assert.equal(result.items[0].name,'Beta');assert.equal(result.items[0].altCount,3);assert.equal(result.total,4);
  assert.equal((await query('power',1,true)).items[0].name,'External');
  assert.equal((await mine('fixture-alpha')).familyPve.rank,1);assert.equal((await mine('fixture-alpha')).familyPve.familyPower,900);
  assert.equal((await mine('fixture-empty')).familyPve.rank,null);
  await db.exec("insert into public.fixture_characters(character_id,character_name,is_main,ranking_owner_character_id,latest_pve_combat_power,server_id) values(901,'Alpha',true,901,9999,2003)");
  assert.deepEqual((await mine('fixture-alpha')).familyPve,{},'ambiguous account name must not select a different server owner');
  await db.exec('delete from public.fixture_characters where character_id=901');
  const denied=await mine('invalid');assert.equal(denied.authenticated,false);assert.equal(denied.familyPve,undefined);
  for(const metric of ['bad',null])assert.equal((await query(metric)).ok,false);
  for(const page of [0,-1,null,10001])assert.equal((await query('power',page)).ok,false);
  // Extra eligible mains exercise the 20-person network boundary and stable ties.
  await db.exec(`insert into public.fixture_characters(character_id,character_name,is_main,ranking_owner_character_id,latest_pve_combat_power) select x,'Page-'||lpad(x::text,4,'0'),true,x,900 from generate_series(1000,1040) x;`);
  const first=await query(),second=await query('power',2),third=await query('power',3);
  assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,4);
  assert.equal(second.items[0].rank,21);assert.equal(new Set([...first.items,...second.items,...third.items].map(x=>x.characterId)).size,44);
  assert.equal((await query('power',100)).items.length,0);
  // Invocation reads current source instead of retained/precomputed family rankings.
  await db.exec("update public.fixture_characters set latest_pve_combat_power=100000 where character_id=200");
  assert.equal((await query()).items[0].name,'Beta');
  assert.equal((await mine('fixture-alpha')).familyPve.rank,2);
  await db.exec('set role anon');assert.equal((await query()).ok,true);
  await assert.rejects(db.query('select * from private.kinojo_hof_family_rows_v541(false)'));
  await db.exec('reset role');
  await db.exec(read('supabase/rollbacks/20261030105542_hof_family_rankings_on_demand_rollback.sql'));
  assert.equal((await mine('fixture-alpha')).familyPve,undefined);
  console.log('PASS: on-demand family sums/counts, 20-row pagination, scope/ties/hidden/inactive/unknown values, account isolation, source updates, grants and rollback');
 }finally{await db.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
