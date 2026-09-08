CREATE OR REPLACE FUNCTION public.kinojo_character_growth_rollup_cleanup_v425(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_dry_run boolean := coalesce(p_dry_run, true);
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 2000));
  v_today_kst date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  v_day_end_cutoff date;
  v_week_end_cutoff date;
  v_eligible_day integer := 0;
  v_eligible_week integer := 0;
  v_deleted_day integer := 0;
  v_deleted_week integer := 0;
  v_remaining_day integer := 0;
  v_remaining_week integer := 0;
begin
  -- A period is eligible only after its end boundary is at least the retention age.
  -- At Wednesday 05:20 KST this preserves the immediately preceding Wed-Tue seven-day set.
  v_day_end_cutoff := v_today_kst - 7;
  v_week_end_cutoff := (v_today_kst - interval '1 year')::date;

  select
    count(*) filter (
      where r.granularity = 'DAY'
        and r.period_end_exclusive <= v_day_end_cutoff
    )::integer,
    count(*) filter (
      where r.granularity = 'WEEK'
        and r.period_end_exclusive <= v_week_end_cutoff
    )::integer
  into v_eligible_day, v_eligible_week
  from private.character_growth_rollups r
  where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
     or (r.granularity = 'WEEK' and r.period_end_exclusive <= v_week_end_cutoff);

  if v_dry_run is false then
    with due as materialized (
      select
        r.granularity,
        r.period_start,
        r.server_id,
        r.character_key,
        r.gear_type
      from private.character_growth_rollups r
      where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
         or (r.granularity = 'WEEK' and r.period_end_exclusive <= v_week_end_cutoff)
      order by r.period_end_exclusive asc, r.granularity asc,
        r.period_start asc, r.server_id asc, r.character_key asc, r.gear_type asc
      limit v_limit
      for update skip locked
    ),
    deleted as (
      delete from private.character_growth_rollups r
      using due d
      where r.granularity = d.granularity
        and r.period_start = d.period_start
        and r.server_id = d.server_id
        and r.character_key = d.character_key
        and r.gear_type = d.gear_type
      returning r.granularity
    )
    select
      count(*) filter (where granularity = 'DAY')::integer,
      count(*) filter (where granularity = 'WEEK')::integer
    into v_deleted_day, v_deleted_week
    from deleted;
  end if;

  select
    count(*) filter (
      where r.granularity = 'DAY'
        and r.period_end_exclusive <= v_day_end_cutoff
    )::integer,
    count(*) filter (
      where r.granularity = 'WEEK'
        and r.period_end_exclusive <= v_week_end_cutoff
    )::integer
  into v_remaining_day, v_remaining_week
  from private.character_growth_rollups r
  where (r.granularity = 'DAY' and r.period_end_exclusive <= v_day_end_cutoff)
     or (r.granularity = 'WEEK' and r.period_end_exclusive <= v_week_end_cutoff);

  return jsonb_build_object(
    'ok', true,
    'dryRun', v_dry_run,
    'scope', 'CHARACTER_GROWTH_ROLLUPS_ONLY',
    'todayKst', v_today_kst,
    'batchLimit', v_limit,
    'policies', jsonb_build_object(
      'DAY', jsonb_build_object(
        'retentionCompletedDays', 7,
        'deleteWhenPeriodEndOnOrBefore', v_day_end_cutoff,
        'currentInProgressDayProtected', true
      ),
      'WEEK', jsonb_build_object(
        'retention', '1_YEAR',
        'weekBoundary', 'WEDNESDAY_00:00_TO_NEXT_WEDNESDAY_00:00_ASIA_SEOUL',
        'deleteWhenPeriodEndOnOrBefore', v_week_end_cutoff
      ),
      'MONTH', jsonb_build_object(
        'retention', 'KEEP_FOREVER',
        'deleteCondition', null
      )
    ),
    'eligible', jsonb_build_object('DAY', v_eligible_day, 'WEEK', v_eligible_week, 'MONTH', 0),
    'deleted', jsonb_build_object('DAY', v_deleted_day, 'WEEK', v_deleted_week, 'MONTH', 0),
    'remainingDue', jsonb_build_object('DAY', v_remaining_day, 'WEEK', v_remaining_week, 'MONTH', 0),
    'rawSourceRowsDeleted', 0
  );
end;
$function$;
