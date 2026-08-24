-- DB399: register the two published legacy lookbooks as first-class side events.
--
-- This migration deliberately preserves campaign/item status, order, exposure,
-- scheduling, transitions, timestamps and assets. Only the event link fields are
-- populated, so the public banner manifest remains unchanged.

do $migration$
declare
  v_spec record;
  v_group_id uuid;
  v_group_count integer;
  v_campaign_count integer;
  v_bad_count integer;
  v_created_by bigint;
  v_updated_by bigint;
begin
  -- Prevent a concurrent event publish or legacy campaign edit from creating a
  -- partial/ambiguous attachment while the semantic guards below are evaluated.
  lock table private.kinojo_banner_event_groups_v391 in share row exclusive mode;
  lock table public.kinojo_banner_campaigns in share row exclusive mode;
  lock table public.kinojo_banner_campaign_items in share mode;

  for v_spec in
    select *
    from (values
      ('푸석사과 룩북'::text, array['룩북','푸석사과']::text[], 3),
      ('꾸힉 룩북'::text, array['룩북','꾸힉']::text[], 4)
    ) as spec(event_name,tags,expected_items_per_campaign)
  loop
    select count(*)::integer,
           min(created_by_member_id),
           max(updated_by_member_id)
      into v_campaign_count,v_created_by,v_updated_by
    from public.kinojo_banner_campaigns
    where campaign_name=v_spec.event_name;

    if v_campaign_count<>6 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_CAMPAIGN_COUNT_MISMATCH',
        detail=format('%s expected 6 campaigns, found %s',v_spec.event_name,v_campaign_count);
    end if;

    select count(*)::integer into v_bad_count
    from public.kinojo_banner_campaigns c
    where c.campaign_name=v_spec.event_name
      and not (
        c.campaign_type='SIDE'
        and c.status='PUBLISHED'
        and c.schedule_mode='ALWAYS'
        and c.page_code=any(array[
          'HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
        ]::text[])
        and case
          when c.page_code='HOF' then c.slot_codes=array['LEFT']::text[]
          else c.slot_codes=array['LEFT','RIGHT']::text[]
        end
      );
    if v_bad_count<>0 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_CAMPAIGN_SHAPE_MISMATCH',
        detail=v_spec.event_name;
    end if;

    select count(*)::integer into v_bad_count
    from (
      select c.campaign_id,
             count(i.item_id)::integer as item_count,
             count(i.item_id) filter (where i.is_enabled)::integer as enabled_item_count
      from public.kinojo_banner_campaigns c
      left join public.kinojo_banner_campaign_items i on i.campaign_id=c.campaign_id
      where c.campaign_name=v_spec.event_name
      group by c.campaign_id
    ) item_counts
    where item_count<>v_spec.expected_items_per_campaign
       or enabled_item_count<>v_spec.expected_items_per_campaign;
    if v_bad_count<>0 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_ITEM_COUNT_MISMATCH',
        detail=v_spec.event_name;
    end if;

    select count(*)::integer,(array_agg(event_group_id))[1]
      into v_group_count,v_group_id
    from private.kinojo_banner_event_groups_v391
    where event_name=v_spec.event_name;

    if v_group_count>1 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_EVENT_AMBIGUOUS',
        detail=v_spec.event_name;
    end if;

    if v_group_count=1 then
      select count(*)::integer into v_bad_count
      from private.kinojo_banner_event_groups_v391
      where event_group_id=v_group_id
        and not (
          event_type='SIDE'
          and side_mode='SYNC'
          and tags=v_spec.tags
        );
      if v_bad_count<>0 then
        raise exception using
          errcode='P0001',
          message='BANNER_LEGACY_LOOKBOOK_EVENT_SHAPE_MISMATCH',
          detail=v_spec.event_name;
      end if;
    else
      v_group_id:=null;
    end if;

    select count(*)::integer into v_bad_count
    from public.kinojo_banner_campaigns c
    where c.campaign_name=v_spec.event_name
      and not (
        (c.event_group_id is null and c.event_role is null)
        or (c.event_group_id=v_group_id and c.event_role='SHARED')
      );
    if v_bad_count<>0 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_ALREADY_LINKED_ELSEWHERE',
        detail=v_spec.event_name;
    end if;

    if v_group_id is null then
      insert into private.kinojo_banner_event_groups_v391(
        event_name,event_type,side_mode,tags,
        created_by_member_id,updated_by_member_id
      ) values (
        v_spec.event_name,'SIDE','SYNC',v_spec.tags,
        v_created_by,v_updated_by
      )
      returning event_group_id into v_group_id;
    end if;

    update public.kinojo_banner_campaigns
       set event_group_id=v_group_id,
           event_role='SHARED'
     where campaign_name=v_spec.event_name
       and event_group_id is null
       and event_role is null;

    select count(*)::integer into v_bad_count
    from public.kinojo_banner_campaigns c
    where c.campaign_name=v_spec.event_name
      and not (c.event_group_id=v_group_id and c.event_role='SHARED');
    if v_bad_count<>0 then
      raise exception using
        errcode='P0001',
        message='BANNER_LEGACY_LOOKBOOK_ATTACH_INCOMPLETE',
        detail=v_spec.event_name;
    end if;
  end loop;
end
$migration$;
