begin;

-- Disable the likes API while preserving lifetime counts and daily vote guards.
revoke execute on function public.kinojo_home_bgm_likes_v1(uuid,text,boolean) from service_role;

commit;
