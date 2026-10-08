-- SQL534: read-only server routine timetable; no cron or permission changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';

CREATE OR REPLACE FUNCTION private.kinojo_cron_preview_v533(p_schedule text, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f text[]:=regexp_split_to_array(trim(p_schedule),'\s+');
  mins integer[]; hours integer[]; weekdays integer[];
  label text; next_at timestamptz;
  v_entries jsonb:='[]'::jsonb;
  v_today date:=timezone('Asia/Seoul',p_now)::date;
begin
  if array_length(f,1)<>5 or f[3]<>'*' or f[4]<>'*'
     or not (f[1] ~ '^(\*|\*/[1-9][0-9]*|[0-9]+(,[0-9]+)*)$')
     or not (f[2] ~ '^(\*|[0-9]+(,[0-9]+)*)$')
     or not (f[5] ~ '^(\*|[0-6](,[0-6])*)$') then
    return jsonb_build_object('label','사용자 지정 일정 · 서버 설정 확인 필요','nextRunAt',null,'frequency','CUSTOM','entries','[]'::jsonb);
  end if;
  select array_agg(n) into mins from generate_series(0,59) n
    where f[1]='*'
       or (f[1] like '*/%' and n % greatest(1,case when f[1] like '*/%' then substr(f[1],3)::integer else 1 end)=0)
       or n::text=any(string_to_array(f[1],','));
  select array_agg(n) into hours from generate_series(0,23) n where f[2]='*' or n::text=any(string_to_array(f[2],','));
  select array_agg(n) into weekdays from generate_series(0,6) n where f[5]='*' or n::text=any(string_to_array(f[5],','));
  if mins is null or hours is null or weekdays is null then
    return jsonb_build_object('label','일정 확인 필요','nextRunAt',null,'frequency','CUSTOM','entries','[]'::jsonb);
  end if;
  select min(t) into next_at
    from generate_series(date_trunc('minute',p_now)+interval '1 minute',p_now+interval '8 days',interval '1 minute') t
   where extract(minute from timezone('UTC',t))::int=any(mins)
     and extract(hour from timezone('UTC',t))::int=any(hours)
     and extract(dow from timezone('UTC',t))::int=any(weekdays);
  if f[2]='*' and f[5]='*' then
    label:=case when f[1]='*' then '매분'
      when f[1] like '*/%' then substr(f[1],3)||'분마다'
      else '매시간 '||(select string_agg(lpad(m::text,2,'0'),'·' order by m) from unnest(mins) m)||'분' end;
  else
    select string_agg(display,' · ' order by sort_key) into label from (
      select distinct
        case when f[5]='*' then '매일 ' else
          (array['일','월','화','수','목','금','토'])[((d+(h+9)/24)%7)+1]||'요일 ' end
        ||lpad(((h+9)%24)::text,2,'0')||':'||lpad(m::text,2,'0') display,
        case when f[5]='*' then 0 else (d+(h+9)/24)%7 end*1440+((h+9)%24)*60+m sort_key
      from unnest(mins) m cross join unnest(hours) h cross join unnest(weekdays) d
    ) x;
  end if;
  
  if not (f[2]='*' and f[5]='*') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'timeKst',lpad((s.minute_of_day/60)::text,2,'0')||':'||lpad((s.minute_of_day%60)::text,2,'0'),
      'minuteOfDay',s.minute_of_day,
      'weekdayKst',s.weekday,
      'weekdayLabel',case when s.weekday is not null then (array['일','월','화','수','목','금','토'])[s.weekday+1]||'요일' else null end,
      'nextRunAt',(
        select min(timezone('Asia/Seoul',(v_today+g)::timestamp+s.minute_of_day*interval '1 minute'))
        from generate_series(0,7) g
        where (s.weekday is null or extract(dow from v_today+g)::int=s.weekday)
          and timezone('Asia/Seoul',(v_today+g)::timestamp+s.minute_of_day*interval '1 minute')>p_now
      )
    ) order by s.minute_of_day,s.weekday),'[]'::jsonb) into v_entries
    from (
      select distinct ((h+9)%24)*60+m minute_of_day,
        case when f[5]='*' then null else (d+(h+9)/24)%7 end weekday
      from unnest(mins) m cross join unnest(hours) h cross join unnest(weekdays) d
    ) s;
  end if;

  return jsonb_build_object('label',label,'nextRunAt',next_at,
    'frequency',case when f[2]='*' and f[5]='*' then 'REPEAT' when f[5]='*' then 'DAILY' else 'WEEKLY' end,
    'entries',v_entries);
end;
$function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_server_routines_v533(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'cron'
 SET statement_timeout TO '5s'
AS $function$
declare v_actor jsonb; v_now timestamptz:=clock_timestamp(); v_rows jsonb;
begin
  v_actor:=public.kinojo_web_admin_actor_v323(p_session_token);
  if coalesce((v_actor->>'level')::integer,0)<3 then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED','message','관리자 권한이 필요합니다.');
  end if;
  -- Bound the read by the most recent 20,000 scheduler records; never select return_message/command.
  with recent as materialized (
    select r.jobid,r.runid,r.status,r.start_time,r.end_time
      from cron.job_run_details r order by r.runid desc limit 20000
  ), latest as (
    select distinct on(r.jobid) r.* from recent r order by r.jobid,r.runid desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.jobid,
    'name',case j.jobname
      when 'kinojo-character-refresh-6h-v377' then '캐릭터 공식 조회'
      when 'kinojo-sanctuary-sheet-sync-12h-v377' then '성역 시트 동기화'
      when 'kinojo-member-image-cleanup-v364' then '회원 이미지 정리'
      when 'kinojo-ranking-snapshot-cleanup-v401' then '이전 순위 스냅샷 정리'
      when 'kinojo-updater-run-report-cleanup-v421' then '조회 실행 보고서 정리'
      when 'kinojo-character-growth-rollup-cleanup-v425' then '성장 요약 기록 정리'
      when 'kinojo-character-growth-raw-cleanup-v443' then '성장 원본 기록 정리'
      when 'kinojo-deferred-ranking-hof' then '순위·명예의 전당 공개 대기 확인'
      when 'kinojo-snapshot-raw-retention-v501' then '조회 원본 보관 정리'
      when 'kinojo-completed-runtime-retention-v511' then '완료된 실행 기록 정리'
      when 'kinojo-superseded-snapshot-retention-v512' then '대체된 조회 원본 정리'
      when 'kinojo-snapshot-seven-day-summary-v514' then '7일 지난 조회 원본 요약'
      when 'kinojo-payload-post-detail-cleanup-v515' then '상세 저장 후 수집 자료 정리'
      when 'kinojo-intake-post-detail-cleanup-v516' then '상세 저장 후 수집 접수 기록 정리'
      when 'kinojo-cron-run-history-retention-v520' then '서버 예약 실행 기록 정리'
      else '기타 서버 작업 #'||j.jobid::text end,
    'description',case when j.jobname='kinojo-character-refresh-6h-v377'
      then '본캐 10:00·22:00 / 부캐 15:00' when j.jobname='kinojo-deferred-ranking-hof'
      then '공개 조건을 확인하며, 매번 순위를 새로 만드는 작업은 아닙니다.' else null end,
    'active',j.active,'scheduleKst',p.preview->>'label',
    'frequency',p.preview->>'frequency',
    'scheduleEntries',(
      select coalesce(jsonb_agg(e||jsonb_build_object('description',
        case when j.jobname='kinojo-character-refresh-6h-v377'
          then case when e->>'timeKst'='15:00' then '부캐 공식 조회' else '본캐 공식 조회' end else null end
      ) order by (e->>'minuteOfDay')::int),'[]'::jsonb)
      from jsonb_array_elements(coalesce(p.preview->'entries','[]'::jsonb)) e
    ),
    'nextRunAt',case when j.active then p.preview->'nextRunAt' else 'null'::jsonb end,
    'lastStatus',l.status,'lastStartedAt',l.start_time,'lastFinishedAt',l.end_time
  ) order by case when j.jobname='kinojo-character-refresh-6h-v377' then 0 else 1 end,j.jobid),'[]'::jsonb)
    into v_rows from cron.job j
    left join latest l on l.jobid=j.jobid
    cross join lateral (select private.kinojo_cron_preview_v533(j.schedule,v_now) preview) p
   where j.jobname like 'kinojo-%';
  return jsonb_build_object('ok',true,'timezone','Asia/Seoul','generatedAt',v_now,
    'characterScheduleSummary','본캐 10:00·22:00 / 부캐 15:00 (매일, 한국 시간)',
    'historyNote','최근 실행은 각 작업 전체의 최신 예약 호출 결과입니다. 캐릭터별 조회 결과는 캐릭터 관리에서 확인하세요.',
    'routines',v_rows);
end;
$function$;

commit;
