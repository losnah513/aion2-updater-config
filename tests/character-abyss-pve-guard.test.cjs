const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('../.codex-test-runtime/node_modules/@electric-sql/pglite');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const filename=fs.readdirSync(path.join(root,'supabase/migrations')).find(x=>x.endsWith('_character_abyss_pve_guard_v535.sql'));
const migration=read('supabase/migrations/'+filename),rollback=read('supabase/rollbacks/'+filename.replace('.sql','_rollback.sql'));
const names=['빛나는 멸룡왕의 대검','아칸 군단장의 가더','아칸 백부장의 흉갑','아칸 백부장의 각반','용암 심장의 투구','아칸 천부장의 견갑','아칸 천부장의 장갑','아칸 천부장의 장화','아칸 군단장의 망토','고결의 허리띠'];
const html=(title,items=names)=>'<div class="profile__info-power-level"><span>785765</span></div><div class="profile__info-item-level"><span>5994</span></div><div class="equipment info__section"><button class="equipment__tab-item active" aria-selected="true">무기 · 방어구</button><div class="equipment__slots">'+items.map(n=>'<div class="equipment__slots-item" data-item-name="'+n+'"><div class="equipment__item-name">'+n+'</div></div>').join('')+'</div></div>'+(title===null?'':'<div class="title info__section"><div class="title__item-stat">'+title+'</div></div>');
(async()=>{
 const db=new PGlite();
 await db.exec('create schema extensions;');
 await db.exec(read('tests/fixtures/character-parser-json-helpers.sql'));
 // Actual equipment/stat parsers and production title baseline, not mock classifiers.
 await db.exec(read('tests/fixtures/character-refresh-parser.sql').split('CREATE OR REPLACE FUNCTION public.kinojo_payload_gear_diagnosis')[0]);
 await db.exec(rollback);
 const stats=async(t,items=names)=>(await db.query('select kinojo_extract_aion_stats_from_text($1,$2,$3) result',[html(t,items),'오반','PVE'])).rows[0].result;
 const prior=await stats('PVE 피해 증폭 +5.5%');assert.equal(prior.gearType,'PVE');assert.equal(prior.abyssEquipmentSlotCount,7);
 await db.exec(migration);
 for(const title of ['PVE 피해 증폭 +5.5%','PVP 회피 +110','',null]){
  const r=await stats(title);assert.equal(r.gearType,'UNKNOWN');assert.equal(r.gearParseStatus,'UNKNOWN');assert.equal(r.itemLevel,5994);assert.equal(r.combatPower,785765);assert.equal(r.statParseStatus,'OK');assert.equal(r.parseStatus,'GEAR_TYPE_UNKNOWN');assert.equal(r.masterSyncEligible,false);
  for(const key of ['pveItemLevel','pveCombatPower','pvpItemLevel','pvpCombatPower'])assert.equal(r[key],null,key);
 }
 for(const title of ['PVP 피해 증폭 +5%','PVP 피해 내성 +5%','PVE 피해 증폭 +5% PVP 피해 내성 +5%'])assert.equal((await stats(title)).gearType,'PVP');
 const evidence={equipmentSectionFound:true,weaponArmorTabActive:true,visibleEquipmentSlotCount:10,populatedEquipmentSlotCount:10};
 const classify=async(title,e)=>(await db.query('select kinojo_extract_aion_pvp_dom($1,$2) result',[title===null?'':'<div class="title__item-stat">'+title+'</div>',JSON.stringify({...evidence,...e})])).rows[0].result;
 for(const count of [0,1,2,3,7])for(const title of ['PVE 피해 증폭 +5%','PVP 피해 내성 +5%',null])assert.equal((await classify(title,{abyssEquipmentSlotCount:count})).gearType,count<3?'PVE':title==='PVP 피해 내성 +5%'?'PVP':'UNKNOWN');
 for(const e of [{equipmentSectionFound:false},{visibleEquipmentSlotCount:0},{weaponArmorTabActive:false},{populatedEquipmentSlotCount:4}])assert.equal((await classify('PVP 피해 내성 +5%',{abyssEquipmentSlotCount:7,...e})).gearType,'UNKNOWN');
 assert.equal((await stats('PVE 피해 증폭 +5%',names.map(()=> '용암 심장의 흉갑'))).gearType,'PVE');
 assert.equal((await stats('PVP 피해 내성 +5%',names.slice(0,4))).gearType,'UNKNOWN');
 await db.exec(migration);assert.equal((await stats('PVE 피해 증폭 +5%')).gearType,'UNKNOWN');
 await db.exec(rollback);assert.equal((await stats('PVE 피해 증폭 +5%')).gearType,'PVE');
 await db.exec(migration);assert.equal((await stats('PVE 피해 증폭 +5%')).parserVersion,'535-abyss-pve-guard');
 await db.close();console.log('PASS: real equipment/stat parser, Obhan reproduction, typed-stat guard, 0/1/2/3/7 boundaries, PVP/incomplete regression, idempotency/rollback/reapply');
})().catch(e=>{console.error(e);process.exitCode=1;});
