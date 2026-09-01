const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const workerPath = path.join(rootDir, 'supabase/functions/character-refresh-worker/index.ts');
const fixturePath = path.join(rootDir, 'tests/fixtures/character-refresh-identity-stage2.json');
const worker = fs.readFileSync(workerPath, 'utf8');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const runtimePrefix = worker.slice(0, worker.indexOf('Deno.serve('));
assert(runtimePrefix.length < worker.length, 'Worker Deno entrypoint boundary not found');
const sandbox = {};
vm.runInNewContext(
  `${runtimePrefix}\nglobalThis.__identityStage2 = { identityRecoveryDecision, identityTransitionContract, exactCandidateOutcome, candidateFromStoredInfo };`,
  sandbox,
  { filename: 'character-refresh-worker-contract.ts' }
);

const contract = sandbox.__identityStage2;
const plain = value => JSON.parse(JSON.stringify(value));

for (const fixture of fixtures.recoveryGates) {
  const actual = plain(contract.identityRecoveryDecision(fixture.storedCode, fixture.nameSearchCode));
  for (const [key, value] of Object.entries(fixture.expected)) {
    assert.deepStrictEqual(actual[key], value, `${fixture.name}: ${key}`);
  }
}

for (const fixture of fixtures.searchOutcomes) {
  const actual = plain(contract.exactCandidateOutcome(
    fixture.payload,
    fixture.characterName,
    fixture.serverId,
    fixture.expectedKey
  ));
  for (const [key, value] of Object.entries(fixture.expected)) {
    assert.deepStrictEqual(actual[key], value, `${fixture.name}: ${key}`);
  }
}

for (const fixture of fixtures.storedInfoOutcomes) {
  const actual = plain(contract.candidateFromStoredInfo(
    fixture.payload,
    fixture.detail,
    fixture.expectedKey
  ));
  for (const [key, value] of Object.entries(fixture.expected)) {
    assert.deepStrictEqual(actual[key], value, `${fixture.name}: ${key}`);
  }
}

for (const fixture of fixtures.transitions) {
  const actual = plain(contract.identityTransitionContract(
    fixture.applied,
    fixture.previousServerId,
    fixture.currentServerId
  ));
  for (const [key, value] of Object.entries(fixture.expected)) {
    assert.deepStrictEqual(actual[key], value, `${fixture.name}: ${key}`);
  }
}

for (const token of [
  'const API_VERSION="295.9"',
  'const IDENTITY_DATABASE_CONTRACT="461"',
  'identityRecoveryDecision(stored.code,nameSearch.code)',
  'decision.allowed!==true',
  'identityTransitionContract(identityRecovery,previousServerId,serverId)',
  'providerRetryEntersIdentityRecovery:false',
  'identityRecoveryEntry:"stored-detail-404-or-empty-identity-200+name-server-terminal-not-found"',
  'serverTransferLegionAtomic:true',
  'sameServerRenamePreservesLegion:true'
]) {
  assert(worker.includes(token), `Worker Stage 2 contract missing: ${token}`);
}

for (const emptyProfileToken of [
  'identityPresent=Boolean(characterId||responseServerId||profileImageUrl||charKey)',
  '{ok:false,code:"STORED_DETAIL_NOT_FOUND",terminal:true,emptyProfile:true}',
  'terminal:checked.terminal===true'
]) {
  assert(worker.includes(emptyProfileToken), `Stored detail empty-profile contract missing: ${emptyProfileToken}`);
}

for (const providerToken of [
  'res.status===408||res.status===429||res.status>=500',
  'PLAYNC_TIMEOUT',
  'PLAYNC_NON_JSON'
]) {
  assert(worker.includes(providerToken), `Provider retry guard missing: ${providerToken}`);
}

console.log('character refresh identity Stage 2 synthetic fixtures: PASS');
