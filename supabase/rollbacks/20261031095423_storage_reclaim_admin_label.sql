-- SQL553 label-only rollback; capacity monitoring and data remain unchanged.
SET LOCAL lock_timeout='2s';
DO $label$
DECLARE v_oid regprocedure:='public.kinojo_admin_server_routines_v533(text)'::regprocedure;v_hash text;v_definition text;
BEGIN
 SELECT md5(prosrc),pg_get_functiondef(oid) INTO v_hash,v_definition FROM pg_proc WHERE oid=v_oid;
 IF v_hash='b214d3e0b26243a456ec6e8bc16ed9db' THEN RETURN;END IF;
 IF v_hash<>'6e0dca31e623f7344583b70aea30cce4' THEN RAISE EXCEPTION 'ADMIN_ROUTINES_SOURCE_CHANGED';END IF;
 EXECUTE replace(v_definition,'      when ''kinojo-storage-capacity-watch-v553'' then ''DB 용량 확인·자동 공간 회수'''||E'\n','');
END
$label$;
