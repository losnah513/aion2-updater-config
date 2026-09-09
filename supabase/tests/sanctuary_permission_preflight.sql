-- Stage14 read-only preflight. No names, credentials or assignments are emitted.
-- Old team_group_no is not a new team_id. Every old grant remains untouched.
begin transaction read only;
with roles(role_key) as (values ('MEMBER'),('STAFF'),('MANAGER'),('SUB_MASTER'),('MASTER')),
mapping(target_key,source_key,new_default) as (values
 ('sanctuary_team_create',null::text,'MEMBER'),
 ('sanctuary_info_manage_all','sanctuary_team_name_edit',null),
 ('sanctuary_info_manage_assigned',null,'MASTER'),
 ('sanctuary_roster_manage_assigned','sanctuary_roster_manage_assigned',null),
 ('sanctuary_roster_manage_all','sanctuary_roster_manage_all',null),
 ('sanctuary_schedule_manage_assigned','sanctuary_schedule_manage_assigned',null),
 ('sanctuary_schedule_manage_all','sanctuary_schedule_manage_all',null),
 ('sanctuary_support_manage_assigned',null,'MANAGER'),
 ('sanctuary_support_manage_all',null,'MANAGER'),
 ('sanctuary_archive_manage_assigned',null,'MANAGER'),
 ('sanctuary_archive_manage_all',null,'MANAGER')),
preview as (
 select r.role_key,m.target_key,m.source_key,
   existing.enabled current_value,
   case when r.role_key='MASTER' then true
     when existing.enabled is not null then existing.enabled
     when m.source_key is not null then coalesce(source.enabled,false)
     when m.new_default='MEMBER' then true
     when m.new_default='MANAGER' then r.role_key in ('MANAGER','SUB_MASTER')
     else false end proposed_value
 from roles r cross join mapping m
 left join public.sanctuary_role_permissions existing
   on existing.role_key=r.role_key and existing.permission_key=m.target_key
 left join public.sanctuary_role_permissions source
   on source.role_key=r.role_key and source.permission_key=m.source_key
)
select jsonb_build_object(
 'mode','READ_ONLY_NO_ACTIVATION',
 'matrix', (select jsonb_agg(to_jsonb(p) order by target_key,role_key) from preview p),
 'legacyAssignmentReview', (select jsonb_build_object('count',count(*),
   'disposition','PRESERVE_UNTIL_EXPLICIT_NEW_TEAM_ID_MAPPING')
   from public.sanctuary_team_leader_grants where status='active'),
 'broadPersonalOverrides', (select jsonb_object_agg(permission,holders) from (
   select permission,count(*) holders from public.member_codes m
   cross join lateral unnest(m.permissions) permission
   where m.is_active is true and permission in ('all','sanctuary_edit') group by permission) x),
 'operatorAssignment','MASTER_ONLY_NO_ROLE_PROMOTION',
 'legacyFingerprint',(select md5(coalesce(jsonb_agg(jsonb_build_array(role_key,permission_key,enabled)
   order by role_key,permission_key)::text,'')) from public.sanctuary_role_permissions)
) as permission_preflight;
rollback;
