const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
for(const name of ['character-profile-snapshot','character-detail-refresh']){
 const source=fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
 const context=vm.createContext({Deno:{env:{get:()=>''},serve:()=>{}},Response,URL,fetch:()=>{throw Error('unexpected network')},setTimeout,clearTimeout});
 vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'})+'\nglobalThis.items=equipmentItems;',context);
 const list=[['Pendant',9],['Seal2',26],['Bracelet2',16],['Seal1',25]].map(([slotPosName,slotPos],i)=>({slotPosName,slotPos,id:i+1,name:slotPosName,enchantLevel:10,exceedLevel:3}));
 const rows=context.items({equipment:{equipmentList:list}});
 assert.deepEqual(Array.from(rows,r=>r.slotPosName),['Bracelet2','Seal1','Seal2','Pendant']);
 assert.deepEqual(Array.from(rows.filter(r=>r.slotPosName.startsWith('Seal')),r=>[r.slotPos,r.slotLabel,r.category,r.group,r.enchantLevel,r.exceedLevel]),[[25,'인장 1','accessory','accessory',10,3],[26,'인장 2','accessory','accessory',10,3]]);
 assert.equal(context.items({equipment:{equipmentList:list.filter(r=>!r.slotPosName.startsWith('Seal'))}}).length,2,'no fabricated unequipped items');
 console.log('PASS',name,'seal category/order/labels/enchantment and old equipment');
}
// An older manual detail collection must not erase a newly equipped seal.
(async()=>{
 const source=fs.readFileSync('ui/kinojo-character-detail-refresh.js','utf8');
 for(const baseDate of ['2026-09-09','2026-09-01']){
  const base={fetchedAt:baseDate,equipment:[{slotPos:25}],arcana:[]};
  const manual={available:true,detailRefresh:{refreshedAt:'2026-09-08'},equipment:[],arcana:[]};
  const c=vm.createContext({window:{KinojoSupabase:{getLiveCharacterProfile:async()=>base}},invoke:async()=>manual,newestTimestamp:()=>baseDate,mergeProfilePreservingLatestMetrics:()=>({})});
  vm.runInContext(source.slice(source.indexOf('  function setupOverviewBridge(){'),source.indexOf('  function isMobileEquipmentViewport(){'))+'\nsetupOverviewBridge();',c);
  const result=await c.window.KinojoSupabase.getLiveCharacterProfile('overview');
  assert.equal(result.equipment.length,baseDate==='2026-09-09'?1:0);
 }
 console.log('PASS overview freshness preserves newly equipped seals and newer removals');
})().catch(e=>{console.error(e);process.exitCode=1});
