const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260828072731_sanctuary_admin_browser_rpc_v434.sql');
const rpc=read('core/kinojo-supabase-rpc.js');
const feature=read('core/kinojo-supabase-features.js');
const handoff=read('docs/HANDOFF.md');

for(const token of [
  'ADMIN_BROWSER_RPC_SESSION_GATE',
  'kinojo_admin_member_list_v433(text, integer, text, text, text)',
  'from public',
  'to anon, authenticated, service_role',
  'delegated v428 opaque kws_ session gate',
])assert.ok(migration.includes(token),`ADMIN browser RPC ACL contract missing ${token}`);

assert.ok(!/grant\s+execute[\s\S]*?\bto\s+public\b/i.test(migration),'ADMIN member list must not grant EXECUTE to PUBLIC');
assert.ok(rpc.includes("'kinojo_admin_member_list_v433'"),'opaque session substitution must include v433');
assert.ok(feature.includes("rpc('kinojo_admin_member_list_v433'"),'member list must continue through the RPC session gate');
assert.ok(handoff.includes('ADMIN 회원목록 브라우저 RPC 규칙'),'browser RPC recovery rule missing from handoff');

console.log('KINOJO ADMIN member-list v433 browser RPC contract: PASS');
