'use strict';
const fs=require('node:fs');
module.exports=async function setup(db){
 await db.exec('create schema private;create role anon;create role authenticated;create role service_role;set check_function_bodies=off;');
 await db.exec(fs.readFileSync('tests/fixtures/sanctuary-permission-legacy-save.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/sanctuary-permission-legacy-layers.sql','utf8'));
 await db.exec(`
  alter table private.sanctuary_management_forces_v412 add primary key(force_id);
  alter table private.sanctuary_management_slots_v412 add primary key(slot_id);
  alter table private.sanctuary_management_support_batches_v412 add primary key(support_batch_id);
  alter table public.character_master add primary key(id);
  alter table private.sanctuary_management_slots_v412 add constraint sanctuary_management_slots_v450_assignment_kind_ck check(assignment_kind in('ACTUAL_CHARACTER','RANDOM_ALT'));
  alter table private.sanctuary_management_slots_v412 add constraint sanctuary_management_slots_v453_occupancy_ck check(true);
  create table public.server_master(server_id int primary key,server_name text,race_id int,is_active boolean default true);
  create table private.sanctuary_management_official_candidates_v432(candidate_id uuid primary key default gen_random_uuid(),actor_member_id bigint,team_id bigint,
   requested_character_name text,character_name text,server_id int,server_name text,race_id int,class_name text,legion_name text,char_key text,official_character_id text,
   profile_image_url text,detail_url text,official_payload jsonb,state text default 'VERIFIED',materialized_character_id bigint,
   expires_at timestamptz default now()+interval '10minutes',materialized_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
  create table private.sanctuary_management_audit_events_v412(actor_member_id bigint,team_id bigint,entity_type text,entity_id bigint,action text,before_payload jsonb,after_payload jsonb,request_key text);
  create table private.sanctuary_management_edit_leases_v412(team_id bigint);
  create table private.sanctuary_boss_roles_v536(team_id bigint,force_no int,character_id bigint,boss int,ordinal int,role_code text,unique(team_id,force_no,boss,role_code));
  create function public.kinojo_normalize_role(text,int)returns text language sql as 'select $1';
  create function public.kinojo_character_identity_key_v298(text)returns text language sql immutable as $$select lower(trim($1))$$;
  create function private.kinojo_sm_actor_v412(text)returns jsonb language sql as $$select jsonb_build_object('memberId',nullif(substring($1 from 9),'')::bigint,'role','MASTER','rawRole','MASTER')$$;
  create function private.kinojo_sm_assert_pilot_write_v439(text,text)returns void language sql as 'select';
  create function private.kinojo_sm_assert_write_enabled_v412()returns void language sql as 'select';
  create function private.kinojo_sm_assert_lease_v433(bigint,bigint,text)returns void language plpgsql as $$begin if $3 is distinct from 'fixture-lease' then raise exception 'lease expired';end if;end$$;
  create function private.kinojo_sm_can_manage_team_v412(jsonb,bigint)returns boolean language sql as 'select true';
  create function private.kinojo_sm_team_conflicts_v437(bigint,date,date)returns jsonb language sql as $$select '[]'::jsonb$$;
  create function private.kinojo_sm_conflicts_for_participant_v412(bigint,bigint,bigint)returns jsonb language sql as $$select '[]'::jsonb$$;
  create function private.kinojo_sm_rule_occurrences_v437(bigint,date,date)returns table(start_at timestamptz,end_at timestamptz)language sql as $$select null::timestamptz,null::timestamptz where false$$;
  create function private.kinojo_sm_difficulty_allowed_v464(bigint,text)returns boolean language sql as $$select $2 in('NORMAL','HARD')$$;
  create function private.kinojo_sm_min_item_level_v452(bigint,text)returns integer language sql as 'select 3000';
  create function private.kinojo_sm_team_min_item_level_v452(bigint)returns integer language sql as 'select 3000';
  create function private.kinojo_sm_force_min_item_level_v454(bigint)returns integer language sql as 'select 3000';
  create function private.kinojo_sm_character_eligible_v452(bigint,integer)returns boolean language sql as $$select coalesce((select latest_pve_item_level >= $2 from public.character_master where id=$1),false)$$;
  create function private.kinojo_sm_resolve_character_owner_v412(bigint)returns table(character_id bigint,owner_member_id bigint,root_character_id bigint,relation text)language sql as $$select c.id,case when c.id<=20 then c.id else null end,coalesce(c.main_character_id,c.id),case when coalesce(c.main_character_id,c.id)=c.id then 'MAIN' else 'ALT' end from public.character_master c where c.id=$1$$;
  create function private.kinojo_sm_class_code_v450(text)returns text language sql immutable as $$select case when $1 in('CLERIC','RANGER','TEMPLAR','GLADIATOR','ASSASSIN','SORCERER','ELEMENTALIST','CHANTER','FIGHTER') then $1 end$$;
  create function private.kinojo_sm_class_label_v450(text)returns text language sql immutable as 'select $1';
  create function private.kinojo_sm_assert_actual_character_v432(bigint)returns void language sql as 'select';
  create function private.kinojo_sm_recompute_status_v412(bigint)returns void language sql as 'select';
  create function private.kinojo_sm_recompute_status_v450(bigint)returns void language sql as 'select';
  create function private.kinojo_sm_boss_roles_v536(bigint,int,bigint)returns jsonb language sql as $$select '{"boss1":null,"boss2":[]}'::jsonb$$;
 `);
 // Auth, upstream eligibility provenance and calendar are explicit synthetic boundaries.
 // Command/composer, ownership trigger, role validation, permission postconditions and new module are actual bodies.
 await db.exec(fs.readFileSync('supabase/migrations/20260909111151_sanctuary_permission_foundation.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260909113427_sanctuary_permission_command_contract.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/sanctuary-balanced-command-chain.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/sanctuary-balanced-before.sql','utf8'));
 await db.exec(`create function private.kinojo_sm_seed_force_v412(bigint,integer)returns bigint language plpgsql as $$declare f bigint;p bigint;n int;begin
  insert into private.sanctuary_management_forces_v412(team_id,force_no)values($1,$2)returning force_id into f;
  for n in 1..2 loop insert into private.sanctuary_management_parties_v412(team_id,force_id,party_no)values($1,f,n)returning party_id into p;
   insert into private.sanctuary_management_slots_v412(team_id,force_id,party_id,slot_no)select $1,f,p,x from generate_series(1,5)x;end loop;return f;end$$;
  insert into public.server_master values(2002,'fixture',2,true);
  insert into public.member_codes(id,is_active,role,level)values(1,true,'MEMBER',1),(2,true,'MEMBER',1),(3,true,'MANAGER',3),(5,true,'MASTER',5);
  insert into public.sanctuary_master(id,code,name,management_visible)values(1,'fixture','fixture',true);
  insert into public.character_master(id,server_id,server_name,character_name,class_name,is_main,is_active,identity_status,latest_pve_item_level,latest_pve_combat_power)
   select x,2002,'fixture','character'||x,'CLERIC',x<=10,true,'CURRENT',4000,1200000-x*1000 from generate_series(1,50)x;
  update public.character_master set main_character_id=(id-1)%10+1 where id>10;
  create view private.sanctuary_character_owners_v412 as select id character_id,coalesce(main_character_id,id) root_character_id,
   case when coalesce(main_character_id,id)=id then 'MAIN' else 'ALT' end relation from public.character_master;
  create table private.sanctuary_operational_legions_v432(legion_name text,is_active boolean);
  select setval(pg_get_serial_sequence('public.character_master','id'),1000);
  insert into private.sanctuary_management_teams_v412(team_id,creator_member_id,sanctuary_id,title,activity,team_mode,status)
   values(900,1,1,'existing arrangement','raid','FIXED','ACTIVE');
  select private.kinojo_sm_seed_force_v412(900,1::smallint);
  update private.sanctuary_management_slots_v412 set character_id=5,owner_member_id=5,owner_root_character_id=5,
   character_relation='MAIN',placement_locked=true where slot_id=(select min(slot_id) from private.sanctuary_management_slots_v412 where team_id=900);
 `);
 await db.exec('begin;'+fs.readFileSync('supabase/migrations/20261106011916_sanctuary_balanced_teams.sql','utf8')+'commit;');
 await db.exec("create trigger fixture_team_touch before update on private.sanctuary_management_teams_v412 for each row execute function private.kinojo_sm_touch_v412('revision');");
 await db.exec(`
  create constraint trigger fixture_family_guard after insert or update of force_id,character_id,owner_root_character_id,assignment_kind on private.sanctuary_management_slots_v412 deferrable initially deferred for each row execute function private.kinojo_sm_same_force_character_family_guard_v461();
  create constraint trigger fixture_assignment_guard after insert or update of character_id,owner_member_id,owner_root_character_id,character_relation,required_class_code,assignment_kind on private.sanctuary_management_slots_v412 deferrable initially deferred for each row execute function private.kinojo_sm_slot_assignment_guard_v450();
  create trigger fixture_relation before insert or update of character_id,character_relation,assignment_kind on private.sanctuary_management_slots_v412 for each row execute function private.kinojo_sm_normalize_slot_character_relation_v463();
  create trigger fixture_slot_touch before update on private.sanctuary_management_slots_v412 for each row execute function private.kinojo_sm_touch_v412('revision');
 `);
 return{async seedTeam(id=100,forceCount=2){await db.query("insert into private.sanctuary_management_teams_v412(team_id,creator_member_id,sanctuary_id,title,activity,team_mode,join_policy,status,published_at)values($1,1,1,'fixture','raid','PARTICIPATION','INSTANT','ACTIVE',now())",[id]);for(let f=1;f<=forceCount;f++)await db.query('select private.kinojo_sm_seed_force_v412($1,$2::smallint)',[id,f]);await db.query("insert into private.sanctuary_management_schedule_rules_v412(team_id,schedule_kind,starts_on,weekdays,starts_at)values($1,'WEEKLY','2026-11-04',array[3]::smallint[],'21:00')",[id]);return id;},
  async model(id=100){return(await db.query('select private.kinojo_sm_read_composition_v554($1) model',[id])).rows[0].model;},
  async call(payload,revision=1,key='fixture-composition-001',member=1,action='SAVE_COMPOSITION'){return(await db.query('select public.kinojo_sanctuary_management_command_v2($1,$2,$3,$4,$5) result',['fixture-'+member,key,action,JSON.stringify(payload),revision])).rows[0].result;}
 };
};
