begin;
set local lock_timeout = '2s';

alter table private.kinojo_home_bgm
  drop constraint kinojo_home_bgm_bytes_check,
  add constraint kinojo_home_bgm_bytes_check check (bytes between 1 and 10485760);

update storage.buckets
  set file_size_limit = 10485760
  where id = 'kinojo-home-bgm';

commit;
