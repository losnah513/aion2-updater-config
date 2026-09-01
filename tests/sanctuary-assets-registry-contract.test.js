const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('ui/kinojo-sanctuary-assets.js');
const context={window:{}};
vm.runInNewContext(source,context,{filename:'kinojo-sanctuary-assets.js'});

const registry=context.window.KinojoSanctuaryAssets;
assert.ok(registry,'browser Sanctuary asset registry was not exposed');
const expected={
  rudra:'sanctuary-1-rudra',
  bagot:'sanctuary-2-bagot',
  kaldrix:'sanctuary-3-kaldrix',
  sanctuary4:'sanctuary-4-deltras'
};

for(const [code,directory] of Object.entries(expected)){
  const item=registry.get(code);
  assert.equal(item.directory,directory,`${code}: wrong asset directory`);
  assert.equal(item.background,`/assets/images/sanctuary/${directory}/background.webp`);
  assert.equal(item.boss,`/assets/images/sanctuary/${directory}/boss.webp`);
  for(const filename of ['background.webp','boss.webp']){
    const target=path.join(root,'assets','images','sanctuary',directory,filename);
    assert.ok(fs.existsSync(target),`${directory}/${filename} is missing`);
    assert.ok(fs.statSync(target).size>20_000,`${directory}/${filename} is unexpectedly small`);
  }
}

assert.equal(registry.get('4').code,'sanctuary4');
assert.equal(registry.get('deltras').code,'sanctuary4');
assert.equal(registry.get('unknown'),null);

const serverRegistry=read('supabase/functions/_shared/sanctuary-assets.ts');
for(const [code,directory] of Object.entries(expected)){
  assert.ok(serverRegistry.includes(`${code}:Object.freeze`),`server registry is missing ${code}`);
  assert.ok(serverRegistry.includes(`directory:'${directory}'`),`server registry is missing ${directory}`);
}

const master=read('ui/kinojo-sanctuary-master.js');
const management=read('sanctuary-management/js/sanctuary-management.js');
const renderer=read('supabase/functions/sanctuary-copy-render/index.ts');
for(const retired of ['/assets/images/sanctuary/backgrounds/','/assets/images/sanctuary/bosses-v2/']){
  assert.equal(master.includes(retired),false,`master still hard-codes ${retired}`);
  assert.equal(management.includes(retired),false,`management still hard-codes ${retired}`);
  assert.equal(renderer.includes(retired),false,`copy renderer still hard-codes ${retired}`);
}

console.log('KINOJO Sanctuary central asset registry contract: PASS');
