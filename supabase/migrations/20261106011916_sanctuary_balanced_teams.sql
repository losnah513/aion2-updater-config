-- SQL554: opt-in team balancing and team-lifetime guest identities.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
-- Abort rather than installing against an unexpectedly changed existing roster.
DO $preserve$
DECLARE r record;fingerprints jsonb:='{}';digest text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('private.sanctuary_management_teams_v412','team_id',ARRAY['placement_mode']),
  ('private.sanctuary_management_forces_v412','force_id',ARRAY[]::text[]),
  ('private.sanctuary_management_parties_v412','party_id',ARRAY[]::text[]),
  ('private.sanctuary_management_slots_v412','slot_id',ARRAY['guest_snapshot','team_family_key','team_family_role']),
  ('private.sanctuary_boss_roles_v536','team_id',ARRAY[]::text[]))x(tbl,key,omit) LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(t)-$1)::text,'','' ORDER BY %I,(to_jsonb(t)-$1)::text),'''')) FROM %s t',r.key,r.tbl) INTO digest USING r.omit;
  fingerprints:=fingerprints||jsonb_build_object(r.tbl,digest);
 END LOOP;
 PERFORM set_config('kinojo.sql554_rosters',fingerprints::text,true);
END
$preserve$;
ALTER TABLE private.sanctuary_management_teams_v412
 ADD COLUMN placement_mode text NOT NULL DEFAULT 'MANUAL'
 CHECK(placement_mode IN('MANUAL','BALANCED'));
ALTER TABLE private.sanctuary_management_slots_v412
 ADD COLUMN guest_snapshot jsonb,
 ADD COLUMN team_family_key text CHECK(length(team_family_key)<=100),
 ADD COLUMN team_family_role text CHECK(team_family_role IN('MAIN','ALT')),
 ADD CONSTRAINT sanctuary_guest_snapshot_bounded_v554 CHECK(guest_snapshot IS NULL OR
   (jsonb_typeof(guest_snapshot)='object' AND pg_column_size(guest_snapshot)<=4096));
ALTER TABLE private.sanctuary_management_commands_v412 ADD COLUMN input_hash_v554 text;
ALTER TABLE private.sanctuary_management_official_candidates_v432 ADD COLUMN team_guest_only boolean NOT NULL DEFAULT false;
ALTER TABLE private.sanctuary_management_support_items_v412 ADD COLUMN requested_force_id bigint
 REFERENCES private.sanctuary_management_forces_v412(force_id) ON DELETE SET NULL;
ALTER TABLE private.sanctuary_management_slots_v412 DROP CONSTRAINT sanctuary_management_slots_v450_assignment_kind_ck;
ALTER TABLE private.sanctuary_management_slots_v412 ADD CONSTRAINT sanctuary_management_slots_v450_assignment_kind_ck
 CHECK(assignment_kind IN('ACTUAL_CHARACTER','RANDOM_ALT','TEAM_GUEST'));
ALTER TABLE private.sanctuary_management_slots_v412 DROP CONSTRAINT sanctuary_management_slots_v453_occupancy_ck;
ALTER TABLE private.sanctuary_management_slots_v412 ADD CONSTRAINT sanctuary_management_slots_v453_occupancy_ck CHECK(
 (assignment_kind='ACTUAL_CHARACTER' AND guest_snapshot IS NULL AND
   ((character_id IS NULL AND owner_member_id IS NULL AND owner_root_character_id IS NULL AND character_relation IS NULL)
    OR(character_id IS NOT NULL AND owner_root_character_id IS NOT NULL AND character_relation IS NOT NULL)))
 OR(assignment_kind='RANDOM_ALT' AND guest_snapshot IS NULL AND character_id IS NULL AND owner_root_character_id IS NOT NULL AND character_relation='ALT')
 OR(assignment_kind='TEAM_GUEST' AND character_id IS NULL AND owner_member_id IS NULL AND owner_root_character_id IS NULL
    AND character_relation='GUEST' AND guest_snapshot IS NOT NULL AND guest_snapshot->>'guestId' IS NOT NULL));

CREATE FUNCTION private.kinojo_sm_editor_enabled_v554() RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS 'SELECT true';

-- Pure, bounded server search. Slots keep their class/difficulty; locked people keep their exact position.
CREATE FUNCTION private.kinojo_sm_balance_layout_v554(p_people jsonb,p_slots jsonb,p_seed text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='pg_catalog' AS $f$
DECLARE people jsonb[];slots jsonb[];placed integer[];moves integer[];tried jsonb[];
 n integer;capacity integer;depth integer:=1;pick integer;i integer;j integer;k integer;person integer;
 steps integer:=0;deadline timestamptz:=clock_timestamp()+interval '2seconds';
 result jsonb;invalid boolean;force_no integer;party_no integer;known bigint;main_count integer;anchor integer;
BEGIN
 IF jsonb_typeof(p_people)<>'array' OR jsonb_typeof(p_slots)<>'array' OR jsonb_array_length(p_people)>90
 OR jsonb_array_length(p_slots)>90 THEN RAISE EXCEPTION '편성 크기를 다시 확인해 주세요.' USING ERRCODE='22023';END IF;
 SELECT coalesce(array_agg(value ORDER BY (value->>'locked')::boolean DESC,
   CASE WHEN value->>'role'='MAIN' THEN 0 ELSE 1 END,
   (SELECT count(*) FROM jsonb_array_elements(p_slots)s WHERE s->>'class'='ALL' OR s->>'class'=value->>'class'),
   coalesce((value->>'power')::bigint,0) DESC,value->>'key'),'{}') INTO people FROM jsonb_array_elements(p_people);
 SELECT coalesce(array_agg(value ORDER BY (value->>'force')::int,(value->>'party')::int,(value->>'slot')::int),'{}') INTO slots FROM jsonb_array_elements(p_slots);
 n:=cardinality(people);capacity:=cardinality(slots);
 IF n>capacity THEN RAISE EXCEPTION '포스 정원보다 캐릭터가 많습니다.' USING ERRCODE='22023';END IF;
 placed:=array_fill(0,ARRAY[capacity]);moves:=array_fill(0,ARRAY[n]);tried:=array_fill('[]'::jsonb,ARRAY[n]);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_people)p GROUP BY p->>'family' HAVING count(*)>
   (SELECT count(DISTINCT s->>'force') FROM jsonb_array_elements(p_slots)s)) THEN
  RAISE EXCEPTION '같은 이용자의 캐릭터 수보다 포스 수가 적습니다. 한 포스에는 한 캐릭터만 배치할 수 있습니다.' USING ERRCODE='22023';END IF;
 -- Place pins first, never silently unlocking or replacing one.
 FOR i IN 1..n LOOP
  IF coalesce((people[i]->>'locked')::boolean,false) THEN
   SELECT x INTO pick FROM generate_subscripts(slots,1)x WHERE slots[x]->>'position'=people[i]->>'position';
   IF pick IS NULL OR placed[pick]<>0 OR (slots[pick]->>'class'<>'ALL' AND slots[pick]->>'class'<>people[i]->>'class')
     OR coalesce((people[i]->>'itemLevel')::int,0)<coalesce((slots[pick]->>'minimum')::int,0) THEN
    RAISE EXCEPTION '잠금된 캐릭터의 클래스·아이템레벨·위치를 확인해 주세요.' USING ERRCODE='22023';END IF;
   placed[pick]:=i;moves[i]:=pick;
  END IF;
 END LOOP;
 WHILE depth<=n LOOP
  steps:=steps+1;
  IF steps>30000 OR clock_timestamp()>deadline THEN
   RAISE EXCEPTION '조건 안에서 균형 배치를 찾지 못했습니다. 잠금이나 클래스 제한을 조정한 뒤 다시 계산해 주세요.' USING ERRCODE='22023';END IF;
  IF coalesce((people[depth]->>'locked')::boolean,false) THEN depth:=depth+1;CONTINUE;END IF;
  person:=depth;
  SELECT x INTO pick FROM generate_subscripts(slots,1)x
  WHERE placed[x]=0 AND NOT(tried[depth] @> to_jsonb(ARRAY[x]))
   AND (slots[x]->>'class'='ALL' OR slots[x]->>'class'=people[person]->>'class')
   AND coalesce((people[person]->>'itemLevel')::int,0)>=coalesce((slots[x]->>'minimum')::int,0)
   AND NOT EXISTS(SELECT 1 FROM generate_subscripts(placed,1)y WHERE placed[y]>0
    AND slots[y]->>'force'=slots[x]->>'force' AND
      (people[placed[y]]->>'family'=people[person]->>'family' OR
       (people[person]->>'canonicalRoot' IS NOT NULL AND people[placed[y]]->>'canonicalRoot'=people[person]->>'canonicalRoot')))
   AND (people[person]->>'role'<>'MAIN' OR
     (SELECT count(DISTINCT slots[y]->>'party') FROM generate_subscripts(placed,1)y WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force' AND people[placed[y]]->>'role'='MAIN')>1 OR
     (SELECT count(*) FROM generate_subscripts(placed,1)y WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force' AND people[placed[y]]->>'role'='MAIN')>=5
     OR NOT EXISTS(SELECT 1 FROM generate_subscripts(placed,1)y WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force'
       AND people[placed[y]]->>'role'='MAIN' AND slots[y]->>'party'<>slots[x]->>'party'))
  ORDER BY
   CASE WHEN people[person]->>'role'='MAIN' THEN (SELECT count(*) FROM generate_subscripts(placed,1)y
     WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force' AND people[placed[y]]->>'role'='MAIN') ELSE 0 END,
   (SELECT count(*) FROM generate_subscripts(placed,1)y WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force'),
   (SELECT coalesce(sum(coalesce((people[placed[y]]->>'power')::bigint,0)),0) FROM generate_subscripts(placed,1)y WHERE placed[y]>0 AND slots[y]->>'force'=slots[x]->>'force'),
   CASE WHEN people[person]->>'role'='MAIN' THEN (slots[x]->>'party')::int ELSE 0 END,
   md5(coalesce(p_seed,'')||':'||(people[person]->>'key')||':'||(slots[x]->>'position'))
  LIMIT 1;
  IF pick IS NOT NULL THEN
   placed[pick]:=depth;moves[depth]:=pick;tried[depth]:=tried[depth]||to_jsonb(pick);depth:=depth+1;
   IF depth<=n THEN tried[depth]:='[]';END IF;
   IF depth<=n THEN CONTINUE;END IF;
   SELECT EXISTS(SELECT 1 FROM generate_subscripts(placed,1)x WHERE placed[x]>0 AND people[placed[x]]->>'role'='MAIN'
     GROUP BY slots[x]->>'force' HAVING count(*)<=5 AND count(DISTINCT slots[x]->>'party')>1) INTO invalid;
   IF NOT invalid THEN EXIT;END IF;
  END IF;
  IF depth<=n THEN tried[depth]:='[]';END IF;
  depth:=least(depth-1,n);
  WHILE depth>0 AND coalesce((people[depth]->>'locked')::boolean,false) LOOP depth:=depth-1;END LOOP;
  IF depth=0 THEN RAISE EXCEPTION '현재 잠금·클래스·가족 관계로 배치할 수 없습니다. 조건을 조정해 주세요.' USING ERRCODE='22023';END IF;
  placed[moves[depth]]:=0;moves[depth]:=0;
 END LOOP;
 IF EXISTS(SELECT 1 FROM generate_subscripts(placed,1)x WHERE placed[x]>0
   GROUP BY slots[x]->>'force',people[placed[x]]->>'family' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM generate_subscripts(placed,1)x WHERE placed[x]>0 AND people[placed[x]]->>'canonicalRoot' IS NOT NULL
   GROUP BY slots[x]->>'force',people[placed[x]]->>'canonicalRoot' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM generate_subscripts(placed,1)x WHERE placed[x]>0 AND people[placed[x]]->>'role'='MAIN'
   GROUP BY slots[x]->>'force' HAVING count(*)<=5 AND count(DISTINCT slots[x]->>'party')>1) THEN
  RAISE EXCEPTION '잠금된 캐릭터의 가족 관계·본캐 파티가 충돌합니다. 잠금을 조정해 주세요.' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('position',slots[x]->>'position','key',people[placed[x]]->>'key') ORDER BY x),'[]') INTO result
 FROM generate_subscripts(placed,1)x WHERE placed[x]>0;
 RETURN result;
END
$f$;

CREATE OR REPLACE FUNCTION private.kinojo_sm_combat_power_v449(p_team_id bigint,p_force_id bigint,p_party_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='pg_catalog' AS $f$
 SELECT jsonb_build_object('average',coalesce(round(avg(power)),0)::bigint,'total',coalesce(sum(power),0)::bigint,
  'knownCount',count(power)::int,'occupiedCount',count(*) FILTER(WHERE occupied)::int,
  'unknownCount',count(*) FILTER(WHERE occupied AND power IS NULL)::int)
 FROM(SELECT coalesce((s.guest_snapshot->>'power')::bigint,c.latest_pve_combat_power) power,
  (s.character_id IS NOT NULL OR s.guest_snapshot IS NOT NULL) occupied
  FROM private.sanctuary_management_slots_v412 s LEFT JOIN public.character_master c ON c.id=s.character_id
  WHERE s.team_id=p_team_id AND s.force_id=p_force_id AND(p_party_id IS NULL OR s.party_id=p_party_id))q
$f$;

CREATE FUNCTION private.kinojo_sm_roster_enrich_v554(p_team bigint,p_roster jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='pg_catalog' AS $f$
DECLARE result jsonb:=p_roster;forces jsonb:='[]';parties jsonb;slots jsonb;f jsonb;p jsonb;s jsonb;c jsonb;
 row private.sanctuary_management_slots_v412%rowtype;party_used integer;force_used integer;total_used integer:=0;
BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(p_roster->'forces','[]')) LOOP
  parties:='[]';force_used:=0;
  FOR p IN SELECT value FROM jsonb_array_elements(f->'parties') LOOP
   slots:='[]';party_used:=0;
   FOR s IN SELECT value FROM jsonb_array_elements(p->'slots') LOOP
    SELECT * INTO STRICT row FROM private.sanctuary_management_slots_v412 WHERE slot_id=(s->>'slotId')::bigint AND team_id=p_team;
    c:=s->'character';
    IF row.guest_snapshot IS NOT NULL THEN
     c:=private.kinojo_sm_guest_card_v554(row.guest_snapshot,row.team_family_key,row.team_family_role);
    ELSIF row.character_id IS NOT NULL AND row.team_family_role IS NOT NULL THEN
     c:=c||jsonb_build_object('familyRoot',row.team_family_key,'familyRelation',row.team_family_role,
      'membershipRelation',coalesce(c->>'membershipRelation',c->>'relation'),'relation',row.team_family_role,'isMain',row.team_family_role='MAIN');
    END IF;
    s:=s||jsonb_build_object('occupied',row.character_id IS NOT NULL OR row.assignment_kind IN('RANDOM_ALT','TEAM_GUEST'),
      'assignmentKind',row.assignment_kind,'placementLocked',row.placement_locked,'character',c);
    IF row.character_id IS NOT NULL OR row.assignment_kind IN('RANDOM_ALT','TEAM_GUEST') THEN party_used:=party_used+1;END IF;
    slots:=slots||jsonb_build_array(s);
   END LOOP;
   force_used:=force_used+party_used;
   parties:=parties||jsonb_build_array(p||jsonb_build_object('slots',slots,'occupiedCount',party_used,'vacancyCount',5-party_used,
     'combatPower',private.kinojo_sm_combat_power_v449(p_team,(f->>'forceId')::bigint,(p->>'partyId')::bigint)));
  END LOOP;
  total_used:=total_used+force_used;
  forces:=forces||jsonb_build_array(f||jsonb_build_object('parties',parties,'occupiedCount',force_used,'vacancyCount',10-force_used,
    'combatPower',private.kinojo_sm_combat_power_v449(p_team,(f->>'forceId')::bigint,NULL)));
 END LOOP;
 RETURN result||jsonb_build_object('forces',forces,'occupiedCount',total_used,'vacancyCount',jsonb_array_length(forces)*10-total_used,
  'placementMode',(SELECT placement_mode FROM private.sanctuary_management_teams_v412 WHERE team_id=p_team));
END
$f$;

CREATE FUNCTION private.kinojo_sm_guest_schedule_guard_v554(p_team bigint)
RETURNS void LANGUAGE plpgsql SET search_path='pg_catalog' AS $f$
DECLARE conflict_name text;
BEGIN
 WITH identities AS MATERIALIZED(
  SELECT s.team_id,s.guest_snapshot IS NOT NULL is_guest,
   coalesce(s.owner_root_character_id::text,s.guest_snapshot->>'canonicalRoot') root,
   coalesce(c.server_id::text,s.guest_snapshot->>'serverId') server,
   public.kinojo_character_identity_key_v298(coalesce(c.character_name,s.guest_snapshot->>'characterName')) name,
   coalesce(c.character_name,s.guest_snapshot->>'characterName') display
  FROM private.sanctuary_management_slots_v412 s JOIN private.sanctuary_management_teams_v412 t ON t.team_id=s.team_id
  LEFT JOIN public.character_master c ON c.id=s.character_id WHERE t.status IN('ACTIVE','FULL') AND(s.character_id IS NOT NULL OR s.guest_snapshot IS NOT NULL)),
 pairs AS(SELECT DISTINCT a.team_id,b.team_id other_team_id,a.display
  FROM identities a JOIN identities b ON b.team_id<>a.team_id AND(a.root=b.root OR(a.server=b.server AND a.name=b.name))
  WHERE a.team_id=p_team AND(a.is_guest OR b.is_guest))
 SELECT pairs.display INTO conflict_name FROM pairs
 JOIN private.sanctuary_management_schedule_rules_v412 a ON a.team_id=pairs.team_id
 JOIN private.sanctuary_management_schedule_rules_v412 b ON b.team_id=pairs.other_team_id
 CROSS JOIN LATERAL private.kinojo_sm_rule_occurrences_v437(a.schedule_id,current_date,current_date+366)x
 CROSS JOIN LATERAL private.kinojo_sm_rule_occurrences_v437(b.schedule_id,current_date,current_date+366)y
 WHERE tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(y.start_at,y.end_at,'[)') LIMIT 1;
 IF conflict_name IS NOT NULL THEN RAISE EXCEPTION '% 캐릭터가 다른 팀 일정과 겹칩니다.',conflict_name USING ERRCODE='22023';END IF;
END
$f$;

CREATE FUNCTION private.kinojo_sm_purge_draft_guests_v554()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET lock_timeout='100ms' SET statement_timeout='1s' AS $f$
DECLARE n integer;
BEGIN
 DELETE FROM private.sanctuary_management_official_candidates_v432 WHERE candidate_id IN(
  SELECT candidate_id FROM private.sanctuary_management_official_candidates_v432
   WHERE team_guest_only AND expires_at<clock_timestamp() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END
$f$;

CREATE FUNCTION public.kinojo_sanctuary_management_release_guests_v554(p_credential text,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET statement_timeout='2s' AS $f$
DECLARE actor_id bigint;n integer;
BEGIN
 actor_id:=(private.kinojo_sm_actor_v412(p_credential)->>'memberId')::bigint;
 IF actor_id IS NULL OR cardinality(p_ids)>90 THEN RAISE EXCEPTION '게스트 조회 정보를 확인해 주세요.' USING ERRCODE='22023';END IF;
 DELETE FROM private.sanctuary_management_official_candidates_v432 WHERE candidate_id=ANY(p_ids) AND actor_member_id=actor_id AND team_guest_only;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('ok',true,'released',n);
END
$f$;

CREATE FUNCTION private.kinojo_sm_read_composition_v554(p_team bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='pg_catalog' AS $f$
 SELECT jsonb_build_object('teamId',t.team_id,'sanctuaryCode',m.code,'placementMode',t.placement_mode,
 'composition',coalesce((SELECT jsonb_agg(jsonb_build_object('sourceForceId',f.force_id,'difficulty',f.difficulty,
  'slots',(SELECT jsonb_agg(jsonb_build_object('partyNo',p.party_no,'slotNo',s.slot_no,'characterId',s.character_id,
    'guestId',s.guest_snapshot->>'guestId','assignmentKind',s.assignment_kind,'mainCharacterId',CASE WHEN s.assignment_kind='RANDOM_ALT' THEN s.owner_root_character_id END,
    'familyRoot',s.team_family_key,'familyRole',s.team_family_role,'requiredClassCode',s.required_class_code,
    'placementLocked',s.placement_locked,'bossRoles',CASE WHEN s.guest_snapshot IS NOT NULL THEN coalesce(s.guest_snapshot->'bossRoles','{"boss1":null,"boss2":[]}'::jsonb)
      ELSE private.kinojo_sm_boss_roles_v536(p_team,f.force_no,s.character_id) END) ORDER BY p.party_no,s.slot_no)
     FROM private.sanctuary_management_slots_v412 s JOIN private.sanctuary_management_parties_v412 p ON p.party_id=s.party_id WHERE s.force_id=f.force_id),
  'requirements',coalesce((SELECT jsonb_agg(jsonb_build_object('scopeType',r.scope_type,'partyNo',p.party_no,'ruleType',r.rule_type,
    'minimumCount',r.minimum_count,'powerThreshold',r.power_threshold,'itemLevelThreshold',r.item_level_threshold))
    FROM private.sanctuary_management_composition_rules_v449 r LEFT JOIN private.sanctuary_management_parties_v412 p ON p.party_id=r.party_id
    WHERE r.force_id=f.force_id),'[]')) ORDER BY f.force_no)
   FROM private.sanctuary_management_forces_v412 f WHERE f.team_id=t.team_id),'[]'))
 FROM private.sanctuary_management_teams_v412 t JOIN public.sanctuary_master m ON m.id=t.sanctuary_id WHERE t.team_id=p_team
$f$;

CREATE FUNCTION private.kinojo_sm_guest_roles_v554(p_roles jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='pg_catalog' AS $f$
BEGIN
 IF jsonb_typeof(p_roles) IS DISTINCT FROM 'object' OR jsonb_typeof(p_roles->'boss2') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_roles->'boss2')>2
  OR(nullif(p_roles->>'boss1','') IS NOT NULL AND p_roles->>'boss1' NOT IN('3>3','6>6','9>12','12>9'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_roles->'boss2')x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^(1[0-2]|[1-9])$')
  OR(SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(p_roles->'boss2')x) THEN
  RAISE EXCEPTION '보스 역할 형식을 확인해 주세요.' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('boss1',nullif(p_roles->>'boss1',''),'boss2',p_roles->'boss2');
END
$f$;

CREATE FUNCTION private.kinojo_sm_apply_layout_v554(p_team bigint,p_plan jsonb,p_actor bigint)
RETURNS void LANGUAGE plpgsql SET search_path='pg_catalog' AS $f$
DECLARE f jsonb;s jsonb;fn integer;v_force_id bigint;guest jsonb;person jsonb;
BEGIN
 -- Only the authenticated canonical command calls this after taking the team lock.
 UPDATE private.sanctuary_management_slots_v412 SET character_id=NULL,owner_member_id=NULL,owner_root_character_id=NULL,
  character_relation=NULL,assignment_kind='ACTUAL_CHARACTER',guest_snapshot=NULL,team_family_key=NULL,team_family_role=NULL,placement_locked=false
 WHERE team_id=p_team;
 FOR f,fn IN SELECT value,ordinality::int FROM jsonb_array_elements(p_plan->'composition') WITH ORDINALITY LOOP
  SELECT x.force_id INTO STRICT v_force_id FROM private.sanctuary_management_forces_v412 x WHERE x.team_id=p_team AND x.force_no=fn;
  FOR s IN SELECT value FROM jsonb_array_elements(f->'slots') LOOP
   guest:=NULL;
   IF s->>'guestId' IS NOT NULL THEN
    SELECT x->'snapshot' INTO guest FROM jsonb_array_elements(p_plan->'people')x WHERE x->>'key'='g:'||(s->>'guestId');
    IF guest IS NULL THEN RAISE EXCEPTION '게스트 편성 정보를 다시 조회해 주세요.' USING ERRCODE='22023';END IF;
    guest:=guest||jsonb_build_object('bossRoles',CASE WHEN EXISTS(
     SELECT 1 FROM private.sanctuary_management_teams_v412 t JOIN public.sanctuary_master m ON m.id=t.sanctuary_id WHERE t.team_id=p_team AND m.code='kaldrix')
     THEN private.kinojo_sm_guest_roles_v554(coalesce(s->'bossRoles','{"boss1":null,"boss2":[]}'::jsonb)) ELSE '{"boss1":null,"boss2":[]}'::jsonb END);
   END IF;
   IF guest IS NOT NULL OR s->>'characterId' IS NOT NULL THEN
    UPDATE private.sanctuary_management_slots_v412 x SET
     character_id=(s->>'characterId')::bigint,
     owner_member_id=o.owner_member_id,owner_root_character_id=o.root_character_id,
     character_relation=CASE WHEN guest IS NOT NULL THEN 'GUEST' ELSE o.relation END,
     assignment_kind=CASE WHEN guest IS NOT NULL THEN 'TEAM_GUEST' ELSE 'ACTUAL_CHARACTER' END,
     guest_snapshot=guest,team_family_key=s->>'familyRoot',team_family_role=s->>'familyRole',
     placement_locked=coalesce((s->>'placementLocked')::boolean,false),added_by_member_id=p_actor
    FROM private.sanctuary_management_parties_v412 p
    LEFT JOIN LATERAL private.kinojo_sm_resolve_character_owner_v412((s->>'characterId')::bigint)o ON true
    WHERE x.team_id=p_team AND x.force_id=v_force_id AND x.party_id=p.party_id AND p.party_no=(s->>'partyNo')::int AND x.slot_no=(s->>'slotNo')::int;
   ELSIF s->>'assignmentKind'='RANDOM_ALT' THEN
    UPDATE private.sanctuary_management_slots_v412 x SET owner_root_character_id=(s->>'mainCharacterId')::bigint,
     owner_member_id=o.owner_member_id,character_relation='ALT',assignment_kind='RANDOM_ALT',placement_locked=coalesce((s->>'placementLocked')::boolean,false)
    FROM private.sanctuary_management_parties_v412 p
    CROSS JOIN LATERAL private.kinojo_sm_resolve_character_owner_v412((s->>'mainCharacterId')::bigint)o
    WHERE x.team_id=p_team AND x.force_id=v_force_id AND x.party_id=p.party_id AND p.party_no=(s->>'partyNo')::int AND x.slot_no=(s->>'slotNo')::int;
   END IF;
  END LOOP;
 END LOOP;
 -- Application history follows the actual character after automatic moves; original request stays available.
 UPDATE private.sanctuary_management_support_items_v412 i SET requested_force_id=coalesce(i.requested_force_id,i.force_id),
   force_id=s.force_id,applied_slot_id=s.slot_id
 FROM private.sanctuary_management_slots_v412 s WHERE s.team_id=p_team AND i.character_id=s.character_id AND i.status='APPLIED'
  AND i.support_batch_id IN(SELECT support_batch_id FROM private.sanctuary_management_support_batches_v412 WHERE team_id=p_team)
  AND (i.applied_slot_id IS DISTINCT FROM s.slot_id OR i.force_id IS DISTINCT FROM s.force_id);
END
$f$;

CREATE FUNCTION private.kinojo_sm_assert_layout_v554(p_team bigint,p_balanced boolean)
RETURNS void LANGUAGE plpgsql SET search_path='pg_catalog' AS $f$
BEGIN
 IF EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 WHERE team_id=p_team AND team_family_key IS NOT NULL
   GROUP BY force_id,team_family_key HAVING count(*)>1) THEN
  RAISE EXCEPTION '같은 이용자의 본캐·부캐는 한 포스에 하나만 배치할 수 있습니다.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 s WHERE s.team_id=p_team
   AND (coalesce(s.guest_snapshot->>'canonicalRoot',s.owner_root_character_id::text)) IS NOT NULL
   GROUP BY s.force_id,coalesce(s.guest_snapshot->>'canonicalRoot',s.owner_root_character_id::text) HAVING count(*)>1) THEN
  RAISE EXCEPTION '같은 본캐 계열의 캐릭터가 한 포스에 겹칩니다.' USING ERRCODE='22023';END IF;
 IF p_balanced AND EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 WHERE team_id=p_team AND assignment_kind='RANDOM_ALT') THEN
  RAISE EXCEPTION '균형 배치에서는 랜덤 부캐를 사용할 수 없습니다.' USING ERRCODE='22023';END IF;
 IF p_balanced AND EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 s WHERE s.team_id=p_team AND s.team_family_role='MAIN'
   GROUP BY s.force_id HAVING count(*)<=5 AND count(DISTINCT s.party_id)>1) THEN
  RAISE EXCEPTION '본캐 5명 이하는 한 파티에 모아야 합니다. 배치 잠금·클래스 제한을 확인해 주세요.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 s WHERE s.team_id=p_team AND s.guest_snapshot IS NOT NULL AND
   ((s.required_class_code<>'ALL' AND s.required_class_code IS DISTINCT FROM private.kinojo_sm_class_code_v450(s.guest_snapshot->>'className'))
    OR coalesce((s.guest_snapshot->>'itemLevel')::int,0)<private.kinojo_sm_force_min_item_level_v454(s.force_id))) THEN
  RAISE EXCEPTION '게스트의 클래스·아이템레벨이 해당 자리의 조건을 충족하지 않습니다.' USING ERRCODE='22023';END IF;
END
$f$;

CREATE FUNCTION private.kinojo_sm_guest_card_v554(p_guest jsonb,p_family text DEFAULT NULL,p_role text DEFAULT 'MAIN')
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS $f$
 SELECT p_guest||jsonb_build_object('characterId',null,'guestId',p_guest->>'guestId',
  'name',p_guest->>'characterName','isTemporaryGuest',true,'isRandomAlt',false,'assignmentKind','TEAM_GUEST',
  'membershipRelation','GUEST','relation',coalesce(p_role,'MAIN'),'familyRelation',coalesce(p_role,'MAIN'),
  'familyRoot',p_family,'isMain',coalesce(p_role,'MAIN')='MAIN','ownerMemberId',null)
$f$;

CREATE FUNCTION public.kinojo_sanctuary_management_team_guest_v554(p_credential text,p_team_id bigint,p_candidate_id uuid DEFAULT NULL,p_character_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET statement_timeout='5s' AS $f$
DECLARE actor_id bigint;candidate private.sanctuary_management_official_candidates_v432%rowtype;cm public.character_master%rowtype;snapshot jsonb;
BEGIN
 IF NOT private.kinojo_sm_editor_enabled_v554() THEN RAISE EXCEPTION '팀 편집 기능을 점검 중입니다. 잠시 후 다시 시도해 주세요.' USING ERRCODE='55000';END IF;
 PERFORM private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
 PERFORM private.kinojo_sm_require_roster_scope(p_credential,p_team_id,false);
 actor_id:=(private.kinojo_sm_actor_v412(p_credential)->>'memberId')::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended('sm-guest:'||actor_id,554));
 DELETE FROM private.sanctuary_management_official_candidates_v432 WHERE candidate_id IN(
  SELECT candidate_id FROM private.sanctuary_management_official_candidates_v432 WHERE actor_member_id=actor_id AND team_guest_only
   AND expires_at<clock_timestamp() ORDER BY expires_at LIMIT 90 FOR UPDATE SKIP LOCKED);
 IF (SELECT count(*) FROM private.sanctuary_management_official_candidates_v432
   WHERE actor_member_id=actor_id AND team_guest_only AND expires_at>clock_timestamp())>=90 THEN
  RAISE EXCEPTION '열려 있는 게스트 조회가 많습니다. 사용하지 않는 편집창을 닫고 다시 시도해 주세요.' USING ERRCODE='22023';END IF;
 IF p_character_id IS NOT NULL THEN
  SELECT * INTO cm FROM public.character_master WHERE id=p_character_id AND coalesce(is_active,true) AND identity_status='CURRENT';
  IF NOT FOUND THEN RAISE EXCEPTION '게스트로 추가할 캐릭터를 다시 조회해 주세요.' USING ERRCODE='22023';END IF;
  -- Short-lived verified snapshot of an existing identity. This does not materialize/update Master.
  INSERT INTO private.sanctuary_management_official_candidates_v432(actor_member_id,team_id,requested_character_name,character_name,
    server_id,server_name,race_id,class_name,legion_name,char_key,official_character_id,profile_image_url,detail_url,official_payload)
  VALUES(actor_id,p_team_id,cm.character_name,cm.character_name,cm.server_id,cm.server_name,
    coalesce((SELECT (to_jsonb(s)->>'race_id')::int FROM public.server_master s WHERE s.server_id=cm.server_id),0),
    coalesce(cm.class_name,''),cm.legion_name,coalesce(nullif(cm.char_key,''),'master:'||cm.id),
    'master:'||cm.id,cm.profile_image_url,coalesce(nullif(cm.detail_url,''),'https://aion2.plaync.com/'),
    jsonb_build_object('sourceCharacterId',cm.id,'canonicalRoot',coalesce(cm.main_character_id,cm.id),
      'pveCombatPower',cm.latest_pve_combat_power,'pveItemLevel',cm.latest_pve_item_level)) RETURNING * INTO candidate;
 ELSE
  SELECT * INTO candidate FROM private.sanctuary_management_official_candidates_v432
   WHERE candidate_id=p_candidate_id AND actor_member_id=actor_id AND team_id IS NOT DISTINCT FROM p_team_id
    AND state='VERIFIED' AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION '게스트 조회 결과가 만료되었습니다. 다시 조회해 주세요.' USING ERRCODE='22023';END IF;
 END IF;
 UPDATE private.sanctuary_management_official_candidates_v432 SET team_guest_only=true,
  official_payload=jsonb_build_object('canonicalRoot',official_payload->'canonicalRoot','pveCombatPower',official_payload->'pveCombatPower','pveItemLevel',official_payload->'pveItemLevel')
  WHERE candidate_id=candidate.candidate_id;
 snapshot:=jsonb_build_object('guestId',candidate.candidate_id,'characterName',candidate.character_name,
  'serverId',candidate.server_id,'serverName',candidate.server_name,'className',candidate.class_name,
  'profileImageUrl',candidate.profile_image_url,'power',candidate.official_payload->'pveCombatPower',
  'itemLevel',candidate.official_payload->'pveItemLevel','canonicalRoot',candidate.official_payload->'canonicalRoot',
  'verifiedAt',candidate.created_at);
 RETURN jsonb_build_object('ok',true,'character',private.kinojo_sm_guest_card_v554(snapshot,'g:'||candidate.candidate_id,'MAIN'));
END
$f$;

CREATE FUNCTION public.kinojo_sanctuary_management_composition_preview_v554(p_credential text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' SET statement_timeout='5s' AS $f$
#variable_conflict use_variable
DECLARE actor_id bigint;team_id bigint:=(p_payload->>'teamId')::bigint;plan jsonb;
BEGIN
 IF NOT private.kinojo_sm_editor_enabled_v554() THEN RAISE EXCEPTION '팀 편집 기능을 점검 중입니다. 잠시 후 다시 시도해 주세요.' USING ERRCODE='55000';END IF;
 PERFORM private.kinojo_sm_assert_pilot_write_v439(p_credential,'SAVE_COMPOSITION');
 PERFORM private.kinojo_sm_require_roster_scope(p_credential,team_id,false);
 actor_id:=(private.kinojo_sm_actor_v412(p_credential)->>'memberId')::bigint;
 IF team_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.sanctuary_management_teams_v412 t WHERE t.team_id=team_id
    AND t.revision=(p_payload->>'revision')::bigint AND t.status IN('ACTIVE','FULL')) THEN
   RAISE EXCEPTION '팀 편성이 변경되었습니다. 미저장 내용을 확인하고 최신 팀을 다시 열어 주세요.' USING ERRCODE='40001';END IF;
  PERFORM private.kinojo_sm_assert_lease_v433(actor_id,team_id,p_payload->>'leaseToken');
 END IF;
 plan:=private.kinojo_sm_composition_input_v554(p_payload,actor_id,team_id,coalesce(p_payload->>'placementMode','MANUAL'),true);
 RETURN jsonb_build_object('ok',true,'composition',plan->'composition','inputRevision',p_payload->'draftRevision');
END
$f$;

CREATE FUNCTION private.kinojo_sm_redact_guest_audit_v554(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='pg_catalog' AS $f$
DECLARE result jsonb;pair record;
BEGIN
 IF jsonb_typeof(p_value)='object' THEN
  result:='{}';FOR pair IN SELECT * FROM jsonb_each(p_value) LOOP
   IF pair.key<>'guest_snapshot' THEN result:=result||jsonb_build_object(pair.key,private.kinojo_sm_redact_guest_audit_v554(pair.value));END IF;
  END LOOP;RETURN result;
 ELSIF jsonb_typeof(p_value)='array' THEN
  SELECT coalesce(jsonb_agg(private.kinojo_sm_redact_guest_audit_v554(value)),'[]') INTO result FROM jsonb_array_elements(p_value);RETURN result;
 END IF;RETURN p_value;
END
$f$;

CREATE FUNCTION private.kinojo_sm_roles_guard_v554(p_team bigint)
RETURNS void LANGUAGE plpgsql SET search_path='pg_catalog' AS $f$
BEGIN
 IF EXISTS(WITH guest_roles AS(
   SELECT f.force_no,(s.guest_snapshot->'bossRoles'->>'boss1') code,1 boss FROM private.sanctuary_management_slots_v412 s
    JOIN private.sanctuary_management_forces_v412 f ON f.force_id=s.force_id WHERE s.team_id=p_team AND s.guest_snapshot IS NOT NULL
   UNION ALL SELECT f.force_no,x#>>'{}',2 FROM private.sanctuary_management_slots_v412 s
    JOIN private.sanctuary_management_forces_v412 f ON f.force_id=s.force_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.guest_snapshot->'bossRoles'->'boss2','[]'))x WHERE s.team_id=p_team)
  SELECT 1 FROM(SELECT force_no,boss,code FROM guest_roles WHERE nullif(code,'') IS NOT NULL
   UNION ALL SELECT force_no,boss,role_code FROM private.sanctuary_boss_roles_v536 WHERE team_id=p_team)r
  GROUP BY force_no,boss,code HAVING count(*)>1) THEN
  RAISE EXCEPTION '같은 포스의 보스 역할이 중복되었습니다. 배정을 확인해 주세요.' USING ERRCODE='22023';END IF;
END
$f$;

CREATE FUNCTION private.kinojo_sm_command_layout_v554(p_credential text,p_key text,p_action text,p_payload jsonb,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path='pg_catalog' AS $f$
#variable_conflict use_variable
DECLARE actor_id bigint;team_id bigint:=(p_payload->>'teamId')::bigint;mode text;plan jsonb;payload jsonb:=p_payload;
 response jsonb;receipt private.sanctuary_management_commands_v412%rowtype;input_hash text;desired jsonb;force_item jsonb;slots jsonb;
 f jsonb;s jsonb;locked record;compute boolean;revision bigint;roles jsonb;guest_id uuid;before_roster_hash text;
BEGIN
 actor_id:=(private.kinojo_sm_actor_v412(p_credential)->>'memberId')::bigint;
 IF actor_id IS NULL THEN RAISE EXCEPTION '로그인 세션을 확인해 주세요.' USING ERRCODE='42501';END IF;
 IF p_action IN('LEAVE_TEAM','SET_BOSS_ROLES') THEN
  PERFORM private.kinojo_sm_assert_pilot_write_v439(p_credential,p_action);
  PERFORM private.kinojo_sm_assert_write_enabled_v412();
  IF btrim(coalesce(p_key,'')) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' THEN
   RAISE EXCEPTION '요청 키를 다시 확인해 주세요.' USING ERRCODE='22023';END IF;
 END IF;
 input_hash:=encode(sha256(convert_to(p_action||':'||coalesce(p_payload,'{}')::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||actor_id||':'||p_key,554));
 SELECT * INTO receipt FROM private.sanctuary_management_commands_v412 WHERE actor_member_id=actor_id AND request_key=p_key;
 IF receipt.input_hash_v554 IS NOT NULL THEN
  IF receipt.input_hash_v554<>input_hash OR receipt.action<>p_action THEN RAISE EXCEPTION '같은 요청 키가 다른 작업에 사용되었습니다.' USING ERRCODE='22023';END IF;
  RETURN receipt.response_payload||jsonb_build_object('replayed',true);
 END IF;
 IF p_action IN('DECIDE_SUPPORT','CANCEL_SUPPORT') THEN
  SELECT b.team_id INTO team_id FROM private.sanctuary_management_support_batches_v412 b WHERE b.support_batch_id=(p_payload->>'supportBatchId')::bigint;
 ELSIF p_action='SET_SLOT' THEN
  SELECT x.team_id INTO team_id FROM private.sanctuary_management_forces_v412 x WHERE x.force_id=(p_payload->>'forceId')::bigint;
 ELSIF p_action='MOVE_SLOT' THEN
  SELECT x.team_id INTO team_id FROM private.sanctuary_management_slots_v412 x WHERE x.slot_id=(p_payload->>'fromSlotId')::bigint;
 END IF;
 SELECT t.placement_mode INTO mode FROM private.sanctuary_management_teams_v412 t WHERE t.team_id=team_id;
 IF mode='BALANCED' AND p_action IN('UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM','UPDATE_TEAM_DRAFT') THEN
  RAISE EXCEPTION '균형 배치 팀은 새 팀 편집창에서 최종 저장해 주세요.' USING ERRCODE='22023';END IF;
 IF p_action IN('SET_SLOT','MOVE_SLOT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM','UPDATE_TEAM_DRAFT')
  AND EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 x WHERE x.team_id=team_id AND x.guest_snapshot IS NOT NULL) THEN
  RAISE EXCEPTION '게스트가 있는 팀은 팀 편집창에서 변경한 뒤 최종 저장해 주세요.' USING ERRCODE='22023';END IF;
 IF mode='BALANCED' THEN
  IF p_action='SUBMIT_SUPPORT' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'assignments','[]'))x WHERE x->>'assignmentKind'='RANDOM_ALT') THEN
   RAISE EXCEPTION '균형 배치 팀에는 랜덤 부캐로 참가할 수 없습니다. 실제 캐릭터를 선택해 주세요.' USING ERRCODE='22023';END IF;
  SELECT md5(coalesce(string_agg(jsonb_build_array(x.character_id,x.guest_snapshot->>'guestId',x.assignment_kind)::text,',' ORDER BY x.slot_id),''))
    INTO before_roster_hash FROM private.sanctuary_management_slots_v412 x WHERE x.team_id=team_id;
 END IF;
 IF p_action='SAVE_COMPOSITION' THEN
  IF p_payload ? 'placementMode' AND NOT private.kinojo_sm_editor_enabled_v554() THEN RAISE EXCEPTION '팀 편집 기능을 점검 중입니다. 미저장 내용을 유지하고 잠시 후 다시 시도해 주세요.' USING ERRCODE='55000';END IF;
  -- Old manual clients remain compatible. A client unaware of new guests/balancing must not erase them.
  IF NOT(p_payload ? 'placementMode') AND team_id IS NOT NULL THEN
   IF mode<>'MANUAL' OR EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 x WHERE x.team_id=team_id AND x.guest_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION '새 팀 편집 기능을 사용하려면 페이지를 새로고침해 주세요.' USING ERRCODE='22023';END IF;
   RETURN public.kinojo_sanctuary_management_command_v454(p_credential,p_key,p_action,p_payload,p_revision);
  END IF;
  mode:=p_payload->>'placementMode';
  IF mode IS NULL OR mode NOT IN('MANUAL','BALANCED') THEN RAISE EXCEPTION '수동배치 또는 균형랜덤배치를 선택해 주세요.' USING ERRCODE='22023';END IF;
  IF team_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM private.sanctuary_management_teams_v412 t WHERE t.team_id=team_id AND t.revision=p_revision) THEN
    RAISE EXCEPTION '팀 편성이 변경되었습니다. 최신 팀을 다시 열어 주세요.' USING ERRCODE='40001';END IF;
   PERFORM private.kinojo_sm_assert_lease_v433(actor_id,team_id,p_payload->>'leaseToken');
  END IF;
  compute:=mode='BALANCED' OR coalesce((p_payload->>'rebalanceOnce')::boolean,false);
  plan:=private.kinojo_sm_composition_input_v554(p_payload,actor_id,team_id,mode,compute);
  -- Explicit unlocks may move; still-pinned identities retain their exact force/party/slot.
  FOR locked IN SELECT x.*,f.force_no,p.party_no FROM private.sanctuary_management_slots_v412 x
    JOIN private.sanctuary_management_forces_v412 f ON f.force_id=x.force_id JOIN private.sanctuary_management_parties_v412 p ON p.party_id=x.party_id
    WHERE x.team_id=team_id AND x.placement_locked LOOP
   IF locked.assignment_kind='RANDOM_ALT' THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'composition')q(force_doc) CROSS JOIN LATERAL jsonb_array_elements(q.force_doc->'slots')d(slot_doc)
      WHERE (q.force_doc->>'sourceForceId')::bigint=locked.force_id AND (d.slot_doc->>'partyNo')::int=locked.party_no AND (d.slot_doc->>'slotNo')::int=locked.slot_no
       AND d.slot_doc->>'assignmentKind'='RANDOM_ALT' AND (d.slot_doc->>'mainCharacterId')::bigint=locked.owner_root_character_id)
     AND NOT(coalesce(p_payload->'unlockedSlotIds','[]') @> to_jsonb(ARRAY[locked.slot_id])) THEN
     RAISE EXCEPTION '잠금된 랜덤 부캐를 이동·제거하려면 먼저 잠금을 해제해 주세요.' USING ERRCODE='22023';END IF;
    CONTINUE;
   END IF;
   SELECT x INTO s FROM jsonb_array_elements(plan->'people')x WHERE x->>'key'=CASE WHEN locked.guest_snapshot IS NOT NULL
     THEN 'g:'||(locked.guest_snapshot->>'guestId') ELSE 'c:'||locked.character_id END;
   IF s IS NULL AND NOT(coalesce(p_payload->'unlockedSlotIds','[]') @> to_jsonb(ARRAY[locked.slot_id])) THEN
    RAISE EXCEPTION '잠금된 캐릭터를 제거하려면 먼저 배치 잠금을 해제해 주세요.' USING ERRCODE='22023';END IF;
   IF s IS NOT NULL AND (s->>'locked')::boolean AND s->>'position' IS DISTINCT FROM
    (SELECT q.ordinal::text||':'||locked.party_no||':'||locked.slot_no FROM jsonb_array_elements(plan->'composition') WITH ORDINALITY q(force_doc,ordinal)
     WHERE (q.force_doc->>'sourceForceId')::bigint=locked.force_id) THEN
    RAISE EXCEPTION '배치 잠금을 해제한 뒤 위치를 변경해 주세요.' USING ERRCODE='22023';END IF;
   IF s IS NULL OR NOT coalesce((s->>'locked')::boolean,false) THEN
    UPDATE private.sanctuary_management_slots_v412 SET placement_locked=false WHERE slot_id=locked.slot_id;
   END IF;
  END LOOP;
  -- The older virtual-alt composer temporarily stages reservations as empty slots.
  -- Validate their original pins above, then restore the requested pins with the final layout.
  UPDATE private.sanctuary_management_slots_v412 SET placement_locked=false WHERE private.sanctuary_management_slots_v412.team_id=team_id AND assignment_kind='RANDOM_ALT';
  -- Stage temporary guests as genuine empty slots for the established atomic composer, then restore in this transaction.
  UPDATE private.sanctuary_management_slots_v412 SET guest_snapshot=NULL,assignment_kind='ACTUAL_CHARACTER',character_relation=NULL,
    placement_locked=false,team_family_key=NULL,team_family_role=NULL WHERE private.sanctuary_management_slots_v412.team_id=team_id AND guest_snapshot IS NOT NULL;
  desired:='[]';
  FOR f IN SELECT value FROM jsonb_array_elements(plan->'composition') LOOP
   slots:='[]';FOR s IN SELECT value FROM jsonb_array_elements(f->'slots') LOOP
    IF s->>'guestId' IS NOT NULL THEN s:=(s-array['guestId','familyRoot','familyRole','bossRoles'])||jsonb_build_object('characterId',null,'assignmentKind','ACTUAL_CHARACTER','placementLocked',false);END IF;
    IF s->>'assignmentKind'='RANDOM_ALT' THEN s:=s||jsonb_build_object('placementLocked',false);END IF;
    slots:=slots||jsonb_build_array(s);
   END LOOP;desired:=desired||jsonb_build_array(f||jsonb_build_object('slots',slots));
  END LOOP;
  payload:=p_payload||jsonb_build_object('composition',desired,'balanceProposalToken','');
  response:=public.kinojo_sanctuary_management_command_v454(p_credential,p_key,p_action,payload,p_revision);
  team_id:=(response->>'teamId')::bigint;
  PERFORM private.kinojo_sm_apply_layout_v554(team_id,plan,actor_id);
  UPDATE private.sanctuary_management_teams_v412 t SET placement_mode=mode WHERE t.team_id=team_id AND t.placement_mode IS DISTINCT FROM mode;
  PERFORM private.kinojo_sm_assert_layout_v554(team_id,compute);
  DELETE FROM private.sanctuary_management_official_candidates_v432 c WHERE c.actor_member_id=actor_id AND c.team_guest_only
   AND c.candidate_id::text IN(SELECT x->'snapshot'->>'guestId' FROM jsonb_array_elements(plan->'people')x);
 ELSIF p_action='SET_BOSS_ROLES' AND p_payload->>'guestId' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.sanctuary_management_teams_v412 t JOIN public.sanctuary_master m ON m.id=t.sanctuary_id
    WHERE t.team_id=team_id AND t.revision=p_revision AND m.code='kaldrix' AND t.status IN('ACTIVE','FULL')) THEN
   RAISE EXCEPTION '역할 대상 팀과 최신 편성을 확인해 주세요.' USING ERRCODE='40001';END IF;
  PERFORM private.kinojo_sm_assert_lease_v433(actor_id,team_id,p_payload->>'leaseToken');roles:=p_payload->'bossRoles';
  IF jsonb_typeof(roles) IS DISTINCT FROM 'object' OR jsonb_typeof(roles->'boss2') IS DISTINCT FROM 'array' OR jsonb_array_length(roles->'boss2')>2
    OR (nullif(roles->>'boss1','') IS NOT NULL AND roles->>'boss1' NOT IN('3>3','6>6','9>12','12>9'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(roles->'boss2')x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^(1[0-2]|[1-9])$') THEN
   RAISE EXCEPTION '보스 역할 형식을 확인해 주세요.' USING ERRCODE='22023';END IF;
  UPDATE private.sanctuary_management_slots_v412 x SET guest_snapshot=guest_snapshot||jsonb_build_object('bossRoles',roles)
   WHERE x.team_id=team_id AND x.slot_id=(p_payload->>'slotId')::bigint AND x.force_id=(p_payload->>'forceId')::bigint AND x.guest_snapshot->>'guestId'=p_payload->>'guestId';
  IF NOT FOUND THEN RAISE EXCEPTION '역할 대상 게스트를 다시 확인해 주세요.' USING ERRCODE='22023';END IF;
  PERFORM private.kinojo_sm_roles_guard_v554(team_id);
  UPDATE private.sanctuary_management_teams_v412 t SET revision=t.revision+1,updated_at=clock_timestamp() WHERE t.team_id=team_id RETURNING t.revision INTO revision;
  response:=jsonb_build_object('ok',true,'teamId',team_id,'action',p_action,'revision',revision,'bossRoles',roles,'replayed',false);
  INSERT INTO private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
   VALUES(actor_id,p_key,p_action,input_hash,response);
 ELSIF p_action='LEAVE_TEAM' THEN
  IF NOT EXISTS(SELECT 1 FROM private.sanctuary_management_teams_v412 t WHERE t.team_id=team_id AND t.status IN('ACTIVE','FULL')) THEN
   RAISE EXCEPTION '현재 참여 중인 팀을 확인해 주세요.' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 x WHERE x.team_id=team_id AND x.owner_member_id=actor_id
    AND EXISTS(SELECT 1 FROM private.kinojo_sm_resolve_character_owner_v412(coalesce(x.character_id,x.owner_root_character_id))o WHERE o.owner_member_id=actor_id)) THEN
   RAISE EXCEPTION '현재 본인 소유로 참가 중인 캐릭터가 없습니다.' USING ERRCODE='42501';END IF;
  -- Self-service departure always uses authenticated canonical ownership, never a team-declared family link.
  UPDATE private.sanctuary_management_support_items_v412 i SET status='CANCELLED',applied_slot_id=NULL,
    result_code='LEFT_BY_REQUESTER',result_message='참가자가 팀에서 나갔습니다.'
   WHERE i.owner_member_id=actor_id AND i.status IN('APPLIED','PENDING')
    AND EXISTS(SELECT 1 FROM private.kinojo_sm_resolve_character_owner_v412(i.character_id)o WHERE o.owner_member_id=actor_id)
    AND i.support_batch_id IN(
    SELECT b.support_batch_id FROM private.sanctuary_management_support_batches_v412 b WHERE b.team_id=team_id);
  UPDATE private.sanctuary_management_support_batches_v412 b SET status=CASE
   WHEN NOT EXISTS(SELECT 1 FROM private.sanctuary_management_support_items_v412 i WHERE i.support_batch_id=b.support_batch_id AND i.status<>'CANCELLED') THEN 'CANCELLED'
   ELSE 'PARTIAL' END,updated_at=clock_timestamp()
   WHERE b.team_id=team_id AND b.requester_member_id=actor_id AND b.status IN('APPLIED','PARTIAL','PENDING');
  UPDATE private.sanctuary_management_slots_v412 x SET character_id=NULL,owner_member_id=NULL,owner_root_character_id=NULL,
   character_relation=NULL,assignment_kind='ACTUAL_CHARACTER',placement_locked=false,team_family_key=NULL,team_family_role=NULL
   WHERE x.team_id=team_id AND x.owner_member_id=actor_id
    AND EXISTS(SELECT 1 FROM private.kinojo_sm_resolve_character_owner_v412(coalesce(x.character_id,x.owner_root_character_id))o WHERE o.owner_member_id=actor_id);
  IF mode='BALANCED' THEN
   payload:=private.kinojo_sm_read_composition_v554(team_id);
   plan:=private.kinojo_sm_composition_input_v554(payload,actor_id,team_id,'BALANCED',true);
   PERFORM private.kinojo_sm_apply_layout_v554(team_id,plan,actor_id);PERFORM private.kinojo_sm_assert_layout_v554(team_id,true);
  ELSE
   UPDATE private.sanctuary_management_teams_v412 t SET revision=t.revision+1,updated_at=clock_timestamp() WHERE t.team_id=team_id;
  END IF;
  response:=jsonb_build_object('ok',true,'teamId',team_id,'action',p_action,'replayed',false);
  PERFORM private.kinojo_sm_audit_v412(actor_id,team_id,'TEAM',team_id,p_action,NULL,jsonb_build_object('memberId',actor_id),p_key);
  INSERT INTO private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
   VALUES(actor_id,p_key,p_action,input_hash,response);
 ELSE
  response:=public.kinojo_sanctuary_management_command_v454(p_credential,p_key,p_action,p_payload,p_revision);
  team_id:=coalesce(team_id,(response->>'teamId')::bigint);
  IF NOT coalesce((response->>'replayed')::boolean,false) AND mode='BALANCED'
    AND p_action IN('SUBMIT_SUPPORT','DECIDE_SUPPORT','CANCEL_SUPPORT','SET_SLOT','MOVE_SLOT','ADD_FORCE') THEN
   IF before_roster_hash IS DISTINCT FROM(SELECT md5(coalesce(string_agg(jsonb_build_array(x.character_id,x.guest_snapshot->>'guestId',x.assignment_kind)::text,',' ORDER BY x.slot_id),''))
     FROM private.sanctuary_management_slots_v412 x WHERE x.team_id=team_id) OR p_action='ADD_FORCE' THEN
    payload:=private.kinojo_sm_read_composition_v554(team_id);
    plan:=private.kinojo_sm_composition_input_v554(payload,actor_id,team_id,'BALANCED',true);
    PERFORM private.kinojo_sm_apply_layout_v554(team_id,plan,actor_id);
    PERFORM private.kinojo_sm_assert_layout_v554(team_id,true);
   END IF;
  END IF;
  IF p_action='ARCHIVE_TEAM' THEN
   UPDATE private.sanctuary_management_slots_v412 x SET guest_snapshot=NULL,assignment_kind='ACTUAL_CHARACTER',
    character_relation=NULL,team_family_key=NULL,team_family_role=NULL,placement_locked=false WHERE x.team_id=team_id AND x.guest_snapshot IS NOT NULL;
   DELETE FROM private.sanctuary_management_official_candidates_v432 c WHERE c.team_id=team_id AND c.team_guest_only;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 x WHERE x.guest_snapshot IS NOT NULL) THEN
  PERFORM private.kinojo_sm_guest_schedule_guard_v554(team_id);
 END IF;
 IF p_action<>'SAVE_COMPOSITION' THEN PERFORM private.kinojo_sm_roles_guard_v554(team_id);END IF;
 IF p_action<>'ARCHIVE_TEAM' AND plan IS NOT NULL THEN PERFORM private.kinojo_sm_recompute_status_v412(team_id);PERFORM private.kinojo_sm_recompute_status_v450(team_id);END IF;
 SELECT t.revision INTO revision FROM private.sanctuary_management_teams_v412 t WHERE t.team_id=team_id;
 IF response->'batch'->>'supportBatchId' IS NOT NULL THEN
  response:=response||jsonb_build_object('batch',private.kinojo_sm_support_batch_payload_v436((response->'batch'->>'supportBatchId')::bigint));
 END IF;
 response:=(response-'composition')||jsonb_build_object('revision',revision,'placementMode',coalesce(mode,'MANUAL'));
 UPDATE private.sanctuary_management_commands_v412 c SET input_hash_v554=input_hash,response_payload=response WHERE c.actor_member_id=actor_id AND c.request_key=p_key;
 IF plan IS NOT NULL AND p_action='SAVE_COMPOSITION' THEN response:=response||jsonb_build_object('composition',plan->'composition');END IF;
 RETURN response;
END
$f$;

-- Resolve all participant values on Server. The client supplies identity/placement, never trusted power or ownership.
CREATE FUNCTION private.kinojo_sm_composition_input_v554(p_payload jsonb,p_actor bigint,p_team bigint,p_mode text,p_balance boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='pg_catalog' AS $f$
DECLARE forces jsonb:=p_payload->'composition';force_item jsonb;slot_item jsonb;new_forces jsonb:='[]';new_slots jsonb;
 people jsonb:='[]';positions jsonb:='[]';person jsonb;guest jsonb;candidate private.sanctuary_management_official_candidates_v432%rowtype;
 cm public.character_master%rowtype;existing private.sanctuary_management_slots_v412%rowtype;
 fn integer;pn integer;sn integer;minimum integer;position text;identity text;family text;role text;layout jsonb;
 output jsonb:='[]';slot_out jsonb;assignment jsonb;key text;root text;original_force integer;
BEGIN
 IF jsonb_typeof(forces) IS DISTINCT FROM 'array' OR jsonb_array_length(forces) NOT BETWEEN 1 AND 9 THEN
  RAISE EXCEPTION '포스를 1~9개 선택해 주세요.' USING ERRCODE='22023';END IF;
 FOR force_item,fn IN SELECT value,ordinality::int FROM jsonb_array_elements(forces) WITH ORDINALITY LOOP
  IF jsonb_typeof(force_item->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(force_item->'slots')<>10
   OR (SELECT count(DISTINCT (s->>'partyNo')||':'||(s->>'slotNo')) FROM jsonb_array_elements(force_item->'slots')s)<>10 THEN
   RAISE EXCEPTION '각 포스의 10개 자리를 확인해 주세요.' USING ERRCODE='22023';END IF;
  minimum:=private.kinojo_sm_min_item_level_v452((SELECT id FROM public.sanctuary_master WHERE code=p_payload->>'sanctuaryCode'),coalesce(force_item->>'difficulty','NORMAL'));
  new_slots:='[]';
  FOR slot_item IN SELECT value FROM jsonb_array_elements(force_item->'slots') LOOP
   pn:=(slot_item->>'partyNo')::int;sn:=(slot_item->>'slotNo')::int;position:=fn||':'||pn||':'||sn;
   IF pn NOT IN(1,2) OR sn NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION '파티·슬롯 번호를 확인해 주세요.' USING ERRCODE='22023';END IF;
   positions:=positions||jsonb_build_array(jsonb_build_object('position',position,'force',fn,'party',pn,'slot',sn,
    'class',coalesce(slot_item->>'requiredClassCode','ALL'),'minimum',minimum));
   person:=NULL;guest:=NULL;existing:=NULL;
   IF slot_item->>'guestId' IS NOT NULL THEN
    SELECT * INTO existing FROM private.sanctuary_management_slots_v412
     WHERE team_id=p_team AND guest_snapshot->>'guestId'=slot_item->>'guestId';
    guest:=existing.guest_snapshot;
    IF guest IS NULL THEN
     SELECT * INTO candidate FROM private.sanctuary_management_official_candidates_v432
      WHERE candidate_id=(slot_item->>'guestId')::uuid AND actor_member_id=p_actor AND team_id IS NOT DISTINCT FROM p_team
       AND state='VERIFIED' AND expires_at>clock_timestamp();
     IF NOT FOUND THEN RAISE EXCEPTION '게스트 조회 결과가 만료되었습니다. 다시 조회해 주세요.' USING ERRCODE='22023';END IF;
     guest:=jsonb_build_object('guestId',candidate.candidate_id,'characterName',candidate.character_name,'serverId',candidate.server_id,
      'serverName',candidate.server_name,'className',candidate.class_name,'profileImageUrl',candidate.profile_image_url,
      'power',candidate.official_payload->'pveCombatPower','itemLevel',candidate.official_payload->'pveItemLevel',
      'canonicalRoot',candidate.official_payload->'canonicalRoot','verifiedAt',candidate.created_at);
    END IF;
    key:='g:'||(guest->>'guestId');identity:=(guest->>'serverId')||':'||public.kinojo_character_identity_key_v298(guest->>'characterName');
    family:=coalesce(nullif(slot_item->>'familyRoot',''),existing.team_family_key,key);role:=coalesce(slot_item->>'familyRole',existing.team_family_role,'MAIN');
    person:=jsonb_build_object('key',key,'identity',identity,'family',family,'role',role,'power',guest->'power',
      'itemLevel',guest->'itemLevel','class',private.kinojo_sm_class_code_v450(guest->>'className'),
      'canonicalRoot',guest->'canonicalRoot','snapshot',guest);
   ELSIF nullif(slot_item->>'characterId','') IS NOT NULL THEN
    SELECT * INTO cm FROM public.character_master WHERE id=(slot_item->>'characterId')::bigint AND coalesce(is_active,true) AND identity_status='CURRENT';
    IF NOT FOUND THEN RAISE EXCEPTION '캐릭터 신원을 다시 확인해 주세요.' USING ERRCODE='22023';END IF;
    SELECT * INTO existing FROM private.sanctuary_management_slots_v412 WHERE team_id=p_team AND character_id=cm.id;
    key:='c:'||cm.id;family:=coalesce(nullif(slot_item->>'familyRoot',''),existing.team_family_key,'m:'||coalesce(cm.main_character_id,cm.id));
    role:=coalesce(slot_item->>'familyRole',existing.team_family_role,CASE WHEN coalesce(cm.main_character_id,cm.id)=cm.id THEN 'MAIN' ELSE 'ALT' END);
    person:=jsonb_build_object('key',key,'identity',cm.server_id||':'||public.kinojo_character_identity_key_v298(cm.character_name),
      'family',family,'role',role,'power',cm.latest_pve_combat_power,'itemLevel',cm.latest_pve_item_level,
      'class',private.kinojo_sm_class_code_v450(cm.class_name),'canonicalRoot',coalesce(cm.main_character_id,cm.id));
   ELSIF slot_item->>'assignmentKind'='RANDOM_ALT' THEN
    IF p_mode='BALANCED' OR p_balance THEN RAISE EXCEPTION '균형 배치에서는 랜덤 부캐를 사용할 수 없습니다. 실제 부캐를 선택해 주세요.' USING ERRCODE='22023';END IF;
   END IF;
   IF person IS NOT NULL THEN
    IF person->>'class' IS NULL OR role NOT IN('MAIN','ALT') OR length(family)>100 THEN
     RAISE EXCEPTION '본캐·부캐 연결과 클래스를 확인해 주세요.' USING ERRCODE='22023';END IF;
    person:=person||jsonb_build_object('position',position,'locked',coalesce((slot_item->>'placementLocked')::boolean,false),'input',slot_item,'originalForce',fn,
      'familyExplicit',guest IS NOT NULL OR slot_item->>'familyRoot' IS NOT NULL OR existing.team_family_key IS NOT NULL OR p_mode='BALANCED');
    people:=people||jsonb_build_array(person);
   END IF;
   new_slots:=new_slots||jsonb_build_array(slot_item);
  END LOOP;
  new_forces:=new_forces||jsonb_build_array(force_item||jsonb_build_object('slots',new_slots));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p GROUP BY p->>'identity' HAVING count(*)>1) THEN
  RAISE EXCEPTION '같은 캐릭터를 한 팀에 중복 배치할 수 없습니다.' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE p->>'family' !~ '^(c:[1-9][0-9]*|m:[1-9][0-9]*|g:[0-9a-fA-F-]{36})$'
  OR(left(p->>'family',2)='m:' AND p->>'family' IS DISTINCT FROM 'm:'||(p->>'canonicalRoot'))
  OR(left(p->>'family',2) IN('c:','g:') AND p->>'role'='MAIN' AND p->>'family'<>p->>'key')) THEN
  RAISE EXCEPTION '팀 안의 본캐·부캐 연결 대상을 다시 선택해 주세요.' USING ERRCODE='22023';END IF;
 -- Explicit links are roots already in this draft, or existing persisted opaque group keys.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE left(p->>'family',2) IN('c:','g:')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people)r WHERE r->>'key'=p->>'family' AND r->>'family'=r->>'key' AND r->>'role'='MAIN')
   AND NOT EXISTS(SELECT 1 FROM private.sanctuary_management_slots_v412 s WHERE s.team_id=p_team AND s.team_family_key=p->>'family')) THEN
  RAISE EXCEPTION '팀 안의 본캐를 먼저 선택해 주세요. 순환 연결은 사용할 수 없습니다.' USING ERRCODE='22023';END IF;
 IF p_balance THEN layout:=private.kinojo_sm_balance_layout_v554(people,positions,coalesce(p_payload->>'balanceSeed','team:'||coalesce(p_team::text,'new')));
 ELSE SELECT coalesce(jsonb_agg(jsonb_build_object('position',p->>'position','key',p->>'key')),'[]') INTO layout FROM jsonb_array_elements(people)p;END IF;
 FOR force_item,fn IN SELECT value,ordinality::int FROM jsonb_array_elements(new_forces) WITH ORDINALITY LOOP
  new_slots:='[]';
  FOR slot_item IN SELECT value FROM jsonb_array_elements(force_item->'slots') LOOP
   position:=fn||':'||(slot_item->>'partyNo')||':'||(slot_item->>'slotNo');
   SELECT l INTO assignment FROM jsonb_array_elements(layout)l WHERE l->>'position'=position;
   slot_out:=slot_item-array['characterId','mainCharacterId','guestId','familyRoot','familyRole','bossRoles'];
   IF assignment IS NOT NULL THEN
    SELECT p INTO person FROM jsonb_array_elements(people)p WHERE p->>'key'=assignment->>'key';
    slot_out:=slot_out||jsonb_build_object('characterId',CASE WHEN left(person->>'key',2)='c:' THEN (substring(person->>'key' FROM 3))::bigint ELSE NULL END,
      'guestId',person->'snapshot'->>'guestId','assignmentKind',CASE WHEN person->'snapshot' IS NOT NULL THEN 'TEAM_GUEST' ELSE 'ACTUAL_CHARACTER' END,
      'familyRoot',CASE WHEN (person->>'familyExplicit')::boolean THEN person->>'family' END,
      'familyRole',CASE WHEN (person->>'familyExplicit')::boolean THEN person->>'role' END,'placementLocked',person->'locked',
      'bossRoles',CASE WHEN (person->>'originalForce')::int=fn THEN coalesce(person->'input'->'bossRoles','{"boss1":null,"boss2":[]}'::jsonb) ELSE '{"boss1":null,"boss2":[]}'::jsonb END);
   ELSIF NOT p_balance AND slot_item->>'assignmentKind'='RANDOM_ALT' THEN slot_out:=slot_item;
   ELSE slot_out:=slot_out||jsonb_build_object('characterId',null,'assignmentKind','ACTUAL_CHARACTER','placementLocked',false);END IF;
   new_slots:=new_slots||jsonb_build_array(slot_out);
  END LOOP;
  output:=output||jsonb_build_array(force_item||jsonb_build_object('slots',new_slots));
 END LOOP;
 RETURN jsonb_build_object('composition',output,'people',people);
END
$f$;

-- Current authority patches, exact source guarded.
DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.kinojo_sanctuary_management_command_v2(text,text,text,jsonb,bigint)'::regprocedure) <> '017250a1c14812f3b5fbb14ba11f4d6d' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sanctuary_management_command_v2';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v2(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor jsonb;v_member bigint;v_action text:=upper(btrim(coalesce(p_action,'')));
 v_team_id bigint;v_resolved bigint;v_caps jsonb;v_before jsonb;v_after jsonb;v_result jsonb;
 v_hash text;v_receipt private.sanctuary_management_commands_v412%rowtype;v_revision bigint;v_force_no integer;v_role_composition jsonb;
 v_pending bigint[];v_pending_items bigint[];v_cancelled boolean:=false;v_domain text;v_composite boolean;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);
 v_member:=nullif(v_actor->>'memberId','')::bigint;
 if v_member is null then raise exception '로그인 세션을 확인해 주세요.' using errcode='42501'; end if;
 if v_action not in ('CREATE_TEAM','SAVE_COMPOSITION','ADD_FORCE','SET_SLOT','MOVE_SLOT','SET_SCHEDULE',
   'EDIT_SCHEDULE','PUBLISH_TEAM','UPDATE_TEAM_DRAFT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM',
   'SUBMIT_SUPPORT','DECIDE_SUPPORT','CANCEL_SUPPORT','ARCHIVE_TEAM','SET_BOSS_ROLES','LEAVE_TEAM') then
   raise exception '지원하지 않는 팀 작업입니다.' using errcode='22023';
 end if;
 v_team_id:=nullif(p_payload->>'teamId','')::bigint;
 if v_action in ('DECIDE_SUPPORT','CANCEL_SUPPORT') then
   select team_id into v_resolved from private.sanctuary_management_support_batches_v412
    where support_batch_id=nullif(p_payload->>'supportBatchId','')::bigint;
 elsif v_action='SET_SLOT' then
   select team_id into v_resolved from private.sanctuary_management_forces_v412 where force_id=nullif(p_payload->>'forceId','')::bigint;
 elsif v_action='MOVE_SLOT' then
   select team_id into v_resolved from private.sanctuary_management_slots_v412 where slot_id=nullif(p_payload->>'fromSlotId','')::bigint;
 end if;
 if v_action in ('DECIDE_SUPPORT','CANCEL_SUPPORT','SET_SLOT','MOVE_SLOT') then
   if v_resolved is null or (v_team_id is not null and v_team_id<>v_resolved) then
     raise exception '팀과 포스 정보를 다시 확인해 주세요.' using errcode='22023';
   end if;
   v_team_id:=v_resolved;
 end if;
 -- Configuration changes serialize against this transaction; operator changes share the team lock.
 lock table public.sanctuary_role_permissions in share mode;
 if v_team_id is not null then
   perform 1 from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
   if not found then raise exception '팀을 찾을 수 없습니다.' using errcode='22023'; end if;
 end if;
 v_caps:=private.kinojo_sm_capabilities(v_member,v_team_id);
 v_composite:=v_action in ('SAVE_COMPOSITION','UPDATE_TEAM_DRAFT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM');
 if v_action='CREATE_TEAM' or (v_action='SAVE_COMPOSITION' and v_team_id is null) then
   perform private.kinojo_sm_assert_capability(v_caps,'create');
 elsif v_action in ('SUBMIT_SUPPORT','CANCEL_SUPPORT','LEAVE_TEAM') then
   -- Existing command validates current character ownership/requester, eligibility, and duplicates.
   null;
 elsif v_composite then
   if not ((v_caps->'canEditInfo')='true'::jsonb or (v_caps->'canEditRoster')='true'::jsonb or (v_caps->'canManageSchedule')='true'::jsonb) then
     raise exception '이 팀을 편집할 권한이 없습니다.' using errcode='42501';
   end if;
   v_before:=private.kinojo_sm_permission_snapshot(v_team_id);
   select coalesce(array_agg(support_batch_id),'{}'::bigint[]) into v_pending
     from private.sanctuary_management_support_batches_v412 where team_id=v_team_id and status='PENDING';
   select coalesce(array_agg(item.support_item_id),'{}'::bigint[]) into v_pending_items
     from private.sanctuary_management_support_items_v412 item
     join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id=item.support_batch_id
     where batch.team_id=v_team_id and item.status='PENDING';
 else
   v_domain:=case when v_action in ('ADD_FORCE','SET_SLOT','MOVE_SLOT','SET_BOSS_ROLES') then 'roster'
     when v_action in ('SET_SCHEDULE','EDIT_SCHEDULE') then 'schedule'
     when v_action='PUBLISH_TEAM' then 'info' when v_action='DECIDE_SUPPORT' then 'support'
     when v_action='ARCHIVE_TEAM' then 'archive' end;
   perform private.kinojo_sm_assert_capability(v_caps,v_domain);
 end if;

 -- Role-only update: same authenticated command, lease, revision and receipt boundary.
 if v_action='SET_BOSS_ROLES' and p_payload->>'guestId' is null then
   perform private.kinojo_sm_assert_pilot_write_v439(p_credential,v_action);
   if v_team_id is null or not exists(select 1 from private.sanctuary_management_teams_v412 t
     join public.sanctuary_master m on m.id=t.sanctuary_id where t.team_id=v_team_id and m.code='kaldrix' and t.status in ('ACTIVE','FULL')) then
     raise exception '역할 부여는 성역3의 운영 중인 팀에서만 사용할 수 있습니다.' using errcode='22023';
   end if;
   if btrim(coalesce(p_request_key,'')) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
     raise exception '요청 키를 다시 확인해 주세요.' using errcode='22023';
   end if;
   v_hash:=encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text,'UTF8')),'hex');
   perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_member||':'||btrim(p_request_key),446));
   select * into v_receipt from private.sanctuary_management_commands_v412
     where actor_member_id=v_member and request_key=btrim(p_request_key);
   if v_receipt.command_id is not null then
     if v_receipt.action<>v_action or v_receipt.request_hash<>v_hash then
       raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='22023';
     end if;
     return v_receipt.response_payload||jsonb_build_object('replayed',true,'permissionContract','SANCTUARY_PERMISSIONS_V2');
   end if;
   select revision into v_revision from private.sanctuary_management_teams_v412 where team_id=v_team_id;
   if p_expected_revision is null or v_revision<>p_expected_revision then
     raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001';
   end if;
   perform private.kinojo_sm_assert_lease_v433(v_member,v_team_id,p_payload->>'leaseToken');
   select f.force_no into v_force_no from private.sanctuary_management_forces_v412 f
     join private.sanctuary_management_slots_v412 s on s.force_id=f.force_id and s.team_id=f.team_id
     where f.team_id=v_team_id and f.force_id=nullif(p_payload->>'forceId','')::bigint
       and s.slot_id=nullif(p_payload->>'slotId','')::bigint
       and s.character_id=nullif(p_payload->>'characterId','')::bigint
       and coalesce(s.assignment_kind,'ACTUAL_CHARACTER')='ACTUAL_CHARACTER';
   if v_force_no is null or jsonb_typeof(p_payload->'bossRoles') is distinct from 'object' then
     raise exception '역할 대상 캐릭터와 포스를 다시 확인해 주세요.' using errcode='22023';
   end if;
   select jsonb_agg(jsonb_build_object('slots',case when n=v_force_no then
     jsonb_build_array(jsonb_build_object('characterId',p_payload->'characterId','bossRoles',p_payload->'bossRoles')) else '[]'::jsonb end) order by n)
     into v_role_composition from generate_series(1,v_force_no) n;
   perform private.kinojo_sm_save_boss_roles_v536(v_member,v_team_id,v_role_composition,btrim(p_request_key));
   update private.sanctuary_management_teams_v412 set revision=revision+1,updated_at=clock_timestamp()
     where team_id=v_team_id returning revision into v_revision;
   v_result:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',v_revision,
     'bossRoles',private.kinojo_sm_boss_roles_v536(v_team_id,v_force_no,nullif(p_payload->>'characterId','')::bigint),
     'replayed',false,'permissionContract','SANCTUARY_PERMISSIONS_V2');
   insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
     values(v_member,btrim(p_request_key),v_action,v_hash,v_result);
   return v_result;
 end if;

 v_result:=private.kinojo_sm_command_layout_v554(p_credential,p_request_key,v_action,p_payload,p_expected_revision);
 if coalesce((v_result->>'replayed')::boolean,false) is false then
   perform private.kinojo_sm_save_boss_roles_v536(v_member,coalesce(v_team_id,nullif(v_result->>'teamId','')::bigint),case when v_action='SAVE_COMPOSITION' then coalesce(v_result->'composition',p_payload->'composition') else null end,p_request_key);
 end if;
 perform private.kinojo_sm_roles_guard_v554(coalesce(v_team_id,nullif(v_result->>'teamId','')::bigint));
 if v_before is not null then
   v_after:=private.kinojo_sm_permission_snapshot(v_team_id);
   select exists(select 1 from private.sanctuary_management_support_batches_v412
     where support_batch_id=any(v_pending) and status<>'PENDING')
     or exists(select 1 from private.sanctuary_management_support_items_v412
     where support_item_id=any(v_pending_items) and status<>'PENDING') into v_cancelled;
   foreach v_domain in array private.kinojo_sm_changed_domains(v_before,v_after,v_cancelled) loop
     perform private.kinojo_sm_assert_capability(v_caps,v_domain);
   end loop;
 end if;
 -- A failed postcondition raises in the SAME transaction: composition, cancellation, audit,
 -- and idempotency receipt all roll back. No external calls occur inside the delegate.
 return (v_result-'composition')||jsonb_build_object('permissionContract','SANCTUARY_PERMISSIONS_V2');
end;
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_permission_snapshot(bigint)'::regprocedure) <> 'cdd4c401070662f048a63dfed9571e29' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_permission_snapshot';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_permission_snapshot(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'info',jsonb_build_object('sanctuaryId',t.sanctuary_id,'title',t.title,'activity',t.activity,
   'teamMode',t.team_mode,'joinPolicy',t.join_policy,'published',t.published_at is not null),
 'roster',jsonb_build_object('placementMode',t.placement_mode,
   'bossRoles',(select coalesce(jsonb_agg(to_jsonb(b) order by b.force_no,b.character_id,b.boss,b.ordinal),'[]'::jsonb) from private.sanctuary_boss_roles_v536 b where b.team_id=t.team_id),
   'forces',(select coalesce(jsonb_agg(jsonb_build_object('forceId',f.force_id,'forceNo',f.force_no,'capacity',f.capacity,'difficulty',f.difficulty) order by f.force_id),'[]'::jsonb) from private.sanctuary_management_forces_v412 f where f.team_id=t.team_id),
   'slots',(select coalesce(jsonb_agg((to_jsonb(s)-array['revision','created_at','updated_at','added_by_member_id']) order by s.slot_id),'[]'::jsonb) from private.sanctuary_management_slots_v412 s where s.team_id=t.team_id),
   'rules',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(r)-array['composition_rule_id','revision','created_at','updated_at','created_by_member_id','updated_by_member_id'] value
     from private.sanctuary_management_composition_rules_v449 r where r.team_id=t.team_id) c)),
 'schedule',jsonb_build_object(
   'rules',(select coalesce(jsonb_agg((to_jsonb(r)-array['revision','created_at','updated_at']) order by r.schedule_id),'[]'::jsonb) from private.sanctuary_management_schedule_rules_v412 r where r.team_id=t.team_id),
   'versions',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(v)-array['schedule_version_id','revision','created_at','created_by_member_id'] value from private.sanctuary_management_schedule_versions_v437 v where v.team_id=t.team_id) c),
   'exceptions',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(e)-array['exception_id','created_at','created_by_member_id'] value from private.sanctuary_management_schedule_exceptions_v412 e
     join private.sanctuary_management_schedule_rules_v412 r on r.schedule_id=e.schedule_id where r.team_id=t.team_id) c)))
from private.sanctuary_management_teams_v412 t where t.team_id=p_team_id;
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_audit_v412(bigint,bigint,text,bigint,text,jsonb,jsonb,text)'::regprocedure) <> 'b7b215ea30fcedb56e2dc8acff98be95' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_audit_v412';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_audit_v412(p_actor_member_id bigint, p_team_id bigint, p_entity_type text, p_entity_id bigint, p_action text, p_before jsonb, p_after jsonb, p_request_key text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  insert into private.sanctuary_management_audit_events_v412(
    actor_member_id,team_id,entity_type,entity_id,action,before_payload,after_payload,request_key
  ) values(p_actor_member_id,p_team_id,p_entity_type,p_entity_id,p_action,private.kinojo_sm_redact_guest_audit_v554(p_before),private.kinojo_sm_redact_guest_audit_v554(p_after),p_request_key)
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_force_roster_v451(bigint)'::regprocedure) <> '7ee9a1735e299ecc56631f4e0379070e' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_force_roster_v451';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_force_roster_v451(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v450(p_team_id);
  v_forces jsonb := '[]'::jsonb;
  v_parties jsonb;
  v_slots jsonb;
  v_force jsonb;
  v_party jsonb;
  v_slot jsonb;
  v_locked boolean;
begin
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    v_parties := '[]'::jsonb;
    for v_party in select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item) loop
      v_slots := '[]'::jsonb;
      for v_slot in select item from jsonb_array_elements(coalesce(v_party->'slots', '[]'::jsonb)) source(item) loop
        select placement_locked into strict v_locked
        from private.sanctuary_management_slots_v412
        where slot_id = nullif(v_slot->>'slotId', '')::bigint;
        v_slots := v_slots || jsonb_build_array(v_slot || jsonb_build_object('placementLocked', v_locked));
      end loop;
      v_parties := v_parties || jsonb_build_array((v_party - 'slots') || jsonb_build_object('slots', v_slots));
    end loop;
    v_forces := v_forces || jsonb_build_array((v_force - 'parties') || jsonb_build_object('parties', v_parties));
  end loop;
  return private.kinojo_sm_roster_enrich_v554(p_team_id,(v_roster - 'forces') || jsonb_build_object('forces', v_forces));
end
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_public_force_roster_v448(bigint)'::regprocedure) <> 'bd2c6f64cfa608807de8b1f81cdbcd76' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_public_force_roster_v448';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_public_force_roster_v448(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
begin
  v_roster := private.kinojo_sm_force_roster_v430(p_team_id);
  for v_force in
    select force_item
      from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) force_list(force_item)
  loop
    v_forces := v_forces || jsonb_build_array(
      v_force || jsonb_build_object(
        'creatorMemberId', null,
        'creatorOwnerResolved', false,
        'creatorAlreadyAssigned', false,
        'creatorCandidateCode', 'LOGIN_REQUIRED',
        'creatorCandidateCount', 0,
        'creatorCandidates', '[]'::jsonb,
        'viewerAlreadyAssigned', false,
        'viewerPending', false,
        'canSupport', false,
        'supportDisabledCode', 'LOGIN_REQUIRED',
        'supportDisabledMessage', '로그인 후 지원할 수 있습니다.'
      )
    );
  end loop;
  return private.kinojo_sm_roster_enrich_v554(p_team_id,jsonb_set(v_roster, '{forces}', v_forces, true));
end;
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_recompute_status_v412(bigint)'::regprocedure) <> '206873bdee5bc1f65308f75df0f8fe05' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_recompute_status_v412';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_recompute_status_v412(p_team_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare v_full boolean;
begin
  select count(*)>0 and bool_and(used_count>=10) into v_full
  from (
    select f.force_id,count(*) filter(where s.character_id is not null or s.assignment_kind in('RANDOM_ALT','TEAM_GUEST')) used_count
    from private.sanctuary_management_forces_v412 f
    join private.sanctuary_management_slots_v412 s on s.force_id=f.force_id
    where f.team_id=p_team_id group by f.force_id
  ) q;
  update private.sanctuary_management_forces_v412 f set status=case when x.used_count>=10 then 'FULL' else 'OPEN' end
  from (select force_id,count(*) filter(where character_id is not null or assignment_kind in('RANDOM_ALT','TEAM_GUEST')) used_count from private.sanctuary_management_slots_v412 where team_id=p_team_id group by force_id) x
  where f.force_id=x.force_id and f.status<>'CLOSED'
    and f.status is distinct from case when x.used_count>=10 then 'FULL' else 'OPEN' end;
  update private.sanctuary_management_teams_v412
  set status=case when status='ARCHIVED' then status when v_full then 'FULL' when published_at is null then 'DRAFT' else 'ACTIVE' end
  where team_id=p_team_id
    and status is distinct from case when status='ARCHIVED' then status when v_full then 'FULL' when published_at is null then 'DRAFT' else 'ACTIVE' end;
end
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_recompute_status_v450(bigint)'::regprocedure) <> '279996926e7c4819105a4aaaf8a6e719' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_recompute_status_v450';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_recompute_status_v450(p_team_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer;
  v_occupied integer;
begin
  select count(*)::integer,
         count(*) filter (where character_id is not null or assignment_kind in ('RANDOM_ALT','TEAM_GUEST'))::integer
    into v_total, v_occupied
    from private.sanctuary_management_slots_v412
   where team_id = p_team_id;
  update private.sanctuary_management_teams_v412
     set status = case when v_total > 0 and v_total = v_occupied then 'FULL' else 'ACTIVE' end,
         updated_at = clock_timestamp()
   where team_id = p_team_id and status in ('ACTIVE', 'FULL');
end
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_scope_requirements_v452(bigint,bigint,bigint)'::regprocedure) <> '7ad17c86fe5ba9097eb92fab16009488' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_scope_requirements_v452';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_scope_requirements_v452(p_team_id bigint, p_force_id bigint, p_party_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with scoped_rules as (
    select rule.*
    from private.sanctuary_management_composition_rules_v449 rule
    where rule.team_id = p_team_id
      and rule.force_id = p_force_id
      and (
        (p_party_id is null and rule.scope_type = 'FORCE' and rule.party_id is null)
        or (p_party_id is not null and rule.scope_type = 'PARTY' and rule.party_id = p_party_id)
      )
  ), evaluated as (
    select rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold,
      count(slot.slot_id) filter (
        where (slot.character_id is not null or slot.guest_snapshot is not null) and (
          (rule.rule_type = 'MAIN_MIN' and (coalesce(slot.team_family_role,case when slot.character_relation='MAIN' or coalesce(character.is_main,false) then 'MAIN' else 'ALT' end)='MAIN'))
          or (rule.rule_type = 'POWER_MIN' and coalesce((slot.guest_snapshot->>'power')::integer,character.latest_pve_combat_power) >= rule.power_threshold)
          or (rule.rule_type = 'ITEM_LEVEL_MIN' and coalesce((slot.guest_snapshot->>'itemLevel')::integer,character.latest_pve_item_level) >= rule.item_level_threshold)
        )
      )::integer matching_count
    from scoped_rules rule
    left join private.sanctuary_management_slots_v412 slot
      on slot.team_id = p_team_id and slot.force_id = p_force_id
     and (p_party_id is null or slot.party_id = p_party_id)
    left join public.character_master character on character.id = slot.character_id
    group by rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold
  )
  select jsonb_build_object(
    'satisfied', coalesce(bool_and(matching_count >= minimum_count), true),
    'ruleCount', count(composition_rule_id)::integer,
    'unsatisfiedCount', count(composition_rule_id) filter (where matching_count < minimum_count)::integer,
    'rules', coalesce(jsonb_agg(jsonb_build_object(
      'compositionRuleId', composition_rule_id,
      'scopeType', scope_type,
      'ruleType', rule_type,
      'minimumCount', minimum_count,
      'powerThreshold', power_threshold,
      'itemLevelThreshold', item_level_threshold,
      'matchingCount', matching_count,
      'satisfied', matching_count >= minimum_count,
      'message', case
        when rule_type = 'MAIN_MIN' then '본캐 ' || minimum_count || '명 이상'
        when rule_type = 'POWER_MIN' then '전투력 ' || trim(to_char(power_threshold / 1000.0, 'FM999999990.0')) || 'K 이상 ' || minimum_count || '명 이상'
        else '아이템레벨 ' || item_level_threshold || ' 이상 ' || minimum_count || '명 이상'
      end
    ) order by rule_type), '[]'::jsonb)
  ) from evaluated
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.kinojo_sanctuary_management_command_v412(text,text,text,jsonb,bigint)'::regprocedure) <> 'f2b32267f487546802d3b56f8b8a63d1' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sanctuary_management_command_v412';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v412(p_credential text, p_request_key text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_action text:=upper(btrim(coalesce(p_action,''))); v_request_key text:=btrim(coalesce(p_request_key,''));
  v_hash text; v_existing record; v_response jsonb; v_team private.sanctuary_management_teams_v412%rowtype;
  v_team_id bigint; v_force_id bigint; v_force_no smallint; v_party_no smallint; v_slot_no smallint; v_slot_id bigint;
  v_schedule_id bigint; v_sanctuary public.sanctuary_master%rowtype; v_owner record; v_conflicts jsonb; v_before jsonb;
  v_mode text; v_policy text; v_kind text; v_starts_on date; v_weekdays smallint[]; v_starts_at time; v_duration integer;
  v_character_id bigint; v_force_ids bigint[]; v_character_ids bigint[]; v_i integer; v_batch_id bigint;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode='P0001'; end if;
  if v_action not in ('CREATE_TEAM','ADD_FORCE','SET_SCHEDULE','SET_SLOT','PUBLISH_TEAM','SUBMIT_SUPPORT','DECIDE_SUPPORT','ARCHIVE_TEAM') then
    raise exception '지원하지 않는 성역 관리 작업입니다.' using errcode='P0001';
  end if;
  v_hash:=encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_actor_id||':'||v_request_key,412));
  select * into v_existing from private.sanctuary_management_commands_v412 where actor_member_id=v_actor_id and request_key=v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash<>v_hash or v_existing.action<>v_action then raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='P0001'; end if;
    return v_existing.response_payload||jsonb_build_object('replayed',true);
  end if;

  if v_action='CREATE_TEAM' then
    select * into v_sanctuary from public.sanctuary_master where code=btrim(p_payload->>'sanctuaryCode') and management_visible;
    if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode='P0001'; end if;
    v_mode:=upper(coalesce(p_payload->>'mode',''));
    v_policy:=upper(coalesce(p_payload->>'joinPolicy','INSTANT'));
    v_kind:=upper(coalesce(p_payload->'schedule'->>'kind',''));
    v_starts_on=nullif(p_payload->'schedule'->>'startsOn','')::date;
    v_weekdays=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays','[]'::jsonb))::smallint),'{}'::smallint[]);
    v_starts_at=nullif(p_payload->'schedule'->>'startsAt','')::time;
    v_duration=coalesce(nullif(p_payload->'schedule'->>'durationMinutes','')::integer,30);
    if v_starts_on is null or v_starts_at is null then raise exception '팀 일정의 날짜와 시작 시각이 필요합니다.' using errcode='P0001'; end if;
    if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;
    insert into private.sanctuary_management_teams_v412(sanctuary_id,title,activity,team_mode,join_policy,creator_member_id)
    values(v_sanctuary.id,btrim(p_payload->>'title'),btrim(p_payload->>'activity'),v_mode,case when v_mode='FIXED' then 'INSTANT' else v_policy end,v_actor_id)
    returning * into v_team;
    v_team_id:=v_team.team_id;
    perform private.kinojo_sm_seed_force_v412(v_team_id,1);
    insert into private.sanctuary_management_schedule_rules_v412(team_id,schedule_kind,starts_on,weekdays,starts_at,duration_minutes)
    values(v_team_id,v_kind,v_starts_on,v_weekdays,v_starts_at,v_duration) returning schedule_id into v_schedule_id;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'scheduleId',v_schedule_id,'revision',v_team.revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,null,to_jsonb(v_team),v_request_key);

  elsif v_action='ADD_FORCE' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    select coalesce(max(force_no),0)+1 into v_force_no from private.sanctuary_management_forces_v412 where team_id=v_team_id;
    if v_force_no>9 then raise exception '팀당 포스는 최대 9개입니다.' using errcode='P0001'; end if;
    v_force_id:=private.kinojo_sm_seed_force_v412(v_team_id,v_force_no);
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'forceId',v_force_id,'forceNo',v_force_no,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'FORCE',v_force_id,v_action,null,v_response,v_request_key);

  elsif v_action='SET_SCHEDULE' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀 일정을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    v_kind:=upper(coalesce(p_payload->>'kind','')); v_starts_on=nullif(p_payload->>'startsOn','')::date;
    v_weekdays=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'weekdays','[]'::jsonb))::smallint),'{}'::smallint[]);
    v_starts_at=nullif(p_payload->>'startsAt','')::time; v_duration=coalesce(nullif(p_payload->>'durationMinutes','')::integer,30);
    select s.* into v_sanctuary from public.sanctuary_master s where s.id=v_team.sanctuary_id;
    if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;
    select to_jsonb(s),s.schedule_id into v_before,v_schedule_id from private.sanctuary_management_schedule_rules_v412 s where team_id=v_team_id for update;
    update private.sanctuary_management_schedule_rules_v412 set schedule_kind=v_kind,starts_on=v_starts_on,weekdays=v_weekdays,starts_at=v_starts_at,duration_minutes=v_duration,status='ACTIVE' where schedule_id=v_schedule_id;
    select coalesce(jsonb_agg(c),'[]'::jsonb) into v_conflicts from (
      select private.kinojo_sm_conflicts_for_participant_v412(v_team_id,s.owner_member_id,s.owner_root_character_id) c
      from private.sanctuary_management_slots_v412 s where s.team_id=v_team_id and s.character_id is not null
    ) q where c<>'[]'::jsonb;
    if coalesce(jsonb_array_length(v_conflicts),0)>0 then raise exception '현재 구성원과 겹치는 다른 팀 일정이 있습니다.' using errcode='P0001',detail=v_conflicts::text; end if;
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SCHEDULE',v_schedule_id,v_action,v_before,p_payload,v_request_key);

  elsif v_action='SET_SLOT' then
    v_team_id=(p_payload->>'teamId')::bigint; v_force_id=(p_payload->>'forceId')::bigint; v_party_no=(p_payload->>'partyNo')::smallint; v_slot_no=(p_payload->>'slotNo')::smallint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    select s.slot_id,to_jsonb(s) into v_slot_id,v_before from private.sanctuary_management_slots_v412 s join private.sanctuary_management_parties_v412 p on p.party_id=s.party_id where s.team_id=v_team_id and s.force_id=v_force_id and p.party_no=v_party_no and s.slot_no=v_slot_no for update of s;
    if v_slot_id is null then raise exception '선택한 슬롯을 찾을 수 없습니다.' using errcode='P0001'; end if;
    if p_payload->>'characterId' is null then
      update private.sanctuary_management_slots_v412 set character_id=null,owner_member_id=null,owner_root_character_id=null,character_relation=null,added_by_member_id=v_actor_id where slot_id=v_slot_id;
    else
      v_character_id=(p_payload->>'characterId')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null then raise exception '캐릭터를 찾을 수 없습니다.' using errcode='P0001'; end if;
      v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team_id,v_owner.owner_member_id,v_owner.root_character_id);
      if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
      update private.sanctuary_management_slots_v412 set character_id=v_character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.root_character_id,character_relation=case when v_owner.owner_member_id is null then 'GUEST' else v_owner.relation end,added_by_member_id=v_actor_id where slot_id=v_slot_id;
    end if;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'slotId',v_slot_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SLOT',v_slot_id,v_action,v_before,(select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id=v_slot_id),v_request_key);

  elsif v_action='PUBLISH_TEAM' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 공개할 권한이 없습니다.' using errcode='P0001'; end if;
    if not exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null) then raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode='P0001'; end if;
    if v_team.team_mode='PARTICIPATION' and exists(select 1 from private.sanctuary_management_forces_v412 f where f.team_id=v_team_id and not exists(select 1 from private.sanctuary_management_slots_v412 s where s.force_id=f.force_id and s.owner_member_id=v_team.creator_member_id)) then raise exception '참여 팀은 포스마다 생성자의 캐릭터 1개가 필요합니다.' using errcode='P0001'; end if;
    update private.sanctuary_management_teams_v412 set published_at=coalesce(published_at,clock_timestamp()),status='ACTIVE' where team_id=v_team_id returning revision into p_expected_revision;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,to_jsonb(v_team),v_response,v_request_key);

  elsif v_action='SUBMIT_SUPPORT' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or v_team.team_mode<>'PARTICIPATION' or v_team.status not in ('ACTIVE','FULL') then raise exception '현재 지원할 수 없는 팀입니다.' using errcode='P0001'; end if;
    v_force_ids=array(select jsonb_array_elements_text(coalesce(p_payload->'forceIds','[]'::jsonb))::bigint);
    v_character_ids=array(select jsonb_array_elements_text(coalesce(p_payload->'characterIds','[]'::jsonb))::bigint);
    if cardinality(v_force_ids)=0 or cardinality(v_force_ids)<>cardinality(v_character_ids) or cardinality(v_force_ids)>9 then raise exception '포스 수와 캐릭터 수를 같게 선택해 주세요.' using errcode='P0001'; end if;
    if cardinality(array(select distinct x from unnest(v_force_ids) x))<>cardinality(v_force_ids) or cardinality(array(select distinct x from unnest(v_character_ids) x))<>cardinality(v_character_ids) then raise exception '포스와 캐릭터는 중복 선택할 수 없습니다.' using errcode='P0001'; end if;
    insert into private.sanctuary_management_support_batches_v412(team_id,requester_member_id,request_key,status)
    values(v_team_id,v_actor_id,v_request_key,case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end) returning support_batch_id into v_batch_id;
    for v_i in 1..cardinality(v_force_ids) loop
      v_force_id:=v_force_ids[v_i]; v_character_id:=v_character_ids[v_i];
      if not exists(select 1 from private.sanctuary_management_forces_v412 where force_id=v_force_id and team_id=v_team_id and status='OPEN') then raise exception '선택한 포스는 지원할 수 없습니다.' using errcode='P0001'; end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.owner_member_id is distinct from v_actor_id then raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode='P0001'; end if;
      v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team_id,v_owner.owner_member_id,v_owner.root_character_id);
      if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
      v_slot_id:=null;
      if v_team.join_policy='INSTANT' then
        select s.slot_id into v_slot_id from private.sanctuary_management_slots_v412 s where s.force_id=v_force_id and s.character_id is null and s.assignment_kind='ACTUAL_CHARACTER' order by s.party_id,s.slot_no limit 1 for update skip locked;
        if v_slot_id is null then raise exception '선택한 포스의 빈자리가 없습니다.' using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 set character_id=v_character_id,owner_member_id=v_actor_id,owner_root_character_id=v_owner.root_character_id,character_relation=v_owner.relation,added_by_member_id=v_actor_id where slot_id=v_slot_id;
      end if;
      insert into private.sanctuary_management_support_items_v412(support_batch_id,force_id,character_id,owner_member_id,owner_root_character_id,status,applied_slot_id)
      values(v_batch_id,v_force_id,v_character_id,v_actor_id,v_owner.root_character_id,case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end,v_slot_id);
    end loop;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'supportBatchId',v_batch_id,'status',case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SUPPORT_BATCH',v_batch_id,v_action,null,v_response,v_request_key);

  elsif v_action='DECIDE_SUPPORT' then
    v_batch_id=(p_payload->>'supportBatchId')::bigint;
    select t.* into v_team from private.sanctuary_management_support_batches_v412 b join private.sanctuary_management_teams_v412 t on t.team_id=b.team_id where b.support_batch_id=v_batch_id for update of t;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team.team_id) then raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode='P0001'; end if;
    if upper(coalesce(p_payload->>'decision',''))='REJECT' then
      update private.sanctuary_management_support_items_v412 set status='REJECTED' where support_batch_id=v_batch_id and status='PENDING';
      update private.sanctuary_management_support_batches_v412 set status='REJECTED',decision_member_id=v_actor_id,decision_note=left(p_payload->>'note',240),decided_at=clock_timestamp() where support_batch_id=v_batch_id and status='PENDING';
    elsif upper(coalesce(p_payload->>'decision',''))='APPROVE' then
      for v_owner in select * from private.sanctuary_management_support_items_v412 where support_batch_id=v_batch_id and status='PENDING' order by support_item_id for update loop
        v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team.team_id,v_owner.owner_member_id,v_owner.owner_root_character_id);
        if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
        select slot_id into v_slot_id from private.sanctuary_management_slots_v412 where force_id=v_owner.force_id and character_id is null and assignment_kind='ACTUAL_CHARACTER' order by party_id,slot_no limit 1 for update skip locked;
        if v_slot_id is null then raise exception '지원한 포스의 빈자리가 없습니다.' using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 set character_id=v_owner.character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.owner_root_character_id,character_relation=(select relation from private.kinojo_sm_resolve_character_owner_v412(v_owner.character_id)),added_by_member_id=v_actor_id where slot_id=v_slot_id;
        update private.sanctuary_management_support_items_v412 set status='APPLIED',applied_slot_id=v_slot_id where support_item_id=v_owner.support_item_id;
      end loop;
      update private.sanctuary_management_support_batches_v412 set status='APPLIED',decision_member_id=v_actor_id,decision_note=left(p_payload->>'note',240),decided_at=clock_timestamp() where support_batch_id=v_batch_id and status='PENDING';
    else raise exception '승인 또는 거절을 선택해 주세요.' using errcode='P0001'; end if;
    perform private.kinojo_sm_recompute_status_v412(v_team.team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team.team_id,'supportBatchId',v_batch_id,'decision',upper(p_payload->>'decision'));
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team.team_id,'SUPPORT_BATCH',v_batch_id,v_action,null,v_response,v_request_key);

  elsif v_action='ARCHIVE_TEAM' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 해산할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '이미 해산된 팀입니다.' using errcode='P0001'; end if;
    update private.sanctuary_management_teams_v412 set status='ARCHIVED',archived_at=clock_timestamp(),archived_by_member_id=v_actor_id,archive_reason=left(coalesce(p_payload->>'reason',''),240) where team_id=v_team_id returning revision into p_expected_revision;
    update private.sanctuary_management_schedule_rules_v412 set status='STOPPED' where team_id=v_team_id;
    update private.sanctuary_management_support_items_v412 i set status='CANCELLED' from private.sanctuary_management_support_batches_v412 b where b.support_batch_id=i.support_batch_id and b.team_id=v_team_id and i.status='PENDING';
    update private.sanctuary_management_support_batches_v412 set status='CANCELLED',decision_member_id=v_actor_id,decided_at=clock_timestamp() where team_id=v_team_id and status='PENDING';
    delete from private.sanctuary_management_edit_leases_v412 where team_id=v_team_id;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'status','ARCHIVED','revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,to_jsonb(v_team),v_response,v_request_key);
  end if;

  insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
  values(v_actor_id,v_request_key,v_action,v_hash,v_response);
  return v_response||jsonb_build_object('replayed',false);
end
$function$
;

DO $patch$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_save_boss_roles_v536(bigint,bigint,jsonb,text)'::regprocedure) <> '5a2bdc07ea057851b1d29b6511cad115' THEN RAISE EXCEPTION 'SOURCE_CHANGED_kinojo_sm_save_boss_roles_v536';END IF;
END
$patch$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_save_boss_roles_v536(p_actor bigint, p_team_id bigint, p_composition jsonb, p_request_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f jsonb;s jsonb;b jsonb;code jsonb;n integer;c bigint;i integer;before_roles jsonb;after_roles jsonb;
begin
 -- Canonical command already holds the team lock and validates actor/lease/revision.
 select coalesce(jsonb_agg(to_jsonb(x) order by force_no,character_id,boss,ordinal),'[]'::jsonb) into before_roles
 from private.sanctuary_boss_roles_v536 x where team_id=p_team_id;
 if p_composition is not null and not exists(select 1 from private.sanctuary_management_teams_v412 t
   join public.sanctuary_master m on m.id=t.sanctuary_id where t.team_id=p_team_id and m.code='kaldrix') then
   if exists(select 1 from jsonb_array_elements(p_composition) force_item(value)
     cross join lateral jsonb_array_elements(force_item.value->'slots') slot_item(value)
     where coalesce(slot_item.value->'bossRoles'->>'boss1','')<>'' or coalesce(slot_item.value->'bossRoles'->'boss2','[]'::jsonb)<>'[]'::jsonb) then
     raise exception '역할 부여는 성역3에서만 사용할 수 있습니다.' using errcode='22023';
   end if;
   p_composition:=null;
 end if;
 if p_composition is not null then
  -- Delete the explicitly supplied force's assignments first, allowing atomic swaps.
  for f,n in select value,ordinality::integer from jsonb_array_elements(p_composition) with ordinality loop
   for s in select value from jsonb_array_elements(f->'slots') loop
    if s ? 'bossRoles' and s->>'guestId' is null then
     b:=s->'bossRoles';c:=nullif(s->>'characterId','')::bigint;
     if jsonb_typeof(b) is distinct from 'object' or exists(select 1 from jsonb_object_keys(b) k where k not in ('boss1','boss2'))
       or jsonb_typeof(b->'boss2') is distinct from 'array' or jsonb_array_length(b->'boss2')>2 then
      raise exception '보스 역할은 1보스 1개, 2보스 최대 2개만 선택할 수 있습니다.' using errcode='22023';
     end if;
     if c is null and (coalesce(b->>'boss1','')<>'' or jsonb_array_length(b->'boss2')>0) then
      raise exception '확정된 캐릭터에만 보스 역할을 지정할 수 있습니다.' using errcode='22023';
     end if;
     if c is not null then
      if not exists(select 1 from private.sanctuary_management_slots_v412 sl join private.sanctuary_management_forces_v412 fo on fo.force_id=sl.force_id
        where sl.team_id=p_team_id and fo.force_no=n and sl.character_id=c and coalesce(sl.assignment_kind,'ACTUAL_CHARACTER')='ACTUAL_CHARACTER') then
       raise exception '역할 대상 캐릭터의 포스 편성을 다시 확인해 주세요.' using errcode='22023';
      end if;
      delete from private.sanctuary_boss_roles_v536 where team_id=p_team_id and force_no=n and character_id=c;
     end if;
    end if;
   end loop;
  end loop;
  delete from private.sanctuary_boss_roles_v536 b where b.team_id=p_team_id and not exists(
   select 1 from private.sanctuary_management_slots_v412 sl join private.sanctuary_management_forces_v412 fo on fo.force_id=sl.force_id
   where sl.team_id=b.team_id and fo.force_no=b.force_no and sl.character_id=b.character_id);
  for f,n in select value,ordinality::integer from jsonb_array_elements(p_composition) with ordinality loop
   for s in select value from jsonb_array_elements(f->'slots') loop
    if s ? 'bossRoles' and s->>'guestId' is null then
     b:=s->'bossRoles';c:=nullif(s->>'characterId','')::bigint;
     if coalesce(b->>'boss1','')<>'' then
      if jsonb_typeof(b->'boss1')<>'string' then raise exception '1보스 역할 형식을 확인해 주세요.' using errcode='22023';end if;
      insert into private.sanctuary_boss_roles_v536 values(p_team_id,n,c,1,1,b->>'boss1');
     end if;
     i:=0;
     for code in select value from jsonb_array_elements(b->'boss2') loop
      i:=i+1;
      if jsonb_typeof(code)<>'number' or code::text !~ '^(1[0-2]|[1-9])$' then raise exception '2보스 역할은 1~12 숫자만 선택할 수 있습니다.' using errcode='22023';end if;
      insert into private.sanctuary_boss_roles_v536 values(p_team_id,n,c,2,i,code#>>'{}');
     end loop;
    end if;
   end loop;
  end loop;
 end if;
 -- Slot replacement/removal and cross-force moves release roles; same-force moves preserve them.
 delete from private.sanctuary_boss_roles_v536 b where b.team_id=p_team_id and not exists(
  select 1 from private.sanctuary_management_slots_v412 s join private.sanctuary_management_forces_v412 f on f.force_id=s.force_id
  where s.team_id=b.team_id and f.force_no=b.force_no and s.character_id=b.character_id);
 perform private.kinojo_sm_roles_guard_v554(p_team_id);
 select coalesce(jsonb_agg(to_jsonb(x) order by force_no,character_id,boss,ordinal),'[]'::jsonb) into after_roles
 from private.sanctuary_boss_roles_v536 x where team_id=p_team_id;
 if before_roles is distinct from after_roles then
  perform private.kinojo_sm_audit_v412(p_actor,p_team_id,'TEAM',p_team_id,'BOSS_ROLES_SAVE',before_roles,after_roles,p_request_key);
 end if;
exception when unique_violation then
 raise exception '같은 포스의 역할은 한 캐릭터에게만 부여할 수 있습니다. 다른 캐릭터의 배정을 먼저 해제해 주세요.' using errcode='22023';
end $function$
;

-- Guest values are operational slot data, not a new permanent character entity.
CREATE INDEX sanctuary_guest_candidate_expiry_v554 ON private.sanctuary_management_official_candidates_v432(expires_at) WHERE team_guest_only;
CREATE INDEX sanctuary_slot_family_v554 ON private.sanctuary_management_slots_v412(team_id,force_id,team_family_key) WHERE team_family_key IS NOT NULL;
CREATE FUNCTION private.kinojo_sm_layout_guard_trigger_v554()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog' AS $f$
BEGIN
 PERFORM private.kinojo_sm_assert_layout_v554(NEW.team_id,
  (SELECT placement_mode='BALANCED' FROM private.sanctuary_management_teams_v412 WHERE team_id=NEW.team_id));
 RETURN NEW;
END
$f$;
CREATE CONSTRAINT TRIGGER sanctuary_layout_guard_v554 AFTER INSERT OR UPDATE OF force_id,character_id,assignment_kind,guest_snapshot,team_family_key,team_family_role
 ON private.sanctuary_management_slots_v412 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.kinojo_sm_layout_guard_trigger_v554();
-- Reuse the existing bounded raw-retention schedule. The new module only deletes expired, team-guest-only drafts.
DO $cron$
DECLARE j record;
BEGIN
 IF to_regclass('cron.job') IS NOT NULL THEN
  SELECT jobid,command INTO j FROM cron.job WHERE jobname='kinojo-snapshot-raw-retention-v501';
  IF FOUND AND position('kinojo_sm_purge_draft_guests_v554' IN j.command)=0 THEN
   PERFORM cron.alter_job(j.jobid,command:=j.command||'; select private.kinojo_sm_purge_draft_guests_v554();');
  END IF;
 END IF;
END
$cron$;
DO $acl$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure identity,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname LIKE '%_v554' AND n.nspname IN('private','public') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.identity);
  IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.identity);END IF;
 END LOOP;
END
$acl$;

DO $admission$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.kinojo_sanctuary_management_command_v436(text,text,text,jsonb,bigint)'::regprocedure) <> '2bc6d0338fbe202c850d1f96c3a705a9' THEN RAISE EXCEPTION 'SOURCE_CHANGED_ADMISSION_V436';END IF;END $admission$;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v436(p_credential text, p_request_key text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_schedule private.sanctuary_management_schedule_rules_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype;
  v_source private.sanctuary_management_slots_v412%rowtype;
  v_target private.sanctuary_management_slots_v412%rowtype;
  v_batch private.sanctuary_management_support_batches_v412%rowtype;
  v_item private.sanctuary_management_support_items_v412%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_character_id bigint;
  v_batch_id bigint;
  v_slot_id bigint;
  v_source_slot_id bigint;
  v_target_slot_id bigint;
  v_assignment jsonb;
  v_assignments jsonb;
  v_decision text;
  v_policy text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_force_count integer;
  v_party_count integer;
  v_slot_count integer;
  v_ready_force_count integer;
  v_distinct_creator_count integer;
  v_applied_count integer;
  v_pending_count integer;
  v_rejected_count integer;
  v_cancelled_count integer;
  v_batch_status text;
  v_result_code text;
  v_result_message text;
  v_conflicts jsonb;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  -- STAGE4_CREATOR_COMMAND_GATE: v413 intentionally made the first rollout
  -- manager-only. Stage 4 opens creation to every signed-in member, so creator
  -- commands use the original per-team v412 authorization after validating the
  -- stricter v435 topology and schedule contract here.
  if v_action = 'CREATE_TEAM' then
    v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy', 'INSTANT')));
    if upper(btrim(coalesce(p_payload->>'mode', ''))) not in ('FIXED', 'PARTICIPATION')
       or v_policy not in ('INSTANT', 'APPROVAL') then
      raise exception '고정·참여 팀과 참가 방식을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_payload->>'title', ''))) not between 1 and 80
       or char_length(btrim(coalesce(p_payload->>'activity', ''))) not between 1 and 24 then
      raise exception '팀 제목과 진행 내용을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    v_kind := upper(coalesce(p_payload->'schedule'->>'kind', ''));
    v_starts_on := nullif(p_payload->'schedule'->>'startsOn', '')::date;
    v_weekdays := coalesce(array(
      select distinct weekday::smallint
        from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays', '[]'::jsonb)) weekday
       order by weekday::smallint
    ), '{}'::smallint[]);
    v_starts_at := nullif(p_payload->'schedule'->>'startsAt', '')::time;
    v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes', '')::integer, 30);
    if v_starts_on is null or v_starts_at is null
       or v_kind not in ('ONCE', 'WEEKLY')
       or (v_kind = 'ONCE' and cardinality(v_weekdays) <> 0)
       or (v_kind = 'WEEKLY' and cardinality(v_weekdays) not between 1 and 7)
       or exists(select 1 from unnest(v_weekdays) weekday where weekday not between 1 and 7)
       or v_duration not between 30 and 720 or v_duration % 30 <> 0 then
      raise exception '1회성 또는 반복 일정과 30분 단위 진행 시간을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action,
      coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
        'joinPolicy', case when upper(p_payload->>'mode') = 'FIXED' then 'INSTANT' else v_policy end
      ), p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    select count(*)::integer into v_force_count from private.sanctuary_management_forces_v412 where team_id = v_team_id;
    select count(*)::integer into v_party_count from private.sanctuary_management_parties_v412 where team_id = v_team_id;
    select count(*)::integer into v_slot_count from private.sanctuary_management_slots_v412 where team_id = v_team_id;
    if v_force_count <> 1 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '첫 포스 구성이 완전하게 생성되지 않았습니다.' using errcode = 'P0001';
    end if;
    return v_response || jsonb_build_object('forceCount', 1, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'ADD_FORCE' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '포스를 추가할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.status <> 'DRAFT' then
      raise exception '팀 공개 전 DRAFT에서만 포스를 추가할 수 있습니다.' using errcode = 'P0001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_response := public.kinojo_sanctuary_management_command_v412(p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision);
    select count(*)::integer into v_force_count from private.sanctuary_management_forces_v412 where team_id = v_team_id;
    select count(*)::integer into v_party_count from private.sanctuary_management_parties_v412 where force_id = nullif(v_response->>'forceId', '')::bigint;
    select count(*)::integer into v_slot_count from private.sanctuary_management_slots_v412 where force_id = nullif(v_response->>'forceId', '')::bigint;
    if v_force_count not between 1 and 9 or v_party_count <> 2 or v_slot_count <> 10 then
      raise exception '추가한 포스 구성이 올바르지 않습니다.' using errcode = 'P0001';
    end if;
    return v_response || jsonb_build_object('forceCount', v_force_count, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'PUBLISH_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is not null and v_team.team_mode = 'PARTICIPATION' then
      v_actor := private.kinojo_sm_actor_v412(p_credential);
      if not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
        raise exception '참여 팀을 공개할 권한이 없습니다.' using errcode = 'P0001';
      end if;
      if v_team.status <> 'DRAFT' then
        raise exception 'DRAFT 참여 팀만 처음 공개할 수 있습니다.' using errcode = 'P0001';
      end if;
      if p_expected_revision is null or v_team.revision <> p_expected_revision then
        raise exception '다른 사용자가 먼저 참여 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
      end if;

      select count(*)::integer,
             count(*) filter (where force_creator_count = 1)::integer,
             count(distinct creator_character_id)::integer
        into v_force_count, v_ready_force_count, v_distinct_creator_count
        from (
          select f.force_id,
                 count(s.character_id) filter (where s.owner_member_id = v_team.creator_member_id) as force_creator_count,
                 min(s.character_id) filter (where s.owner_member_id = v_team.creator_member_id) as creator_character_id
            from private.sanctuary_management_forces_v412 f
            left join private.sanctuary_management_slots_v412 s on s.force_id = f.force_id and s.character_id is not null
           where f.team_id = v_team_id
           group by f.force_id
        ) creator_forces;
      if v_force_count not between 1 and 9
         or v_ready_force_count <> v_force_count
         or v_distinct_creator_count <> v_force_count then
        raise exception '참여 팀은 포스마다 서로 다른 생성자 캐릭터 1개를 먼저 추가해야 합니다.' using errcode = 'P0001';
      end if;
      v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
      if jsonb_array_length(v_conflicts) > 0 then
        raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
      end if;
      v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
      perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
      return public.kinojo_sanctuary_management_command_v412(
        p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
      ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
    end if;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '팀을 공개할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.status <> 'DRAFT' or p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    if v_team.team_mode = 'FIXED' and not exists(
      select 1 from private.sanctuary_management_slots_v412 s
       where s.team_id = v_team_id
         and s.character_id is not null
         and s.owner_member_id = v_team.creator_member_id
    ) then
      raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode = 'P0001';
    end if;
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'SET_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is not null and v_team.team_mode = 'PARTICIPATION' and v_team.status = 'DRAFT'
       and p_payload->>'characterId' is not null then
      v_actor := private.kinojo_sm_actor_v412(p_credential);
      if not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
        raise exception '참여 팀 편성을 수정할 권한이 없습니다.' using errcode = 'P0001';
      end if;
      v_character_id := nullif(p_payload->>'characterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_team.creator_member_id then
        raise exception '참여 팀 공개 전에는 팀 생성자의 캐릭터만 선배치할 수 있습니다.' using errcode = 'P0001';
      end if;
      if exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.team_id = v_team_id and s.character_id = v_character_id
      ) then
        raise exception '각 포스에는 서로 다른 생성자 캐릭터를 추가해 주세요.' using errcode = 'P0001';
      end if;
    end if;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'ARCHIVE_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '팀을 해산할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    return public.kinojo_sanctuary_management_command_v412(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'MOVE_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' then
      return public.kinojo_sanctuary_management_command_v435(
        p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
      ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
    end if;
  elsif v_action not in ('UPDATE_PARTICIPATION_TEAM', 'SUBMIT_SUPPORT', 'DECIDE_SUPPORT', 'CANCEL_SUPPORT') then
    return public.kinojo_sanctuary_management_command_v435(
      p_credential, p_request_key, v_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
    ) || jsonb_build_object('schemaVersion', 436, 'databaseContract', 436);
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then
    raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 436));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload || jsonb_build_object('replayed', true, 'schemaVersion', 436, 'databaseContract', 436);
  end if;

  if v_action = 'UPDATE_PARTICIPATION_TEAM' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '참여 팀을 수정할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '운영 중인 참여 팀만 이 작업으로 수정할 수 있습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 참여 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');

    select * into v_sanctuary
      from public.sanctuary_master
     where code = btrim(p_payload->>'sanctuaryCode') and management_visible;
    if v_sanctuary.id is null then
      raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if char_length(btrim(coalesce(p_payload->>'title', ''))) not between 1 and 80
       or char_length(btrim(coalesce(p_payload->>'activity', ''))) not between 1 and 24 then
      raise exception '팀 제목과 진행 내용을 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy', 'INSTANT')));
    if v_policy not in ('INSTANT', 'APPROVAL') then
      raise exception '즉시 참가 또는 승인 참가 방식을 선택해 주세요.' using errcode = 'P0001';
    end if;
    v_kind := upper(coalesce(p_payload->'schedule'->>'kind', ''));
    v_starts_on := nullif(p_payload->'schedule'->>'startsOn', '')::date;
    v_weekdays := coalesce(array(
      select distinct weekday::smallint
        from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays', '[]'::jsonb)) weekday
       order by weekday::smallint
    ), '{}'::smallint[]);
    v_starts_at := nullif(p_payload->'schedule'->>'startsAt', '')::time;
    v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes', '')::integer, 30);
    if v_starts_on is null or v_starts_at is null
       or v_kind not in ('ONCE', 'WEEKLY')
       or (v_kind = 'ONCE' and cardinality(v_weekdays) <> 0)
       or (v_kind = 'WEEKLY' and cardinality(v_weekdays) not between 1 and 7) then
      raise exception '1회성 또는 반복 일정을 올바르게 입력해 주세요.' using errcode = 'P0001';
    end if;
    if v_duration not between 30 and 720 or v_duration % 30 <> 0 then
      raise exception '진행 시간은 30분부터 30분 단위로 입력해 주세요.' using errcode = 'P0001';
    end if;
    if v_sanctuary.available_from is not null and v_starts_on < v_sanctuary.available_from then
      raise exception '% 일정은 %부터 등록할 수 있습니다.', v_sanctuary.short_name, v_sanctuary.available_from using errcode = 'P0001';
    end if;

    select to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(r)) into v_before
      from private.sanctuary_management_schedule_rules_v412 r where r.team_id = v_team_id;
    update private.sanctuary_management_teams_v412
       set sanctuary_id = v_sanctuary.id,
           title = btrim(p_payload->>'title'),
           activity = btrim(p_payload->>'activity'),
           join_policy = v_policy,
           updated_at = clock_timestamp()
     where team_id = v_team_id
     returning * into v_team;
    update private.sanctuary_management_schedule_rules_v412
       set schedule_kind = v_kind,
           starts_on = v_starts_on,
           weekdays = v_weekdays,
           starts_at = v_starts_at,
           duration_minutes = v_duration,
           status = 'ACTIVE',
           updated_at = clock_timestamp()
     where team_id = v_team_id
     returning * into v_schedule;
    v_conflicts := private.kinojo_sm_team_conflicts_v433(v_team_id);
    if jsonb_array_length(v_conflicts) > 0 then
      raise exception '%', v_conflicts->0->>'message' using errcode = 'P0001', detail = v_conflicts::text;
    end if;
    v_after := to_jsonb(v_team) || jsonb_build_object('schedule', to_jsonb(v_schedule));
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'revision', v_team.revision, 'scheduleRevision', v_schedule.revision, 'joinPolicy', v_team.join_policy
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'MOVE_SLOT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '참여 팀 편성을 수정할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('DRAFT', 'ACTIVE', 'FULL') then
      raise exception '현재 편집할 수 없는 참여 팀입니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    v_source_slot_id := nullif(p_payload->>'fromSlotId', '')::bigint;
    v_target_slot_id := nullif(p_payload->>'toSlotId', '')::bigint;
    if v_source_slot_id is null or v_target_slot_id is null or v_source_slot_id = v_target_slot_id then
      raise exception '이동할 출발 슬롯과 도착 슬롯을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    perform 1
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id and slot_id in (v_source_slot_id, v_target_slot_id)
     order by slot_id for update;
    select * into v_source from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_source_slot_id;
    select * into v_target from private.sanctuary_management_slots_v412 where team_id = v_team_id and slot_id = v_target_slot_id;
    if v_source.slot_id is null or v_target.slot_id is null or v_source.character_id is null then
      raise exception '이동할 캐릭터와 대상 슬롯을 다시 선택해 주세요.' using errcode = 'P0001';
    end if;
    v_before := jsonb_build_object('from', to_jsonb(v_source), 'to', to_jsonb(v_target));
    update private.sanctuary_management_slots_v412
       set character_id = null, owner_member_id = null, owner_root_character_id = null,
           character_relation = null, added_by_member_id = v_actor_id
     where slot_id in (v_source_slot_id, v_target_slot_id);
    update private.sanctuary_management_slots_v412
       set character_id = v_source.character_id, owner_member_id = v_source.owner_member_id,
           owner_root_character_id = v_source.owner_root_character_id, character_relation = v_source.character_relation,
           added_by_member_id = v_source.added_by_member_id
     where slot_id = v_target_slot_id;
    if v_target.character_id is not null then
      update private.sanctuary_management_slots_v412
         set character_id = v_target.character_id, owner_member_id = v_target.owner_member_id,
             owner_root_character_id = v_target.owner_root_character_id, character_relation = v_target.character_relation,
             added_by_member_id = v_target.added_by_member_id
       where slot_id = v_source_slot_id;
    end if;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    update private.sanctuary_management_teams_v412 set updated_at = clock_timestamp()
     where team_id = v_team_id returning * into v_team;
    v_after := jsonb_build_object(
      'from', (select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id = v_source_slot_id),
      'to', (select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id = v_target_slot_id)
    );
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'fromSlotId', v_source_slot_id, 'toSlotId', v_target_slot_id, 'revision', v_team.revision
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SLOT', v_target_slot_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'SUBMIT_SUPPORT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '현재 지원할 수 없는 팀입니다.' using errcode = 'P0001';
    end if;
    v_assignments := coalesce(p_payload->'assignments', '[]'::jsonb);
    if jsonb_typeof(v_assignments) <> 'array' or jsonb_array_length(v_assignments) not between 1 and 9 then
      raise exception '지원할 포스와 캐릭터를 하나 이상 선택해 주세요.' using errcode = 'P0001';
    end if;
    if (
      select count(distinct nullif(item->>'forceId', '')::bigint) <> count(*)
          or count(distinct nullif(item->>'characterId', '')::bigint) <> count(*)
        from jsonb_array_elements(v_assignments) item
    ) then
      raise exception '포스와 캐릭터는 1:1로 중복 없이 선택해 주세요.' using errcode = 'P0001';
    end if;

    insert into private.sanctuary_management_support_batches_v412(
      team_id, requester_member_id, request_key, status
    ) values (
      v_team_id, v_actor_id, v_request_key, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end
    ) returning * into v_batch;
    v_batch_id := v_batch.support_batch_id;

    for v_assignment in
      select item from jsonb_array_elements(v_assignments) with ordinality as assignment_list(item, assignment_order)
       order by assignment_order
    loop
      v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if v_force_id is null or v_character_id is null
         or not exists(
           select 1 from private.sanctuary_management_forces_v412 f
            where f.force_id = v_force_id and f.team_id = v_team_id
         ) then
        raise exception '지원할 포스와 캐릭터 식별값을 다시 확인해 주세요.' using errcode = 'P0001';
      end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id then
        raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;

      v_result_code := null;
      v_result_message := null;
      v_slot_id := null;
      if exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.team_id = v_team_id and s.character_id = v_character_id
      ) then
        v_result_code := 'CHARACTER_ALREADY_IN_TEAM';
        v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
      elsif exists(
        select 1 from private.sanctuary_management_slots_v412 s
         where s.force_id = v_force_id and s.owner_member_id = v_actor_id and s.character_id is not null
      ) then
        v_result_code := 'OWNER_ALREADY_IN_FORCE';
        v_result_message := '이 포스에는 이미 본인의 캐릭터가 참여하고 있습니다.';
      elsif exists(
        select 1
          from private.sanctuary_management_support_items_v412 i
          join private.sanctuary_management_support_batches_v412 b on b.support_batch_id = i.support_batch_id
         where b.team_id = v_team_id
           and b.requester_member_id = v_actor_id
           and i.force_id = v_force_id
           and i.status = 'PENDING'
      ) then
        v_result_code := 'SUPPORT_ALREADY_PENDING';
        v_result_message := '이 포스에는 이미 승인 대기 중인 지원이 있습니다.';
      else
        v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_actor_id, v_owner.root_character_id);
        if jsonb_array_length(v_conflicts) > 0 then
          v_result_code := 'SCHEDULE_CONFLICT';
          v_result_message := v_conflicts->0->>'message';
        end if;
      end if;

      if v_result_code is null and v_team.join_policy = 'INSTANT' then
        select s.slot_id into v_slot_id
          from private.sanctuary_management_slots_v412 s
          join private.sanctuary_management_parties_v412 p on p.party_id = s.party_id
         where s.force_id = v_force_id and s.character_id is null and s.assignment_kind='ACTUAL_CHARACTER'
         order by p.party_no, s.slot_no
         limit 1
         for update of s;
        if v_slot_id is null then
          v_result_code := 'FORCE_FULL';
          v_result_message := '선택한 포스의 빈자리가 없습니다.';
        else
          update private.sanctuary_management_slots_v412
             set character_id = v_character_id,
                 owner_member_id = v_actor_id,
                 owner_root_character_id = v_owner.root_character_id,
                 character_relation = v_owner.relation,
                 added_by_member_id = v_actor_id
           where slot_id = v_slot_id;
        end if;
      end if;

      insert into private.sanctuary_management_support_items_v412(
        support_batch_id, force_id, character_id, owner_member_id, owner_root_character_id,
        status, applied_slot_id, result_code, result_message
      ) values (
        v_batch_id, v_force_id, v_character_id, v_actor_id, v_owner.root_character_id,
        case
          when v_result_code is not null then 'REJECTED'
          when v_team.join_policy = 'INSTANT' then 'APPLIED'
          else 'PENDING'
        end,
        v_slot_id,
        coalesce(v_result_code, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING_APPROVAL' end),
        coalesce(v_result_message, case when v_team.join_policy = 'INSTANT' then '빈 슬롯에 즉시 배치했습니다.' else '팀 승인을 기다리고 있습니다.' end)
      );
    end loop;

    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'PENDING')::integer,
           count(*) filter (where status = 'REJECTED')::integer
      into v_applied_count, v_pending_count, v_rejected_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_team.join_policy = 'INSTANT' and v_applied_count > 0 and v_rejected_count = 0 then 'APPLIED'
      when v_team.join_policy = 'APPROVAL' and v_pending_count > 0 and v_rejected_count = 0 then 'PENDING'
      when (v_applied_count > 0 or v_pending_count > 0) and v_rejected_count > 0 then 'PARTIAL'
      else 'REJECTED'
    end;
    update private.sanctuary_management_support_batches_v412
       set status = v_batch_status, updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'joinPolicy', v_team.join_policy, 'batch', private.kinojo_sm_support_batch_payload_v436(v_batch_id)
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, null, v_response, v_request_key);

  elsif v_action = 'DECIDE_SUPPORT' then
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    v_decision := upper(btrim(coalesce(p_payload->>'decision', '')));
    if v_decision not in ('APPROVE', 'REJECT') then
      raise exception '승인 또는 거절을 선택해 주세요.' using errcode = 'P0001';
    end if;
    select * into v_batch
      from private.sanctuary_management_support_batches_v412
     where support_batch_id = v_batch_id
     for update;
    if v_batch.support_batch_id is null then
      raise exception '지원 요청을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    v_team_id := v_batch.team_id;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if v_batch.status not in ('PENDING', 'PARTIAL')
       or not exists(
         select 1 from private.sanctuary_management_support_items_v412 i
          where i.support_batch_id = v_batch_id and i.status = 'PENDING'
       ) then
      raise exception '이미 처리가 끝난 지원 요청입니다.' using errcode = 'P0001';
    end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);

    if v_decision = 'REJECT' then
      update private.sanctuary_management_support_items_v412
         set status = 'REJECTED',
             result_code = 'REJECTED_BY_MANAGER',
             result_message = coalesce(nullif(left(btrim(p_payload->>'note'), 240), ''), '팀 운영자가 지원을 거절했습니다.'),
             updated_at = clock_timestamp()
       where support_batch_id = v_batch_id and status = 'PENDING';
    else
      for v_item in
        select *
          from private.sanctuary_management_support_items_v412
         where support_batch_id = v_batch_id and status = 'PENDING'
         order by support_item_id
         for update
      loop
        v_result_code := null;
        v_result_message := null;
        v_slot_id := null;
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_item.character_id);
        if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_item.owner_member_id then
          v_result_code := 'CHARACTER_OWNERSHIP_CHANGED';
          v_result_message := '캐릭터 소유 관계가 변경되어 승인할 수 없습니다.';
        elsif exists(
          select 1 from private.sanctuary_management_slots_v412 s
           where s.team_id = v_team_id and s.character_id = v_item.character_id
        ) then
          v_result_code := 'CHARACTER_ALREADY_IN_TEAM';
          v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
        elsif exists(
          select 1 from private.sanctuary_management_slots_v412 s
           where s.force_id = v_item.force_id and s.owner_member_id = v_item.owner_member_id and s.character_id is not null
        ) then
          v_result_code := 'OWNER_ALREADY_IN_FORCE';
          v_result_message := '이 포스에는 이미 같은 이용자의 캐릭터가 참여하고 있습니다.';
        else
          v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_item.owner_member_id, v_item.owner_root_character_id);
          if jsonb_array_length(v_conflicts) > 0 then
            v_result_code := 'SCHEDULE_CONFLICT';
            v_result_message := v_conflicts->0->>'message';
          end if;
        end if;

        if v_result_code is null then
          select s.slot_id into v_slot_id
            from private.sanctuary_management_slots_v412 s
            join private.sanctuary_management_parties_v412 p on p.party_id = s.party_id
           where s.force_id = v_item.force_id and s.character_id is null and s.assignment_kind='ACTUAL_CHARACTER'
           order by p.party_no, s.slot_no
           limit 1
           for update of s;
          if v_slot_id is null then
            v_result_code := 'FORCE_FULL';
            v_result_message := '승인 시점에 포스의 빈자리가 모두 찼습니다.';
          else
            update private.sanctuary_management_slots_v412
               set character_id = v_item.character_id,
                   owner_member_id = v_item.owner_member_id,
                   owner_root_character_id = v_item.owner_root_character_id,
                   character_relation = v_owner.relation,
                   added_by_member_id = v_actor_id
             where slot_id = v_slot_id;
          end if;
        end if;

        update private.sanctuary_management_support_items_v412
           set status = case when v_result_code is null then 'APPLIED' else 'REJECTED' end,
               applied_slot_id = v_slot_id,
               result_code = coalesce(v_result_code, 'APPROVED'),
               result_message = coalesce(v_result_message, '팀 승인을 완료하고 빈 슬롯에 배치했습니다.'),
               updated_at = clock_timestamp()
         where support_item_id = v_item.support_item_id;
      end loop;
    end if;

    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'PENDING')::integer,
           count(*) filter (where status = 'REJECTED')::integer,
           count(*) filter (where status = 'CANCELLED')::integer
      into v_applied_count, v_pending_count, v_rejected_count, v_cancelled_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_pending_count > 0 then 'PARTIAL'
      when v_applied_count > 0 and (v_rejected_count > 0 or v_cancelled_count > 0) then 'PARTIAL'
      when v_applied_count > 0 then 'APPLIED'
      else 'REJECTED'
    end;
    update private.sanctuary_management_support_batches_v412
       set status = v_batch_status,
           decision_member_id = v_actor_id,
           decision_note = nullif(left(btrim(p_payload->>'note'), 240), ''),
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id,
      'decision', v_decision, 'batch', v_after
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);

  elsif v_action = 'CANCEL_SUPPORT' then
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    select * into v_batch
      from private.sanctuary_management_support_batches_v412
     where support_batch_id = v_batch_id
     for update;
    if v_batch.support_batch_id is null or v_batch.requester_member_id <> v_actor_id then
      raise exception '본인의 지원 요청만 취소할 수 있습니다.' using errcode = 'P0001';
    end if;
    v_team_id := v_batch.team_id;
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = v_team_id
     for update;
    if not exists(
      select 1 from private.sanctuary_management_support_items_v412 i
       where i.support_batch_id = v_batch_id and i.status = 'PENDING'
    ) then
      raise exception '취소할 승인 대기 지원이 없습니다.' using errcode = 'P0001';
    end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    update private.sanctuary_management_support_items_v412
       set status = 'CANCELLED',
           result_code = 'CANCELLED_BY_REQUESTER',
           result_message = '지원자가 승인 대기 요청을 취소했습니다.',
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id and status = 'PENDING';
    select count(*) filter (where status = 'APPLIED')::integer,
           count(*) filter (where status = 'REJECTED')::integer
      into v_applied_count, v_rejected_count
      from private.sanctuary_management_support_items_v412
     where support_batch_id = v_batch_id;
    update private.sanctuary_management_support_batches_v412
       set status = case when v_applied_count > 0 or v_rejected_count > 0 then 'PARTIAL' else 'CANCELLED' end,
           decision_member_id = v_actor_id,
           decision_note = '지원자 취소',
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     where support_batch_id = v_batch_id;
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object(
      'ok', true, 'action', v_action, 'teamId', v_team_id, 'batch', v_after
    );
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);
  end if;

  insert into private.sanctuary_management_commands_v412(
    actor_member_id, request_key, action, request_hash, response_payload
  ) values (
    v_actor_id, v_request_key, v_action, v_hash, v_response
  );
  return v_response || jsonb_build_object('replayed', false, 'schemaVersion', 436, 'databaseContract', 436);
end;
$function$;

-- Keep team-only lookup candidates out of every permanent registration path.
DO $guard$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.kinojo_sm_materialize_candidate_v480(uuid,bigint,text,bigint)'::regprocedure)<>'5d3b89e7353297f85137628580187a18' THEN RAISE EXCEPTION 'SOURCE_CHANGED_materialize_candidate_v480';END IF;END $guard$;
CREATE OR REPLACE FUNCTION private.kinojo_sm_materialize_candidate_v480(p_candidate_id uuid, p_actor_member_id bigint, p_family_relation text, p_main_character_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_character_id bigint;
  v_power integer;
  v_item_level integer;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_candidate
  from private.sanctuary_management_official_candidates_v432
  where candidate_id=p_candidate_id
  for update;

  if v_candidate.candidate_id is null
     or v_candidate.actor_member_id<>p_actor_member_id then
    raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001';
  end if;
  if v_candidate.team_guest_only then
    raise exception '팀용 게스트는 전역 명부에 등록할 수 없습니다.' using errcode='22023';
  end if;
  if v_candidate.state='MATERIALIZED' and v_candidate.materialized_character_id is not null then
    if not exists(
      select 1 from public.character_master character
      where character.id=v_candidate.materialized_character_id
        and coalesce(character.main_character_id,character.id)=
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '이미 확정된 캐릭터 관계가 다릅니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    return v_candidate.materialized_character_id;
  end if;
  if v_candidate.state<>'VERIFIED' or v_candidate.expires_at<=v_now then
    update private.sanctuary_management_official_candidates_v432
       set state='EXPIRED',updated_at=v_now
     where candidate_id=p_candidate_id and state='VERIFIED';
    raise exception '공식 조회 결과가 만료되었습니다. 다시 조회해 주세요.' using errcode='P0001';
  end if;
  if upper(coalesce(p_family_relation,'')) not in ('MAIN','ALT')
     or (upper(p_family_relation)='ALT' and p_main_character_id is null) then
    raise exception '본캐·부캐 관계를 다시 확인해 주세요.' using errcode='P0001';
  end if;

  v_power := nullif(v_candidate.official_payload->>'pveCombatPower','')::integer;
  v_item_level := nullif(v_candidate.official_payload->>'pveItemLevel','')::integer;
  perform pg_advisory_xact_lock(hashtextextended(
    'sm-character:'||v_candidate.server_id||':'||public.kinojo_character_identity_key_v298(v_candidate.character_name),480
  ));

  select id into v_character_id
  from public.character_master
  where server_id=v_candidate.server_id
    and public.kinojo_character_identity_key_v298(character_name)
      =public.kinojo_character_identity_key_v298(v_candidate.character_name)
  order by is_active desc,(identity_status='CURRENT') desc,updated_at desc
  limit 1;

  if v_character_id is null then
    insert into public.character_master(
      server_id,server_name,character_name,char_key,profile_image_url,detail_url,
      image_updated_at,status,error_message,main_character_name,is_main,class_name,
      list_row,first_seen_at,last_seen_at,is_active,lookup_excluded,visibility_excluded,
      lookup_failure_streak,lookup_failure_total,last_lookup_success_at,main_character_id,
      identity_status,identity_verified_at,bootstrap_source,bootstrap_imported_at,
      legion_name,legion_updated_at,latest_pve_combat_power,latest_pve_item_level,last_synced_at
    ) values (
      v_candidate.server_id,v_candidate.server_name,v_candidate.character_name,v_candidate.char_key,
      v_candidate.profile_image_url,v_candidate.detail_url,v_now,'OK',null,
      case when upper(p_family_relation)='ALT' then
        (select character_name from public.character_master where id=p_main_character_id)
        else v_candidate.character_name end,
      upper(p_family_relation)='MAIN',v_candidate.class_name,null,v_now,v_now,true,false,false,
      0,0,v_now,case when upper(p_family_relation)='ALT' then p_main_character_id else null end,
      'CURRENT',v_now,'SANCTUARY_MANAGEMENT_OFFICIAL_V480',v_now,v_candidate.legion_name,v_now,
      v_power,v_item_level,v_now
    ) returning id into v_character_id;
  else
    if exists(
      select 1 from public.character_master character
      where character.id=v_character_id and character.is_active and character.identity_status='CURRENT'
        and coalesce(character.main_character_id,character.id)<>
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '조회 후 캐릭터 관계가 변경되었습니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    update public.character_master
       set server_name=v_candidate.server_name,
           char_key=coalesce(nullif(v_candidate.char_key,''),char_key),
           profile_image_url=coalesce(v_candidate.profile_image_url,profile_image_url),
           detail_url=coalesce(nullif(v_candidate.detail_url,''),detail_url),
           class_name=coalesce(nullif(v_candidate.class_name,''),class_name),
           legion_name=v_candidate.legion_name,legion_updated_at=v_now,
           latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),
           latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),
           status='OK',is_active=true,identity_status='CURRENT',identity_verified_at=v_now,
           last_lookup_success_at=v_now,last_synced_at=v_now,updated_at=v_now
     where id=v_character_id;
  end if;

  update private.sanctuary_management_official_candidates_v432
     set state='MATERIALIZED',materialized_character_id=v_character_id,
         materialized_at=v_now,updated_at=v_now
   where candidate_id=p_candidate_id;
  return v_character_id;
end
$function$
;

-- Abort rather than installing against an unexpectedly changed existing roster.
DO $preserve$
DECLARE r record;fingerprints jsonb:='{}';digest text;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('private.sanctuary_management_teams_v412','team_id',ARRAY['placement_mode']),
  ('private.sanctuary_management_forces_v412','force_id',ARRAY[]::text[]),
  ('private.sanctuary_management_parties_v412','party_id',ARRAY[]::text[]),
  ('private.sanctuary_management_slots_v412','slot_id',ARRAY['guest_snapshot','team_family_key','team_family_role']),
  ('private.sanctuary_boss_roles_v536','team_id',ARRAY[]::text[]))x(tbl,key,omit) LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg((to_jsonb(t)-$1)::text,'','' ORDER BY %I,(to_jsonb(t)-$1)::text),'''')) FROM %s t',r.key,r.tbl) INTO digest USING r.omit;
  fingerprints:=fingerprints||jsonb_build_object(r.tbl,digest);
 END LOOP;
 IF fingerprints<>current_setting('kinojo.sql554_rosters')::jsonb THEN RAISE EXCEPTION 'SQL554_EXISTING_ROSTER_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM private.sanctuary_management_teams_v412 WHERE placement_mode<>'MANUAL') THEN RAISE EXCEPTION 'SQL554_EXISTING_MODE_CHANGED';END IF;
END
$preserve$;
