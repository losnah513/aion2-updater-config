-- Restore the prior Edge first; do not run while a fenced collector is active.
begin;
drop function if exists public.kinojo_character_detail_write_v1(uuid,text,text,jsonb);
commit;
