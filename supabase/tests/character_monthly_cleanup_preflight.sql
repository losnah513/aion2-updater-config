-- Read-only planning report, NOT a deletion authorization or scheduled writer.
-- Run as the maintenance operator in a READ ONLY transaction. No row payloads,
-- session tokens, names, profile data or external requests are emitted.
begin read only;
set local statement_timeout='10s';
set local lock_timeout='1s';
with context as (select statement_timestamp() as at),
foreign_keys as (
 select ns.nspname as schema_name, t.relname as table_name, k.conname,
  array(select a.attname from unnest(k.conkey) with ordinality x(attnum,n)
    join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.attnum order by x.n) as columns,
  case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET_NULL'
    when 'r' then 'RESTRICT' when 'd' then 'SET_DEFAULT' else 'NO_ACTION' end as delete_action,
  case
   when t.relname in ('character_identity_change_history','character_identity_recovery_attempts',
     'member_image_request_admin_events','sanctuary_character_registration_events_v480',
     'lookup_session_admin_exclusions') then 'PRESERVE_AUDIT_REFERENCE'
   when t.relname in ('character_activity_checks','character_activity_lifecycle') then 'DETACH_LIFECYCLE_AFTER_RECEIPT'
   when t.relname in ('character_equipment_detail_latest','character_daevanion_detail_latest',
     'character_skill_current_state','character_stat_sources') then 'CURRENT_DATA_REQUIRES_EXPLICIT_DELETE'
   else 'HOLD_REFERENCE_REVIEW' end as required_handling
 from pg_constraint k join pg_class t on t.oid=k.conrelid
 join pg_namespace ns on ns.oid=t.relnamespace
 where k.contype='f' and k.confrelid='public.character_master'::regclass
), logical_columns as (
 select ns.nspname as schema_name,t.relname as table_name,a.attname as column_name,
  format_type(a.atttypid,a.atttypmod) as column_type
 from pg_attribute a join pg_class t on t.oid=a.attrelid
 join pg_namespace ns on ns.oid=t.relnamespace
 where ns.nspname in ('public','private') and t.relkind in ('r','p')
  and a.attnum>0 and not a.attisdropped
  and (a.attname ~ '(character|owner_root|root_character).*id' or a.attname='main_character_id')
  and not exists(select 1 from pg_constraint k where k.contype='f'
    and k.conrelid=t.oid and a.attnum=any(k.conkey)
    and k.confrelid='public.character_master'::regclass)
), structured_columns as (
 -- Metadata only. JSON/array content is not scanned or interpreted as identity.
 select ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
 from pg_attribute a join pg_class t on t.oid=a.attrelid
 join pg_namespace ns on ns.oid=t.relnamespace
 where ns.nspname in ('public','private') and t.relkind in ('r','p')
  and a.attnum>0 and not a.attisdropped
  and a.atttypid in ('json'::regtype,'jsonb'::regtype,'bigint[]'::regtype,'integer[]'::regtype)
  and t.relname ~ '(character|sanctuary|ranking|hall_of_fame|master_sync|list_sheet|banner)'
), assessed as materialized (
 select c.id,l.state,l.episode,l.cleanup_candidate_at,
  case
   when l.character_id is null then 'NO_CONFIRMED_EXCLUSION_DATE'
   when l.state<>'EXCLUDED' then 'NOT_EXCLUDED'
   when l.excluded_at is null or l.cleanup_candidate_at is null then 'INVALID_LIFECYCLE'
   when l.cleanup_candidate_at is distinct from
     ((date_trunc('month',l.excluded_at at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul')
     then 'INVALID_MONTH_BOUNDARY'
   when l.cleanup_candidate_at>context.at then 'NOT_DUE'
   when coalesce((p.value->>'eligible')::boolean,false) then 'RESTORE_REQUIRES_RECONCILE'
   when p.value->>'reason' is distinct from 'AUTO_NO_ACTIVITY' then 'POLICY_HOLD'
   else 'REQUIRES_FRESH_RELATION_AND_REFERENCE_CHECK' end as disposition
 from public.character_master c
 left join private.character_activity_lifecycle l on l.character_id=c.id
 cross join context
 cross join lateral (select private.kinojo_character_lookup_policy(c.id,context.at) as value) p
)
select jsonb_build_object(
 'contract','CHARACTER_MONTHLY_CLEANUP_PREFLIGHT_V1',
 'readOnly',true,'deletionAllowed',false,
 'evaluatedAt',(select at from context),
 'counts',coalesce((select jsonb_object_agg(disposition,n) from
    (select disposition,count(*) as n from assessed group by disposition) x),'{}'::jsonb),
 'dueCandidates',coalesce((select jsonb_agg(jsonb_build_object('characterId',id,'episode',episode,
    'candidateAt',cleanup_candidate_at,'disposition',disposition) order by id)
    from assessed where disposition in ('REQUIRES_FRESH_RELATION_AND_REFERENCE_CHECK','RESTORE_REQUIRES_RECONCILE','POLICY_HOLD')),'[]'::jsonb),
 'foreignKeys',coalesce((select jsonb_agg(to_jsonb(f) order by schema_name,table_name,conname) from foreign_keys f),'[]'::jsonb),
 'logicalColumns',coalesce((select jsonb_agg(to_jsonb(l) order by schema_name,table_name,column_name) from logical_columns l),'[]'::jsonb),
 'structuredColumns',coalesce((select jsonb_agg(to_jsonb(s) order by schema_name,table_name,column_name) from structured_columns s),'[]'::jsonb),
 'requiredGates',jsonb_build_array('HISTORY_REFERENCE_PRESERVATION','OFFICIAL_FAMILY_RECHECK',
    'REVISION_AND_ACTIVE_WRITER_FENCE','LIST_METADATA_RECEIPT_AND_COMPENSATION','TOMBSTONE_REPLAY_FENCE',
    'BOUNDED_CANARY_AND_READBACK','EXPLICIT_SCHEDULE_ACTIVATION')
) as cleanup_preflight;
rollback;
