-- SQL554 safe rollback: stop new editor writes without losing guest cleanup/readback.
-- Keep schema, private helpers, existing BALANCED event handling and all team data intact.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE OR REPLACE FUNCTION private.kinojo_sm_editor_enabled_v554() RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='pg_catalog' AS 'SELECT false';
REVOKE ALL ON FUNCTION private.kinojo_sm_editor_enabled_v554() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
