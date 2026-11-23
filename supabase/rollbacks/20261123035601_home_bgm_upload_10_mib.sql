begin;
set local lock_timeout = '2s';

-- Validation stops the rollback if larger originals have already been saved.
alter table private.kinojo_home_bgm
  drop constraint kinojo_home_bgm_bytes_check,
  add constraint kinojo_home_bgm_bytes_check check (bytes between 1 and 6291456);

update storage.buckets
  set file_size_limit = 6291456
  where id = 'kinojo-home-bgm';

commit;
