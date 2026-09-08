-- Emergency feature disable only; restore the previous Web/Edge release first.
-- Preserve registered characters, canonical family links, List rows and audit
-- events. This does not reverse user data or the composer metrics correction.
begin;
revoke execute on function public.kinojo_sanctuary_management_official_materialize_v480(text,bigint,uuid,text,bigint,uuid,boolean,text) from service_role;
revoke execute on function public.kinojo_sanctuary_management_list_retry_v480(text,uuid) from service_role;
notify pgrst,'reload schema';
commit;
