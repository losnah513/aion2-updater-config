const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const [page,canonical,mobile] of [
  ['sanctuary/index.html','https://kinojo.info/sanctuary/',false],
  ['m/sanctuary/index.html','https://kinojo.info/m/sanctuary/',true],
]){
  const html=read(page);
  for(const token of [
    '<title>KINOJO INFO - 성역</title>',canonical,'id="sanctuaryManagementTeamList"',
    'id="sanctuaryManagementSchedulePanel"','sanctuary-management.js?cache=2026090101',
    'sanctuary-management-draft.js?cache=2026083106','sanctuary-management-support.js?cache=2026082923',
    'kinojo-common-ui.js?cache=2026083001',
  ])assert.ok(html.includes(token),`${page}: canonical Sanctuary missing ${token}`);
  for(const retired of ['kinojo-sanctuary-tabs','id="forceEditBtn"','sanctuary/js/sanctuary.js','sanctuary-schedule.js']){
    assert.equal(html.includes(retired),false,`${page}: retired Sanctuary UI remains ${retired}`);
  }
  if(!mobile)assert.ok(html.includes('data-mobile-path="../m/sanctuary/"'),`${page}: canonical mobile route missing`);
}

function runRedirect(page,search,hash){
  const html=read(page);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,`${page}: redirect script missing`);
  let redirected='';
  const mobile=page.startsWith('m/');
  const context={
    location:{origin:'https://kinojo.info',search,hash,replace(value){redirected=value;}},
    URL,URLSearchParams,
  };
  vm.runInNewContext(script,context,{filename:page});
  return {html,redirected,mobile};
}

for(const [page,schedule] of [
  ['sanctuary-management/index.html',false],['sanctuary-schedule/index.html',true],
  ['m/sanctuary-management/index.html',false],['m/sanctuary-schedule/index.html',true],
]){
  const result=runRedirect(page,'?id=bagot&team=12&support=1','#force');
  const target=result.mobile?'/m/sanctuary/':'/sanctuary/';
  assert.ok(result.redirected.startsWith(target+'?'),`${page}: wrong canonical target ${result.redirected}`);
  assert.ok(result.redirected.includes('id=bagot')&&result.redirected.includes('team=12')&&result.redirected.includes('support=1'),`${page}: deep link parameters lost`);
  assert.equal(result.redirected.endsWith('#force'),true,`${page}: hash lost`);
  assert.equal(new URL('https://kinojo.info'+result.redirected).searchParams.get('view'),schedule?'schedule':null,`${page}: schedule view mapping mismatch`);
  assert.equal(result.html.includes('sanctuary-management.js'),false,`${page}: retired route still boots the product bundle`);
}

const common=read('ui/kinojo-common-ui.js');
assert.ok(common.includes("return base+'sanctuary/'"),'schedule notification must target canonical Sanctuary');
assert.ok(common.includes("'/m/sanctuary/':'/sanctuary/'"),'recruitment notification must target canonical Sanctuary');
assert.equal(common.includes("{key:'schedule',label:'성역 스케줄'"),false,'separate schedule topbar item remains');
assert.equal(common.includes("{key:'sanctuaryManagement',label:'성역 관리'"),false,'separate management topbar item remains');
assert.equal(common.includes('>성역 스케줄</a>'),false,'separate schedule drawer item remains');
assert.equal(common.includes('>성역 관리</a>'),false,'separate management drawer item remains');
assert.ok(common.includes("kinojo-sanctuary-assets.js?cache=2026090101"),'canonical Sanctuary asset registry loader is missing');
assert.ok(common.includes("kinojo-sanctuary-master.js?cache=2026090104"),'canonical Sanctuary master loader cache was not refreshed');

const master=read('ui/kinojo-sanctuary-master.js');
assert.ok(master.includes("kinojo_sanctuary_master_v229"),'canonical Sanctuary master session cache was not refreshed');

const support=read('sanctuary-management/js/sanctuary-management-support.js');
const supportCss=read('sanctuary-management/css/sanctuary-management-support.css');
for(const token of ['CLASS_ICON_MAP','class_icon_','const avatar=classIcon?\'<img src="',"classIconFor(character.className)"]){
  assert.ok(support.includes(token),`support modal class-icon contract missing ${token}`);
}
assert.equal(support.includes("Array.from(value(character.characterName)||'?')[0]"),false,'support modal still renders the first character glyph');
assert.ok(supportCss.includes('.sanctuary-management-support-avatar img{display:block;width:100%;height:100%;object-fit:cover}'),'support class icon sizing missing');

const sitemap=read('sitemap.xml');
assert.equal(sitemap.includes('sanctuary-schedule/'),false,'retired schedule URL remains in sitemap');
for(const page of ['admin/index.html','m/admin/index.html'])assert.ok(read(page).includes('../sanctuary/">열기'),`${page}: admin dashboard still links to a retired route`);

const sanctuary4Migration=read('supabase/migrations/20260830025830_sanctuary4_canonical_navigation_enable.sql');
for(const token of ["code = 'sanctuary4'","name is distinct from '비탄의 설원'","set enabled = true","available_from = date '2026-09-09'"]){
  assert.ok(sanctuary4Migration.includes(token),`sanctuary 4 canonical navigation migration missing ${token}`);
}

console.log('KINOJO canonical Sanctuary cutover and support class-icon contract: PASS');
