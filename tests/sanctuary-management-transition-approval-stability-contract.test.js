const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260829053939_sanctuary_management_transition_approval_stability_v445.sql'),'utf8');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/verify-kinojo-pages.yml'),'utf8');

for(const token of [
  'kinojo_sm_transition_snapshot_raw_v445',
  'kinojo_sm_transition_scope_hash_v445',
  "to_regprocedure('private.kinojo_sm_transition_snapshot_raw_v445(date)') is null",
  "target-'rowCount'-'idRange'",
  "'private.sanctuary_management_audit_events_v412'",
  "'private.sanctuary_management_commands_v412'",
  "private.kinojo_sm_transition_scope_hash_v445(scope_payload)=v_snapshot->>'scopeHash'",
  "'recordedScopeHash',scope_hash",
])assert.ok(migration.includes(token),`approval stability migration missing ${token}`);

for(const signature of [
  'private.kinojo_sm_transition_scope_hash_v445(jsonb)',
  'private.kinojo_sm_transition_snapshot_raw_v445(date)',
  'private.kinojo_sm_transition_snapshot_v445(date)',
  'public.kinojo_sanctuary_management_transition_report_v445(text,date)',
  'public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text)',
  'public.kinojo_sanctuary_management_bootstrap_v445(text)',
])assert.ok(migration.includes(`revoke all on function ${signature} from public,anon,authenticated`),`${signature} browser ACL is not closed`);

assert.doesNotMatch(migration,/update\s+private\.sanctuary_management_transition_approvals_v445|delete\s+from\s+private\.sanctuary_management_transition_approvals_v445/i,'existing user approval records must remain unchanged');

const normalize=targets=>{
  const stable=structuredClone(targets);
  stable.preserve=stable.preserve.map(target=>{
    if(!['private.sanctuary_management_audit_events_v412','private.sanctuary_management_commands_v412'].includes(target.object))return target;
    const {rowCount,idRange,...identity}=target;
    return identity;
  });
  return stable;
};
const hash=targets=>crypto.createHash('sha256').update(JSON.stringify(normalize(targets))).digest('hex');
const approved={proposalVersion:1,preserve:[
  {object:'public.sanctuary_master',rowCount:4,ids:[1,2,3,4]},
  {object:'private.sanctuary_management_audit_events_v412',rowCount:40,idRange:[1,41],reason:'preserve'},
  {object:'private.sanctuary_management_commands_v412',rowCount:40,idRange:[1,40],reason:'preserve'},
],archive:[{object:'private.sanctuary_management_teams_v412',ids:[6,7,8]}],initialize:[{object:'public.sanctuary_slots',occupiedIds:[1,2]}],stop:[]};
const afterApproval=structuredClone(approved);
afterApproval.preserve[1].rowCount=41;
afterApproval.preserve[1].idRange=[1,42];
assert.equal(hash(approved),hash(afterApproval),'approval audit append must not invalidate the approved transition identity');
afterApproval.initialize[0].occupiedIds.push(3);
assert.notEqual(hash(approved),hash(afterApproval),'a destructive target change must invalidate the approval identity');

assert.ok(workflow.includes('node tests/sanctuary-management-transition-approval-stability-contract.test.js'),'approval stability test is not wired into CI');

console.log('KINOJO sanctuary management transition approval stability contract: PASS');
