-- No data mutation. Restoring blanket access would reopen confirmed exposure.
do $$begin
  raise exception 'PUBLIC_RPC_ONLY_INSECURE_ROLLBACK_BLOCKED'
    using hint='Keep direct access sealed. Correct the narrow authenticated/public RPC contract; do not restore legacy anonymous grants.';
end$$;
