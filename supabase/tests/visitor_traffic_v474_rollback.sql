-- Restore pre-474 routines and audience aggregates; never delete raw events.
begin;
set lock_timeout='5s';set statement_timeout='60s';
drop trigger if exists kinojo_classify_visit_event_v474 on public.kinojo_page_view_events;
CREATE OR REPLACE FUNCTION public.kinojo_refresh_visit_daily_266(p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  with vm as (
    select visitor_key,max(member_id) filter(where member_id is not null) member_id
    from public.kinojo_page_view_events where visit_date_kst=p_date and nullif(visitor_key,'') is not null group by visitor_key
  ), e as (
    select x.*,coalesce(x.member_id,vm.member_id) effective_member,
      case when coalesce(x.member_id,vm.member_id) is not null then 'm:'||coalesce(x.member_id,vm.member_id)::text
           when nullif(x.visitor_key,'') is not null then 'v:'||x.visitor_key else 'e:'||x.event_id end identity_key
    from public.kinojo_page_view_events x left join vm on vm.visitor_key=x.visitor_key where x.visit_date_kst=p_date
  )
  insert into public.kinojo_visit_daily_266
  select p_date,count(distinct identity_key),count(distinct identity_key) filter(where effective_member is null),
    count(distinct effective_member),count(*) filter(where event_type='PAGE_VIEW'),min(created_at),max(created_at),now() from e
  on conflict(visit_date) do update set unique_visitors=excluded.unique_visitors,anonymous_visitors=excluded.anonymous_visitors,
    logged_in_visitors=excluded.logged_in_visitors,page_views=excluded.page_views,first_visit_at=excluded.first_visit_at,last_visit_at=excluded.last_visit_at,updated_at=now();

  delete from public.kinojo_visit_page_daily_266 where visit_date=p_date;
  with vm as (
    select visitor_key,max(member_id) filter(where member_id is not null) member_id
    from public.kinojo_page_view_events where visit_date_kst=p_date and nullif(visitor_key,'') is not null group by visitor_key
  ), e as (
    select x.*,case when coalesce(x.member_id,vm.member_id) is not null then 'm:'||coalesce(x.member_id,vm.member_id)::text
      when nullif(x.visitor_key,'') is not null then 'v:'||x.visitor_key else 'e:'||x.event_id end identity_key
    from public.kinojo_page_view_events x left join vm on vm.visitor_key=x.visitor_key
    where x.visit_date_kst=p_date and x.event_type='PAGE_VIEW'
  )
  insert into public.kinojo_visit_page_daily_266
  select p_date,page_key,count(distinct identity_key),count(*),min(created_at),max(created_at),now() from e group by page_key;
end $function$;

CREATE OR REPLACE FUNCTION public.kinojo_admin_visitor_history_266(p_pass_key text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_member_search text DEFAULT NULL::text, p_login_filter text DEFAULT 'ALL'::text, p_page_key text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a jsonb; lv int; f date:=coalesce(p_date_from,(now() at time zone 'Asia/Seoul')::date-6); t date:=coalesce(p_date_to,(now() at time zone 'Asia/Seoul')::date); pg int:=greatest(1,coalesce(p_page,1)); ps int:=least(50,greatest(10,coalesce(p_page_size,20))); rows jsonb; total int;
begin
 a:=public.kinojo_admin_account_from_pass_key(p_pass_key); lv:=coalesce((a->>'level')::int,0); if lv<4 then raise exception '회원별 로그인 이력은 Sub Master 이상만 확인할 수 있습니다.' using errcode='42501'; end if;
 with vm as (select visit_date_kst,visitor_key,max(member_id) filter(where member_id is not null) member_id from public.kinojo_page_view_events where visit_date_kst between f and t group by 1,2), g as (
   select e.visit_date_kst,coalesce(e.member_id,vm.member_id) member_id,max(coalesce(e.member_name,m.main_character_name)) member_name,max(coalesce(e.member_role,public.kinojo_normalize_role(m.role,m.level))) member_role,
    min(e.created_at) first_visit_at,max(e.created_at) last_visit_at,min(e.created_at) filter(where e.event_type='LOGIN') login_at,count(*) filter(where e.event_type='PAGE_VIEW') page_views,
    array_agg(distinct e.page_key order by e.page_key) pages
   from public.kinojo_page_view_events e left join vm on vm.visit_date_kst=e.visit_date_kst and vm.visitor_key=e.visitor_key left join public.member_codes m on m.id=coalesce(e.member_id,vm.member_id)
   where e.visit_date_kst between f and t and (nullif(p_page_key,'') is null or e.page_key=p_page_key)
   group by e.visit_date_kst,coalesce(e.member_id,vm.member_id),case when coalesce(e.member_id,vm.member_id) is null then e.visitor_key else null end
 ), q as (select *,count(*) over() total_count from g where (nullif(trim(p_member_search),'') is null or coalesce(member_name,'익명 방문자') ilike '%'||trim(p_member_search)||'%') and
   (upper(coalesce(p_login_filter,'ALL'))='ALL' or (upper(p_login_filter)='LOGIN' and member_id is not null) or (upper(p_login_filter)='ANONYMOUS' and member_id is null))
   order by visit_date_kst desc,last_visit_at desc offset (pg-1)*ps limit ps)
 select coalesce(jsonb_agg(jsonb_build_object('date',visit_date_kst,'memberId',member_id,'memberName',coalesce(member_name,'익명 방문자'),'memberRole',member_role,'isLoggedIn',member_id is not null,'loginAt',login_at,'firstVisitAt',first_visit_at,'lastVisitAt',last_visit_at,'pageViews',page_views,'pages',pages) order by visit_date_kst desc,last_visit_at desc),'[]'),coalesce(max(total_count),0) into rows,total from q;
 return jsonb_build_object('ok',true,'rows',rows,'total',total,'page',pg,'pageSize',ps,'totalPages',greatest(1,ceil(total::numeric/ps)::int));
end $function$;

do $r$ declare d date; begin for d in select distinct visit_date_kst from public.kinojo_page_view_events where traffic_class<>'PUBLIC' loop perform public.kinojo_refresh_visit_daily_266(d);end loop;end $r$;
drop function public.kinojo_classify_visit_event_v474();
drop function public.kinojo_visit_traffic_class_v474(bigint,text,text);
alter table public.kinojo_page_view_events drop column traffic_class;
alter table public.member_codes drop column is_automation_account;
commit;

