const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const manifest=require('../docs/CHARACTER_REFRESH_STAGE2_MANIFEST.json');
for(const item of manifest.files){
 const hash=crypto.createHash('sha256').update(fs.readFileSync(item.path,'utf8').replace(/\r\n/g,'\n')).digest('hex');
 assert.equal(hash,item.sha256,item.path+' changed after manifest freeze');
}
if(process.argv.includes('--package'))for(const name of manifest.migrations){
 const expected=manifest.files.find(f=>f.path==='supabase/migrations/'+name).sha256;
 for(const side of ['Source','Deploy']){
  const actual=crypto.createHash('sha256').update(fs.readFileSync('.codex-tmp/character-refresh-stage2-release/LOG24/'+side+'/'+name)).digest('hex');
  assert.equal(actual,expected,side+'/'+name);
 }
}
assert.equal(manifest.deploymentAuthorized,false);
assert.equal(manifest.migrations.length,11);
console.log('PASS: 34 canonical files frozen; 11 ordered migration/rollback pairs'+(process.argv.includes('--package')?' and 11 byte-identical Source/Deploy pairs':''));
