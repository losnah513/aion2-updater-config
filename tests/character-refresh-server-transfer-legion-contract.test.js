const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const migrationPath = path.join(
  rootDir,
  'supabase/migrations/20260901043050_character_refresh_server_transfer_legion_atomic_v461.sql'
);
const workerPath = path.join(rootDir, 'supabase/functions/character-refresh-worker/index.ts');
const rollbackPath = path.join(
  rootDir,
  'supabase/rollbacks/20260901043050_character_refresh_server_transfer_legion_atomic_v461_rollback.sql'
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');
const rollback = fs.readFileSync(rollbackPath, 'utf8');

function ordered(source, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert(next >= 0, `${label} missing: ${token}`);
    assert(next > cursor, `${label} order invalid: ${token}`);
    cursor = next;
  }
}

for (const token of [
  'create or replace function public.kinojo_character_identity_recovery_apply_v1(',
  'security invoker',
  'set search_path = pg_catalog, public, private, pg_temp',
  "set lock_timeout = '500ms'",
  "'CHAR_KEY_MISMATCH'",
  "'SERVER_RACE_MISMATCH'",
  'v_server_transferred := v_character.server_id is distinct from v_server_id',
  'from private.legion_tree_assignments a',
  'for update',
  'delete from private.legion_tree_assignments a',
  'get diagnostics v_assignment_removed_count = row_count',
  "updated_by = 'SYSTEM_CHARACTER_SERVER_TRANSFER_V461'",
  'legion_name = case when v_server_transferred then null else legion_name end',
  'legion_source_snapshot_id = case when v_server_transferred then null else legion_source_snapshot_id end',
  "'previousLegionName', v_previous_legion_name",
  "'organizationAssignmentRemoved', v_assignment_removed_count > 0",
  "'legionTreeRevisions', v_legion_tree_revisions",
  "'databaseContract', '461'",
  'revoke all on function public.kinojo_character_identity_recovery_apply_v1(text, text, bigint, jsonb)',
  'from public, anon, authenticated',
  'to postgres, service_role'
]) {
  assert(migration.includes(token), `DB461 transfer contract missing: ${token}`);
}

ordered(migration, [
  "or v_char_key <> trim(v_character.char_key) then",
  "'CHAR_KEY_MISMATCH'",
  'select sm.server_name, sm.server_short_name, sm.race_id',
  "'SERVER_RACE_MISMATCH'",
  'v_server_transferred := v_character.server_id is distinct from v_server_id',
  'if v_server_transferred then',
  'delete from private.legion_tree_assignments a',
  'update private.legion_tree_configs c',
  'insert into public.character_identity_change_history(',
  'update public.character_master'
], 'DB461 mutation guard');

assert(
  migration.includes('legion_updated_at = case when v_server_transferred then now() else legion_updated_at end'),
  'same-server rename must preserve Legion timestamp'
);
assert(
  !/set\s+legion_name\s*=\s*null\b/i.test(migration),
  'Legion membership must never be cleared unconditionally'
);
assert(
  migration.indexOf('delete from private.legion_tree_assignments a')
    < migration.indexOf('update public.character_master'),
  'assignment removal and character mutation must remain in the same SQL function transaction'
);

for (const token of [
  'resolveStoredDetailTarget(',
  'resolveOfficialTarget(',
  'kinojo_character_identity_recovery_apply_v1',
  'character-identity-recovery',
  'extensionProbe',
  'CHAR_KEY_MISMATCH'
]) {
  assert(worker.includes(token), `worker recovery path missing: ${token}`);
}

for (const token of [
  'CREATE OR REPLACE FUNCTION public.kinojo_character_identity_recovery_apply_v1',
  "SET search_path TO 'public', 'pg_temp'",
  'revoke all on function public.kinojo_character_identity_recovery_apply_v1(text, text, bigint, jsonb)',
  'from public, anon, authenticated',
  'to postgres, service_role'
]) {
  assert(rollback.includes(token), `DB461 rollback contract missing: ${token}`);
}
assert(!rollback.includes("'databaseContract', '461'"), 'DB461 rollback must restore the pre-461 function');

console.log('character refresh server-transfer Legion contract: PASS');
