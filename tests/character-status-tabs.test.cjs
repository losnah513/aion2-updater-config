const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const filter={value:'attention'};
const A={state:{characters:[]},$:s=>s==='#characterStateFilter'?filter:null,$$:()=>[]};
vm.runInNewContext(fs.readFileSync('admin/js/admin-characters.js','utf8'),{window:{KinojoAdmin:A},document:{addEventListener(){}},Date});
const items=[
 {characterId:1,identityBadge:{label:'이전 이름'},lookupPolicy:{eligible:true}},
 {characterId:2,lookupPolicy:{eligible:false,reason:'ADMIN_EXCLUDED'}},
 {characterId:3,lookupPolicy:{eligible:false,reason:'ACTIVITY_REVIEW_WAIT'}},
 {characterId:4,lookupPolicy:{eligible:false,reason:'DELETION_CANDIDATE'}},
 {characterId:5,lookupPolicy:{eligible:true},lookupFailureStreak:1},
 {characterId:6,lookupPolicy:{eligible:false,reason:'ADMIN_EXCLUDED'},identityReview:{reviewId:1}},
 {characterId:7,lookupPolicy:{eligible:true},identityListPendingCount:1},
 {characterId:8,lookupPolicy:{eligible:true},lastLookupFailureCode:'TIMEOUT',lastLookupFailedAt:'2026-09-09T07:00:00Z',lastLookupSuccessAt:'2026-09-08T07:00:00Z'},
 {characterId:9,lookupPolicy:{eligible:true},lastLookupFailureCode:'TIMEOUT',lastLookupFailedAt:'2026-09-08T07:00:00Z',lastLookupSuccessAt:'2026-09-09T07:00:00Z'},
 {characterId:10,lookupPolicy:{eligible:true},visibilityExcluded:true},
 {characterId:11,lookupPolicy:{eligible:false,reason:'ARCHIVED_RECORD'}},
 {characterId:12,lookupPolicy:{eligible:true},identityBadge:{label:'서버 이전'},visibilityExcluded:true}
];
A.state.characters=items;
const before=JSON.stringify(items);
function ids(view,value){A.state.characterWorkspace=view;filter.value=value;return Array.from(A.filteredCharacters(),x=>x.characterId);}
assert.deepEqual(ids('records','attention'),[1,5,6,7,8,12]);
assert.deepEqual(ids('records','identity'),[1,6,12]);
assert.deepEqual(ids('records','review'),[5,6,7,8]);
assert.deepEqual(ids('records','normal'),[1,9]);
assert.deepEqual(ids('exclusions','all'),[2,3,4,6,10,11,12]);
assert.deepEqual(ids('exclusions','manual'),[2,6]);
assert.deepEqual(ids('exclusions','waiting'),[3]);
assert.deepEqual(ids('exclusions','archived'),[4,11]);
assert.deepEqual(ids('exclusions','review'),[6]);
assert.deepEqual(ids('exclusions','visibility'),[10,12]);
assert.equal(JSON.stringify(items),before,'presentation must not mutate eligibility');
for(const file of ['admin/index.html','m/admin/index.html']){
 const html=fs.readFileSync(file,'utf8');
 assert.match(html,/data-admin-subtab="exclusions"/);
 assert.match(html,/data-admin-subpane="exclusions"/);
 assert.equal((html.match(/id="characterList"/g)||[]).length,1);
 assert.match(html,/statusTabs=2026090901/);
}
assert.match(fs.readFileSync('admin/js/admin-bootstrap.js','utf8'),/if\(isCharacterWorkspace\) A.loadCharacterWorkspace\(subtab\)/);
console.log('PASS: identity visibility, excluded categories, overlapping issues, historical errors, no policy writes, PC/mobile routes');
