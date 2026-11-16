-- Roll back WEB first. Disable new calls without deleting uploaded music.
revoke execute on function public.kinojo_home_bgm_v1(text,text,jsonb) from service_role;
