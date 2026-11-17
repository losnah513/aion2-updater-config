begin;

revoke execute on function public.kinojo_home_bgm_covers_v1(text,uuid,uuid,text,text) from service_role;

commit;
