const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const rpc=read('core/kinojo-supabase-rpc.js');
const features=read('core/kinojo-supabase-features.js');
const shared=read('admin/js/admin-shared.js');
const members=read('admin/js/admin-members.js');
const bootstrap=read('admin/js/admin-bootstrap.js');

assert.ok(rpc.includes("'kinojo_admin_member_list_v433'"),'SQL433 RPC must accept the current opaque WEB session');
for(const token of ["rpc('kinojo_admin_member_list_v433'",'p_limit:limit','p_cursor:','p_query:','p_role:','ADMIN_MEMBER_CURSOR_V1']){
  assert.ok(features.includes(token),'feature pagination contract missing '+token);
}
for(const token of ['memberCursorStack:[]','memberNextCursor:',"const MEMBER_PAGE_LIMIT=20",'loadNextMemberPage_','loadPreviousMemberPage_','scheduleMemberSearch_','page.totalCount','page.nextCursor']){
  assert.ok((shared+'\n'+members+'\n'+bootstrap).includes(token),'admin cursor UI missing '+token);
}
for(const entry of ['admin/index.html','m/admin/index.html']){
  const html=read(entry);
  for(const token of ['id="memberPrevBtn"','id="memberNextBtn"','id="memberPageInfo"','kinojo-supabase-rpc.js?cache=2026082806','kinojo-supabase-features.js?cache=2026083103','admin.js?cache=2026082901']){
    assert.ok(html.includes(token),entry+' missing '+token);
  }
}

console.log('KINOJO admin member cursor pagination contract: PASS');
