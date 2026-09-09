const fs=require('node:fs'),assert=require('node:assert/strict');
const {createBridgeMock}=require('./helpers/list-metadata-mock.cjs');
const source=fs.readFileSync('apps-script/list-master/BRIDGE.gs','utf8');
const before=['before','궁성',100,200,'','','main',''];
const plan={jobId:'synthetic-job-0001',characterId:'10',metadataId:1,expectedBefore:before};
const update={id:1,characterId:10,originalListName:'before',characterName:'before',className:'궁성',pveCombatPower:300};
function setup(){
 const m=createBridgeMock(source);m.metadata.push({id:1,key:'KINOJO_MASTER_ID',value:'10',row:m.cells[5]});
 m.ctx.Utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>Array.from(require('node:crypto').createHash('sha256').update(s).digest())};
 m.properties.KINOJO_ROSTER_WRITE_TOKEN='synthetic-not-a-secret';m.properties.KINOJO_LIST_CLEANUP_ENABLED='true';
 m.run=(operation,extra={},method='POST')=>m.ctx.kinojoHandleServerListSheetCleanup_({writeToken:'synthetic-not-a-secret',cleanupPlan:{...plan,operation,...extra}},method);
 return m;
}
let m=setup();delete m.properties.KINOJO_LIST_CLEANUP_ENABLED;
assert.equal(m.run('CLEAR').code,'LIST_CLEANUP_DISABLED');assert.equal(m.writes.length,0);
assert.equal(m.run('CLEAR',{},'GET').code,'WRITE_TOKEN_INVALID');
assert.equal(m.ctx.kinojoHandleServerListSheetCleanup_({writeToken:'wrong',cleanupPlan:plan},'POST').code,'WRITE_TOKEN_INVALID');
m=setup();assert.equal(m.run('CLEAR').state,'CLEARED');assert.deepEqual(m.cells[5],Array(8).fill(''));
assert.deepEqual(m.cells[6],['unrelated','궁성',900,999,'','','other','']);assert.equal(m.cells.length,8);
assert.equal(m.write([update]).ok,false);assert.equal(m.run('CLEAR').state,'CLEARED');assert.equal(m.writes.length,1);
assert.equal(m.run('COMPLETE').code,'CLEANUP_FINALIZATION_UNCONFIRMED');
delete m.properties.KINOJO_LIST_CLEANUP_ENABLED;
assert.equal(m.run('RESTORE').state,'RESTORED');assert.deepEqual(m.cells[5],before);assert(!m.properties.KINOJO_LIST_CLEANUP_ACTIVE);
assert.equal(m.run('RESTORE').replayed,true);assert.equal(m.write([update]).ok,true);
m=setup();m.run('CLEAR');assert.equal(m.run('COMPLETE',{dbFinalized:true}).state,'COMPLETED');
assert(!m.properties.KINOJO_LIST_CLEANUP_ACTIVE);assert(m.properties.KINOJO_LIST_RETIRED_10);
assert(!JSON.stringify(m.properties).includes('before'));assert.equal(m.write([update]).ok,false);
assert.equal(m.run('RESTORE').state,'COMPLETED','terminal receipt never resurrects completed cleanup');
for(const mutate of [x=>x.cells[5][0]='edited',x=>x.cells[5][2]='=1+2',x=>x.cells[5].push('private note'),x=>x.metadata.push({...x.metadata[0],id:2})]){
 m=setup();mutate(m);assert.equal(m.run('CLEAR').ok,false);assert.equal(m.writes.length,0);
}
m=setup();m.metadata.push({...m.metadata[0],id:2,value:'20'});assert.equal(m.run('CLEAR').code,'CLEANUP_METADATA_MISMATCH');assert.equal(m.writes.length,0);
m=setup();m.run('CLEAR');assert.throws(()=>m.ctx.kinojoHandleServerListSheetMarkCompleted_({},'POST'),/LIST_CLEANUP_RECOVERY_PENDING/);
assert(!JSON.stringify(m.run('CLEAR')).includes('before'),'receipt must not expose backup cells');
// If saving the before-image fails, no Sheet mutation is allowed.
m=setup();const properties=m.ctx.PropertiesService.getScriptProperties;
m.ctx.PropertiesService.getScriptProperties=()=>({...properties(),setProperty(){throw Error('SYNTHETIC_PROPERTY_QUOTA');}});
assert.equal(m.run('CLEAR').ok,false);assert.equal(m.writes.length,0);assert.deepEqual(m.cells[5],before);
m=setup();m.run('CLEAR');m.cells[5][0]='manual';assert.equal(m.run('RESTORE').code,'CLEANUP_MANUAL_EDIT_DETECTED');assert.equal(m.cells[5][0],'manual');assert(m.properties.KINOJO_LIST_CLEANUP_ACTIVE);
m=setup();m.run('CLEAR');[m.cells[5],m.cells[6]]=[m.cells[6],m.cells[5]];assert.equal(m.run('RESTORE').code,'CLEANUP_ROW_MOVED');assert.equal(m.writes.length,1);
m=setup();m.run('CLEAR');m.cells.splice(5,1);assert.equal(m.run('RESTORE').code,'CLEANUP_METADATA_MISMATCH');assert.equal(m.writes.length,1);
// A timeout after the API wrote must resume from the persisted before-image.
m=setup();const api=m.ctx.kinojoSheetsApi_;let fail=true;
m.ctx.kinojoSheetsApi_=(...args)=>{const r=api(...args);if(args[1]==='/values:batchUpdateByDataFilter'&&fail){fail=false;throw Error('SYNTHETIC_TIMEOUT_AFTER_WRITE');}return r;};
assert.equal(m.run('CLEAR').recoveryRequired,true);assert.deepEqual(m.cells[5],Array(8).fill(''));
assert.equal(m.run('CLEAR').state,'CLEARED');assert.equal(m.writes.length,1);assert.equal(m.run('RESTORE').state,'RESTORED');
// A property-store failure after terminal receipt is repaired by the same job retry.
m=setup();m.run('CLEAR');const pending=m.properties.KINOJO_LIST_CLEANUP_ACTIVE;m.run('COMPLETE',{dbFinalized:true});m.properties.KINOJO_LIST_CLEANUP_ACTIVE=pending;
assert.equal(m.run('COMPLETE',{dbFinalized:true}).replayed,true);assert(!m.properties.KINOJO_LIST_CLEANUP_ACTIVE);
m=setup();m.run('CLEAR');assert.equal(m.run('RESTORE',{jobId:'another-job-00002'}).code,'LIST_CLEANUP_RECOVERY_PENDING');
console.log('PASS cleanup I/O: disabled/auth, exact metadata/value fences, clear/restore/complete, timeout replay, terminal replay, manual edits/moves/formulas, writer fence and minimal tombstone');
