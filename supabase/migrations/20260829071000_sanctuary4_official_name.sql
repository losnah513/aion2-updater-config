-- 성역 4의 공식 명칭 공개에 따른 기준 데이터 갱신.
-- 구 성역 화면은 최종 사용자 검수가 끝날 때까지 유지하므로 enabled 상태는 변경하지 않는다.
do $$
begin
  if not exists (
    select 1
      from public.sanctuary_master
     where id = 4
       and code = 'sanctuary4'
  ) then
    raise exception 'sanctuary4 master row is missing';
  end if;
end
$$;

update public.sanctuary_master
   set name = '비탄의 설원',
       short_name = '비탄의 설원',
       metadata = jsonb_set(
         jsonb_set(coalesce(metadata, '{}'::jsonb), '{placeholder}', 'false'::jsonb, true),
         '{officialNamePublished}',
         'true'::jsonb,
         true
       ),
       updated_at = now()
 where id = 4
   and code = 'sanctuary4';
