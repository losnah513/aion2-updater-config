-- Additive compatibility contracts: preserve submitted suggestions and receipts.
-- Reverting WEB does not justify restoring unsafe direct table permissions.
do $$begin
  raise exception 'PUBLIC_WRITE_RPC_ROLLBACK_REQUIRES_FORWARD_FIX'
    using hint='Keep the additive RPCs and request columns; repair the caller. Do not restore anonymous direct writes or drop submitted receipts.';
end$$;
