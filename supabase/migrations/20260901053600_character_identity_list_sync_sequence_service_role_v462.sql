-- KINOJO character identity recovery · service-role list sync queue sequence access · DB contract 462

grant usage, select
  on sequence public.google_list_sheet_sync_queue_id_seq
  to service_role;

comment on sequence public.google_list_sheet_sync_queue_id_seq
is 'DB462 allows the service-only identity recovery Edge path to enqueue an exact-identity list update while the recovery function remains SECURITY INVOKER.';
