const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edgePath = path.join(root, 'supabase/functions/sanctuary-management/index.ts');
const configPath = path.join(root, 'supabase/config.toml');
const edge = fs.readFileSync(edgePath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');

for (const token of [
  'EDGE_CONTRACT_AUTHORITY',
  'DB RPC payloads can retain legacy apiVersion/schemaVersion values',
  'JSON.stringify({...body,service:SERVICE,apiVersion:API_VERSION,databaseContract:DATABASE_CONTRACT,schemaVersion:Number(DATABASE_CONTRACT)})',
]) assert.ok(edge.includes(token), `Edge contract authority rule missing: ${token}`);

assert.equal(
  edge.includes('JSON.stringify({service:SERVICE,apiVersion:API_VERSION,databaseContract:DATABASE_CONTRACT,...body})'),
  false,
  'DB payload must never overwrite Edge-owned contract fields',
);
assert.ok(config.includes('[functions.sanctuary-management]'), 'sanctuary-management function config missing');
assert.ok(config.includes('entrypoint = "./functions/sanctuary-management/index.ts"'), 'sanctuary-management source entrypoint missing');

console.log('KINOJO sanctuary-management Edge contract authority: PASS');
