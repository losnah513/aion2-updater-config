-- Synthetic transaction fixtures only. No login session is created and no production family is edited.
begin;
set local statement_timeout='15s';
set local lock_timeout='1s';
do $$
declare a bigint:=900000000477001; b bigint:=900000000477002; c bigint:=900000000477003;
 actor bigint; expected jsonb; response jsonb; revision text;
begin
 -- Audit FK actor only: never impersonates/creates a WEB_COMMON session.
 select min(id) into actor from public.member_codes;
 insert into public.character_master(id,server_id,server_name,character_name,is_main,main_character_id,main_character_name,legion_name)
 values(a,2002,'지켈','ROSTER_FIXTURE_A_477',true,a,'ROSTER_FIXTURE_A_477','깡'),
 (b,2002,'지켈','ROSTER_FIXTURE_B_477',true,b,'ROSTER_FIXTURE_B_477','깡'),
 (c,2002,'지켈','ROSTER_FIXTURE_C_477',false,b,'ROSTER_FIXTURE_B_477','낮');
 expected:=jsonb_build_array(private.kinojo_roster_family_state_v477(a)-'items',private.kinojo_roster_family_state_v477(b)-'items');
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-missing-477',a,array[b],expected);
 if response->>'code'<>'FAMILY_INCOMPLETE' then raise exception 'missing family guard: %',response;end if;
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-duplicate-477',a,array[a,b,c],expected);
 if response->>'code'<>'FAMILY_DUPLICATE' then raise exception 'duplicate guard';end if;
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-save-477',a,array[b,c],expected);
 if response->>'ok'<>'true' then raise exception 'save: %',response;end if;
 if (select count(*) from public.character_master where id=any(array[a,b,c]) and main_character_id=a)<>3 then raise exception 'family not merged';end if;
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-save-477',a,array[b,c],expected);
 if response->>'replayed'<>'true' then raise exception 'idempotent replay';end if;
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-conflict-477',a,array[b,c],expected);
 if response->>'code'<>'FAMILY_CONFLICT' then raise exception 'stale guard';end if;
 update public.character_master set is_main=true,main_character_id=b,main_character_name='ROSTER_FIXTURE_B_477' where id=b;
 if (select is_main or main_character_id<>a from public.character_master where id=b) then raise exception 'worker override lost';end if;
 update public.character_master set is_active=false where id=c;
 expected:=jsonb_build_array(private.kinojo_roster_family_state_v477(a)-'items');
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-inactive-477',c,array[a,b],expected);
 if response->>'code'<>'FAMILY_UNAVAILABLE' then raise exception 'inactive guard';end if;
 update public.character_master set is_active=true where id=c;
 expected:=jsonb_build_array(private.kinojo_roster_family_state_v477(a)-'items');
 response:=private.kinojo_roster_family_save_v477(actor,'fixture-swap-477',c,array[a,b],expected);
 if response->>'ok'<>'true' or (select not is_main from public.character_master where id=c) then raise exception 'swap failed: %',response;end if;
 if (select legion_name from public.character_master where id=c)<>'낮' then raise exception 'legion altered';end if;
 response:=public.kinojo_roster_family_read_v477('', 'ROSTER_FIXTURE',null);
 if response->>'ok'='true' then raise exception 'anonymous read';end if;
 if has_function_privilege('anon','public.kinojo_roster_family_save_v477(text,text,bigint,bigint[],jsonb)','EXECUTE') then raise exception 'public write grant';end if;
end $$;
rollback;
