-- 구 성역 화면 폐기 후 정식 성역 메뉴도 Server 기준 성역 1~4를 노출한다.
-- enabled는 공통 메뉴/기존 master API의 노출 플래그이며, 실제 일정 생성 제한은
-- management_visible 및 available_from(2026-09-09) 검증을 계속 사용한다.
do $$
declare
  v_row public.sanctuary_master%rowtype;
begin
  select *
    into v_row
    from public.sanctuary_master
   where id = 4
     and code = 'sanctuary4';

  if not found then
    raise exception 'sanctuary4 master row is missing';
  end if;

  if v_row.name is distinct from '비탄의 설원'
     or v_row.management_visible is distinct from true
     or v_row.available_from is distinct from date '2026-09-09' then
    raise exception 'sanctuary4 canonical metadata is not ready';
  end if;

  update public.sanctuary_master
     set enabled = true,
         updated_at = now()
   where id = 4
     and code = 'sanctuary4';

  if not exists (
    select 1
      from public.sanctuary_master
     where id = 4
       and code = 'sanctuary4'
       and enabled
       and management_visible
       and available_from = date '2026-09-09'
  ) then
    raise exception 'sanctuary4 canonical navigation enable verification failed';
  end if;
end
$$;
