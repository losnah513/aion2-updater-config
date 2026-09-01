const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'supabase/functions/character-identity-recovery/index.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const runtimePrefix = source.slice(0, source.indexOf('Deno.serve('));

assert(runtimePrefix.length < source.length, 'Identity Edge Deno entrypoint boundary not found');

const sandbox = {};
vm.runInNewContext(
  `${runtimePrefix}\nglobalThis.__identityEncodingContract = { decodePlatformId, normalizeName };`,
  sandbox,
  { filename: 'character-identity-recovery-contract.ts' }
);

const contract = sandbox.__identityEncodingContract;
assert.equal(contract.decodePlatformId('encrypted-character%3D'), 'encrypted-character=');
assert.equal(contract.decodePlatformId('already-decoded='), 'already-decoded=');
assert.equal(contract.decodePlatformId('malformed%ZZ'), 'malformed%ZZ');
assert.equal(contract.normalizeName('<strong>니꿍</strong>'), '니꿍');

for (const token of [
  'const API_VERSION = "295.2"',
  'const platformId = decodePlatformId(primitive(item, ["characterId", "character_id", "encryptedCharacterId"]))',
  'return decodeHtml(text(value, 120)).normalize("NFKC")',
  'infoKey === expectedKey',
  'allowedServers.has(serverId)'
]) {
  assert(source.includes(token), `Identity percent-encoding contract missing: ${token}`);
}

console.log('character identity recovery percent-encoding contract: PASS');
