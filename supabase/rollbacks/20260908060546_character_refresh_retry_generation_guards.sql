-- Roll Edge back before this migration. Preserve generation/checkpoint records.
revoke execute on function public.kinojo_identity_scan_checkpoint_v2(bigint,text,jsonb,jsonb,jsonb,text) from service_role;
grant execute on function public.kinojo_identity_scan_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb) to service_role;
