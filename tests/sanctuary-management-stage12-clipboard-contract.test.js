const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const copy=read('sanctuary-management/js/sanctuary-management-copy.js');
const renderer=read('supabase/functions/sanctuary-copy-render/index.ts');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');

const document={
  documentElement:{dataset:{}},
  addEventListener(){},
  querySelector(){return null;},
};
const window={
  KinojoSanctuaryManagementCopyBridge:{
    selectedSanctuary(){return {id:3,code:'kaldrix'};},
    findTeam(){return null;},
  },
};
const context={
  window,
  document,
  navigator:{},
  ClipboardItem:function ClipboardItem(){},
  AbortController,
  URL,
  Blob,
  Image:function Image(){},
  setTimeout,
  clearTimeout,
  console,
};
vm.runInNewContext(copy,context,{filename:'sanctuary-management-copy.js'});

const slot=(slotNo,occupied=false)=>({
  slotNo,
  occupied,
  requiredClassCode:occupied?'ALL':'CLERIC',
  character:occupied?{
    name:'테스트캐릭터',
    className:'검성',
    power:876321,
    relation:'ALT',
    mainCharacterName:'본캐이름',
  }:null,
});
const party=partyNo=>({partyNo,slots:Array.from({length:5},(_,index)=>slot(index+1,index===0))});
const team={
  teamId:15,
  title:'보리주니 팀',
  forces:Array.from({length:3},(_,index)=>({
    forceId:String(100+index),
    forceNo:index+1,
    parties:[party(1),party(2)],
  })),
};
const payload=window.KinojoSanctuaryManagementCopy.buildPayload(team,null);
assert.equal(payload.scope,'team');
assert.equal(payload.sanctuaryId,'kaldrix','selected sanctuary code must select the boss backdrop');
assert.equal(payload.managementSnapshot.forces.length,3);
assert.equal(payload.managementSnapshot.forces[0].parties[0].slots[1].requiredClassName,'치유성');
assert.equal(payload.managementSnapshot.forces[0].parties[0].slots[0].character.mainCharacterName,'본캐이름');

for(const token of [
  'const CARD_W = 228',
  'const CARD_H = 68',
  'const FORCE_W = 512',
  'const FORCE_HEADER_H = 50',
  'const TEAM_COLUMN_GAP = 14',
  'const columns=forces.length>1?2:1',
  'const rows=Math.ceil(forces.length/columns)',
  'index%columns',
  'Math.floor(index/columns)',
  'bossBackdropSvg(sanctuaryCode,"team"',
  'bossBackdropSvg(sanctuaryCode,"force"',
  'opacity=".30"',
  'rudra:{scale:1.16',
  'rudra:{scale:1.58',
  'bagot:{scale:1.23',
  'bagot:{scale:1.50',
  'kaldrix:{scale:1.20',
  'kaldrix:{scale:1.66',
  'fill="#effbf5"',
  'stroke="#4fc989"',
  'relationLabel=isMain?"본캐"',
  '-부캐',
  'nameLength<=5?20',
  'badgeSvg(relationLabel,64,4,isMain)',
  'width="54" height="54"',
  'x="${x+205}" y="${y+8}" width="34" height="34"',
  'x="${x+246}" y="${y+19}"',
  'x="${x+246}" y="${y+40}"',
  'x="${x+FORCE_W-16}" y="${y+35}" text-anchor="end" font-size="23"',
  'font-size="13.5"',
  '평균 전투력',
  'toFixed(1)',
])assert.ok(renderer.includes(token),`Stage 12 SVG contract missing ${token}`);

assert.ok(renderer.indexOf('badgeSvg(relationLabel,64,4,isMain)')<renderer.indexOf('<text x="64" y="40"'),'relation badge must render above the character name');
assert.equal(renderer.includes('titleWidth'),false,'force average power must no longer trail the force title');

assert.ok(renderer.indexOf('bossBackdropSvg(sanctuaryCode,"team"')!==renderer.indexOf('bossBackdropSvg(sanctuaryCode,"force"'));
assert.equal((renderer.match(/opacity="\.30"/g)||[]).length,1,'boss opacity belongs to the one shared backdrop renderer');
assert.equal(renderer.includes('2파티 · 평균'),false,'force metadata must drop the redundant party-count text');

const mobileStage=supportCss.indexOf('/* Stage 12: keep both parties beside each other');
assert.ok(mobileStage>0,'Stage 12 mobile override missing');
assert.ok(mobileStage>supportCss.lastIndexOf('.sanctuary-management-force-parties{grid-template-columns:1fr}'),'two-party override must win the earlier stacked mobile rule');
for(const token of [
  '.sanctuary-management-team-panel{padding:11px}',
  '.sanctuary-management-team-card{padding:10px 8px}',
  '.sanctuary-management-force-card{padding:8px',
  '.sanctuary-management-force-parties{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px',
  '.sanctuary-management-force-slot{min-width:0;min-height:42px',
  'grid-template-areas:"name server" "power power"',
])assert.ok(supportCss.slice(mobileStage).includes(token),`mobile density override missing ${token}`);

for(const page of ['sanctuary/index.html','m/sanctuary/index.html']){
  const html=read(page);
  assert.ok(html.includes('sanctuary-management-support.css?cache=2026090101'),`${page}: Stage 12 support cache missing`);
  assert.ok(html.includes('stage12=2026090101'),`${page}: Stage 12 marker missing`);
  assert.ok(html.includes('sanctuary-management-copy.js?cache=2026090101'),`${page}: Stage 12 copy bridge cache missing`);
}

console.log('KINOJO Sanctuary Stage 12 clipboard + mobile two-party contract: PASS');
