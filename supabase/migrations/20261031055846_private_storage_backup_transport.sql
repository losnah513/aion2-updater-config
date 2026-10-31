-- SQL551: service-only, read-only, canonical-byte backup pages.
SET LOCAL lock_timeout='2s';
CREATE FUNCTION public.kinojo_storage_backup_page_v551(
 p_cron_token text,p_kind text,p_after bigint,p_until bigint,p_before timestamptz,p_limit integer DEFAULT 200
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog'
SET statement_timeout='30s' SET TimeZone='UTC' AS $fn$
DECLARE v_table text;v_date text;v_age interval;v_data text;v_rows int;v_last bigint;v_limit int:=least(500,greatest(1,coalesce(p_limit,200)));
BEGIN
 IF nullif(p_cron_token,'') IS NULL OR p_cron_token IS DISTINCT FROM (
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='kinojo_server_automation_cron_token' ORDER BY created_at DESC LIMIT 1
 ) THEN RETURN jsonb_build_object('ok',false,'code','STORAGE_MAINTENANCE_DENIED');END IF;
 IF p_after IS NULL OR p_until IS NULL OR p_before IS NULL OR p_after<0 OR p_until<p_after OR p_before>statement_timestamp()
 THEN RETURN jsonb_build_object('ok',false,'code','INVALID_BACKUP_RANGE');END IF;
 CASE p_kind
 WHEN 'snapshot' THEN v_table:='lookup_snapshots';v_date:='created_at';v_age:=interval '7 days';
 WHEN 'review' THEN v_table:='growth_reviews';v_date:='created_at';v_age:=interval '7 days';
 WHEN 'master' THEN v_table:='master_sync_events';v_date:='created_at';v_age:=interval '30 days';
 WHEN 'runtime' THEN v_table:='updater_runtime_events';v_date:='created_at';v_age:=interval '7 days';
 WHEN 'evidence' THEN v_table:='extension_character_payloads';v_date:='received_at';v_age:=interval '24 hours';
 ELSE RETURN jsonb_build_object('ok',false,'code','INVALID_STORAGE_KIND');
 END CASE;
 EXECUTE format(
  'WITH records AS MATERIALIZED (
    SELECT id,jsonb_build_object(''row'',to_jsonb(t),''hash'',md5(to_jsonb(t)::text))::text line
    FROM public.%I t WHERE id>$1 AND id<=$2 AND %I<$3-$4 %s ORDER BY id LIMIT $5
   ), sized AS (SELECT *,sum(octet_length(line)) OVER(ORDER BY id) bytes FROM records)
   SELECT coalesce(string_agg(line,E''\n'' ORDER BY id),''''),count(*)::int,max(id)
   FROM sized WHERE bytes<=8000000 OR id=(SELECT min(id) FROM records)',
  v_table,v_date,case when p_kind='runtime' then 'AND event_type=''progress''' else '' end)
 INTO v_data,v_rows,v_last USING p_after,p_until,p_before,v_age,v_limit;
 IF octet_length(v_data)>12000000 THEN RETURN jsonb_build_object('ok',false,'code','BACKUP_RECORD_TOO_LARGE');END IF;
 RETURN jsonb_build_object('ok',true,'kind',p_kind,'rows',v_rows,'lastId',coalesce(v_last,p_after),
  'sourceBytes',octet_length(v_data),'sourceSha256',encode(sha256(convert_to(v_data,'UTF8')),'hex'),'data',v_data);
END
$fn$;
REVOKE ALL ON FUNCTION public.kinojo_storage_backup_page_v551(text,text,bigint,bigint,timestamptz,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinojo_storage_backup_page_v551(text,text,bigint,bigint,timestamptz,integer) TO service_role;
