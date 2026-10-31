-- SQL543 is privilege containment, with no application-data mutation.
-- Intentionally fail closed: a rollback must not reopen the verified exposure.
do $$begin
  raise exception 'PUBLIC_SURFACE_INSECURE_ROLLBACK_BLOCKED'
    using hint='Keep containment. Repair the specific authenticated RPC/service grant after reviewing the saved pre-deploy ACL manifest.';
end$$;
