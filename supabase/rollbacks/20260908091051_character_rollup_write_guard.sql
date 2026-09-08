begin;
set local lock_timeout='2s';
drop trigger if exists trg_character_history_rollup_guard on public.character_history;
drop function if exists private.kinojo_history_rollup_guard();
commit;
