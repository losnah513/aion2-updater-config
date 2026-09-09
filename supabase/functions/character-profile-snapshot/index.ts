/* KINOJO Stored Character Profile
 * API 305.2 · 2026-08-22
 * - 최신 기본 Snapshot과 최근 officialRaw Snapshot을 병합한다.
 * - 장비 분류·공식 능력 합산·PASS KEY 소유 캐릭터 비교를 Server에서 처리한다.
 * - WEB의 PLAYNC 직접 호출과 Parser는 금지한다.
 */

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS",
  "content-type":"application/json; charset=utf-8",
  "cache-control":"private, max-age=60",
  "x-content-type-options":"nosniff"
};
const API_VERSION="305.3";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const clean=(value:unknown,max=1200)=>String(value??"").trim().slice(0,max);
const object=(value:unknown):Record<string,any>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
const positiveInt=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.trunc(n):null;};
const getCharKey=(value:unknown)=>{const match=clean(value,3000).match(/[?&]charKey=(\d{10,})/i);return match?match[1]:"";};

class SnapshotProfileError extends Error{
  code:string;
  status:number;
  constructor(message:string,code="STORED_PROFILE_FAILED",status=400){
    super(message);this.code=code;this.status=status;
  }
}

function serverHeaders(){
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY)throw new SnapshotProfileError("Server DB 연결 설정이 없습니다.","SERVER_DB_CONFIG_MISSING",500);
  return{apikey:SERVICE_ROLE_KEY,authorization:`Bearer ${SERVICE_ROLE_KEY}`,accept:"application/json","content-type":"application/json"};
}

async function dbRows(table:string,params:Record<string,string>){
  const url=new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:serverHeaders()});
  const raw=await response.text();
  if(!response.ok)throw new SnapshotProfileError(`저장 프로필 조회 실패 (${response.status})`,"STORED_PROFILE_DB_FAILED",502);
  try{return raw?JSON.parse(raw):[];}catch{throw new SnapshotProfileError("저장 프로필 응답 형식을 확인할 수 없습니다.","STORED_PROFILE_NON_JSON",502);}
}

async function rpc(name:string,args:Record<string,unknown>){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:"POST",headers:serverHeaders(),body:JSON.stringify(args)
  });
  const raw=await response.text();
  let data:Record<string,any>={};
  try{data=raw?JSON.parse(raw):{};}catch{}
  if(!response.ok)throw new SnapshotProfileError(clean(data.message||data.error||`회원 확인 실패 (${response.status})`,1000),"MEMBER_VERIFY_FAILED",502);
  return data;
}

const MASTER_SELECT="id,server_id,server_name,character_name,char_key,profile_image_url,detail_url,class_name,latest_pve_item_level,latest_pve_combat_power,latest_pvp_item_level,latest_pvp_combat_power,latest_snapshot_uid,last_synced_at,is_active,main_character_name,is_main";

async function findMaster(body:Record<string,any>){
  const charKey=clean(body.charKey||body.char_key,160);
  const serverId=positiveInt(body.serverId||body.server_id);
  const characterName=clean(body.characterName||body.name,160);
  const common={select:MASTER_SELECT,is_active:"eq.true",limit:"1"};
  let rows:Record<string,any>[]=[];
  if(charKey)rows=await dbRows("character_master",{...common,char_key:`eq.${charKey}`,order:"updated_at.desc"});
  if(!rows.length&&serverId&&characterName){
    rows=await dbRows("character_master",{...common,server_id:`eq.${serverId}`,character_name:`eq.${characterName}`,order:"updated_at.desc"});
  }
  if(!rows.length)throw new SnapshotProfileError("Server Master에서 캐릭터를 찾지 못했습니다.","CHARACTER_MASTER_NOT_FOUND",404);
  return rows[0];
}

function hasOfficialRaw(snapshot:Record<string,any>|null){
  return Object.keys(object(object(snapshot?.raw_payload).officialRaw)).length>0;
}

async function findSnapshots(master:Record<string,any>){
  const common={select:"id,snapshot_uid,schema_version,raw_payload,created_at,status,tool_name",limit:"1"};
  const snapshotUid=clean(master.latest_snapshot_uid,240);
  let latestRows:Record<string,any>[]=[];
  if(snapshotUid)latestRows=await dbRows("lookup_snapshots",{...common,snapshot_uid:`eq.${snapshotUid}`});
  if(!latestRows.length){
    latestRows=await dbRows("lookup_snapshots",{
      ...common,server_id:`eq.${positiveInt(master.server_id)}`,
      character_name:`eq.${clean(master.character_name,160)}`,order:"created_at.desc"
    });
  }
  const latest=latestRows[0]||null;
  if(hasOfficialRaw(latest))return{latest,detail:latest};
  const detailRows=await dbRows("lookup_snapshots",{
    ...common,server_id:`eq.${positiveInt(master.server_id)}`,
    character_name:`eq.${clean(master.character_name,160)}`,status:"eq.OK",
    "raw_payload->officialRaw":"not.is.null",order:"created_at.desc",limit:"10"
  });
  return{latest,detail:detailRows.find(hasOfficialRaw)||null};
}

type CoreStatDefinition={
  key:string;
  label:string;
  group:"basic"|"amplify"|"combat";
  aliases:string[];
  resistance?:boolean;
  absolute?:boolean;
};
type OfficialEffect={text:string;source:string};
const CORE_STATS:CoreStatDefinition[]=[
  {key:"attack",label:"공격력",group:"basic",aliases:["공격력 증가"]},
  {key:"defense",label:"방어력",group:"basic",aliases:["방어력 증가"]},
  {key:"accuracy",label:"명중",group:"basic",aliases:["명중 증가"]},
  {key:"evasion",label:"회피",group:"basic",aliases:["회피 증가"]},
  {key:"critical",label:"치명타",group:"basic",aliases:["치명타 증가"]},
  {key:"criticalResistance",label:"치명타 저항",group:"basic",aliases:["치명타 저항"],resistance:true},
  {key:"health",label:"생명력",group:"basic",aliases:["생명력 증가"]},
  {key:"mana",label:"정신력",group:"basic",aliases:["정신력 증가"]},
  {key:"combatSpeed",label:"전투 속도",group:"basic",aliases:["전투 속도"]},
  {key:"moveSpeed",label:"이동 속도",group:"basic",aliases:["이동 속도"]},
  {key:"damageAmplify",label:"피해 증폭",group:"amplify",aliases:["피해 증폭"]},
  {key:"damageResistance",label:"피해 내성",group:"amplify",aliases:["피해 내성"],resistance:true},
  {key:"weaponDamageAmplify",label:"무기 피해 증폭",group:"amplify",aliases:["무기 피해 증폭"]},
  {key:"criticalDamageAmplify",label:"치명타 피해 증폭",group:"amplify",aliases:["치명타 피해 증폭"]},
  {key:"frontDamageAmplify",label:"전방 피해 증폭",group:"amplify",aliases:["전방 피해 증폭"]},
  {key:"backDamageAmplify",label:"후방 피해 증폭",group:"amplify",aliases:["후방 피해 증폭"]},
  {key:"abnormalAccuracy",label:"상태이상 적중",group:"combat",aliases:["상태이상 적중"]},
  {key:"abnormalResistance",label:"상태이상 저항",group:"combat",aliases:["상태이상 저항"],resistance:true},
  {key:"block",label:"막기",group:"combat",aliases:["막기 증가"]},
  {key:"ironWall",label:"철벽",group:"combat",aliases:["철벽"]},
  {key:"ironWallPenetration",label:"철벽 관통",group:"combat",aliases:["철벽 관통"]},
  {key:"regeneration",label:"재생",group:"combat",aliases:["재생"]},
  {key:"regenerationPenetration",label:"재생 관통",group:"combat",aliases:["재생 관통"]},
  {key:"perfect",label:"완벽",group:"combat",aliases:["완벽"]},
  {key:"perfectResistance",label:"완벽 저항",group:"combat",aliases:["완벽 저항"],resistance:true},
  {key:"strongHit",label:"강타",group:"combat",aliases:["강타"]},
  {key:"strongHitResistance",label:"강타 저항",group:"combat",aliases:["강타 저항"],resistance:true},
  {key:"additionalHit",label:"다단 히트 적중",group:"combat",aliases:["다단 히트 적중"]},
  {key:"cooldown",label:"재사용 시간 감소",group:"combat",aliases:["재사용 시간 감소","재시전 시간 감소","재시전 시간"],absolute:true},
  {key:"manaCost",label:"정신력 소모 감소",group:"combat",aliases:["정신력 소모량"],absolute:true}
];
const WEAPON_SLOTS=new Set(["MainHand","SubHand"]);
const ARMOR_SLOTS=new Set(["Helmet","Shoulder","Torso","Belt","Pants","Gloves","Boots","Cape","Rune1","Rune2"]);
const SLOT_LABELS:Record<string,string>={
  MainHand:"주무기",SubHand:"보조무기",Helmet:"투구",Shoulder:"어깨",Torso:"상의",Pants:"하의",Gloves:"장갑",Boots:"장화",Cape:"망토",
  Belt:"허리띠",Necklace:"목걸이",Earring1:"귀걸이 1",Earring2:"귀걸이 2",Ring1:"반지 1",Ring2:"반지 2",
  Bracelet1:"팔찌 1",Bracelet2:"팔찌 2",Brooch1:"브로치 1",Brooch2:"브로치 2",Rune1:"룬 1",Rune2:"룬 2",
  Amulet:"아뮬렛",Seal1:"인장 1",Seal2:"인장 2",Pendant:"펜던트",Arcana1:"아르카나 1",Arcana2:"아르카나 2",Arcana3:"아르카나 3",Arcana4:"아르카나 4",
  Arcana5:"아르카나 5",Arcana6:"아르카나 6",Arcana7:"아르카나 7",Arcana8:"아르카나 8"
};
const SLOT_ORDER:Record<string,number>={
  MainHand:10,SubHand:20,Helmet:30,Shoulder:40,Torso:50,Belt:60,Pants:70,Gloves:80,Cape:90,Boots:100,Rune1:110,Rune2:120,
  Earring1:210,Earring2:220,EarringL:210,EarringR:220,Necklace:230,Amulet:240,Brooch1:250,Brooch2:260,Ring1:270,Ring2:280,
  Bracelet1:290,Bracelet2:300,Seal1:301,Seal2:302,Pendant:310,
  Arcana1:410,Arcana2:420,Arcana3:430,Arcana4:440,Arcana5:450,Arcana6:460,Arcana7:470,Arcana8:480
};

function collectOfficialEffects(info:Record<string,any>){
  const values:OfficialEffect[]=[];
  const statList=Array.isArray(info.stat?.statList)?info.stat.statList:[];
  for(const row of statList){
    const source=clean(row?.name||row?.type,120);
    for(const desc of Array.isArray(row?.statSecondList)?row.statSecondList:[]){
      const text=clean(desc,240);
      if(text)values.push({text,source});
    }
  }
  return values.filter((entry,index,list)=>list.findIndex(other=>other.text===entry.text&&other.source===entry.source)===index);
}

function parsedEffect(effect:OfficialEffect,def:CoreStatDefinition){
  const matchesAlias=def.aliases.some(value=>effect.text.includes(value));
  if(!matchesAlias)return null;
  const isResistance=effect.text.includes("저항")||effect.text.includes("내성");
  if(def.resistance!==true&&isResistance)return null;
  if(def.resistance===true&&!isResistance)return null;
  const match=effect.text.match(/([+-]?)\s*(\d+(?:\.\d+)?)\s*(%?)/);
  if(!match)return null;
  const raw=Number(match[2]);
  if(!Number.isFinite(raw))return null;
  return{
    value:def.absolute?Math.abs(raw):(match[1]==="-"?-1:1)*raw,
    unit:match[3]==="%"?"percent":"fixed",
    source:effect.source,text:effect.text
  };
}

function coreStats(info:Record<string,any>){
  const effects=collectOfficialEffects(info);
  return CORE_STATS.map(def=>{
    const matches=effects.map(effect=>parsedEffect(effect,def)).filter(Boolean) as Array<{value:number;unit:"percent"|"fixed";source:string;text:string}>;
    const totals=["percent","fixed"].map(unit=>{
      const values=matches.filter(match=>match.unit===unit);
      const value=values.reduce((sum,match)=>sum+match.value,0);
      return values.length?{unit,value:Number(value.toFixed(4))}:null;
    }).filter(Boolean);
    return{
      key:def.key,label:def.label,group:def.group,totals,
      contributions:matches.map(match=>({source:match.source,text:match.text,value:match.value,unit:match.unit})),
      available:matches.length>0,valueMode:"official_axis_sum",
      valueLabel:matches.length>0?"공식 능력 축 합계":"저장된 공식 상세값 없음"
    };
  });
}

function equipmentCategory(slotName:string){
  if(WEAPON_SLOTS.has(slotName))return"weapon";
  if(ARMOR_SLOTS.has(slotName))return"armor";
  if(/^Arcana\d+$/i.test(slotName))return"arcana";
  return"accessory";
}

function equipmentItems(equipmentPayload:Record<string,any>){
  const equipmentRoot=object(equipmentPayload.equipment);
  const skins=Array.isArray(equipmentRoot.skinList)?equipmentRoot.skinList:[];
  const skinBySlot=new Map<number,Record<string,any>>();
  for(const source of skins){
    const skin=object(source),slotPos=positiveInt(skin.slotPos);
    if(slotPos&&!skinBySlot.has(slotPos))skinBySlot.set(slotPos,skin);
  }
  return(Array.isArray(equipmentRoot.equipmentList)?equipmentRoot.equipmentList:[]).map((item:any)=>{
    const slotPos=positiveInt(item.slotPos),slotPosName=clean(item.slotPosName,80),category=equipmentCategory(slotPosName);
    const skin=slotPos?skinBySlot.get(slotPos):null;
    return{
      id:positiveInt(item.id),name:clean(item.name,240),grade:clean(item.grade,80),icon:clean(item.icon,1600),
      enchantLevel:Number(item.enchantLevel||0),exceedLevel:Number(item.exceedLevel||0),
      slotPos,slotPosName,slotLabel:SLOT_LABELS[slotPosName]||slotPosName,
      category,group:category==="arcana"?"arcana":category==="accessory"?"accessory":"weaponArmor",
      slotOrder:SLOT_ORDER[slotPosName]||Number(slotPos||9999),
      skinId:positiveInt(skin?.id),skinName:clean(skin?.name,240),skinIcon:clean(skin?.icon,1600),skinGrade:clean(skin?.grade,80)
    };
  }).sort((a:any,b:any)=>Number(a.slotOrder||9999)-Number(b.slotOrder||9999));
}

function overviewPayload(master:Record<string,any>,latestSnapshot:Record<string,any>|null,detailSnapshot:Record<string,any>|null){
  const raw=object(detailSnapshot?.raw_payload);
  const officialRaw=object(raw.officialRaw);
  const info=object(officialRaw.info);
  const equipmentPayload=object(officialRaw.equipment);
  const profile=object(info.profile);
  const statList=Array.isArray(info.stat?.statList)?info.stat.statList:[];
  const itemLevelRow=statList.find((row:any)=>clean(row?.type,80).toLowerCase()==="itemlevel");
  const items=equipmentItems(equipmentPayload);
  const boards=(Array.isArray(info.daevanion?.daevanionList)?info.daevanion.daevanionList:Array.isArray(info.daevanion?.boardList)?info.daevanion.boardList:[]).map((row:any)=>({
    id:positiveInt(row.id||row.boardId),name:clean(row.name||row.boardName,120),icon:clean(row.icon,1600),
    openNodeCount:Number(row.openNodeCount||0),totalNodeCount:Number(row.totalNodeCount||0),openPercent:Number(row.openPercent||0)
  }));
  const skills=(Array.isArray(equipmentPayload.skill?.skillList)?equipmentPayload.skill.skillList:[]).map((row:any)=>({
    id:positiveInt(row.id),name:clean(row.name,160),category:clean(row.category,80),
    level:Number(row.level||0),equip:Number(row.equip||0)===1,icon:clean(row.icon,1600)
  }));
  const officialRawAvailable=Object.keys(officialRaw).length>0;
  const fetchedAt=clean(raw.officialApiSource?.fetchedAt||detailSnapshot?.created_at||master.last_synced_at,80)||new Date().toISOString();
  const metrics={
    pve:{
      combatPower:Number(master.latest_pve_combat_power||profile.combatPower||0),
      itemLevel:Number(master.latest_pve_item_level||itemLevelRow?.value||profile.itemLevel||0)
    },
    pvp:{
      combatPower:Number(master.latest_pvp_combat_power||0),
      itemLevel:Number(master.latest_pvp_item_level||0)
    },
    updatedAt:master.last_synced_at||null,
    basis:"CHARACTER_MASTER_LATEST_BY_MODE"
  };
  return{
    ok:true,apiVersion:API_VERSION,source:"KINOJO_STORED_SNAPSHOT",fetchedAt,requestCount:0,
    snapshotId:latestSnapshot?.id||null,snapshotUid:latestSnapshot?.snapshot_uid||master.latest_snapshot_uid||null,
    snapshotSchemaVersion:latestSnapshot?.schema_version||null,officialRawAvailable,
    latestSnapshot:{id:latestSnapshot?.id||null,uid:latestSnapshot?.snapshot_uid||null,createdAt:latestSnapshot?.created_at||master.last_synced_at||null,schemaVersion:latestSnapshot?.schema_version||null,tool:latestSnapshot?.tool_name||null},
    detailSnapshot:{id:detailSnapshot?.id||null,uid:detailSnapshot?.snapshot_uid||null,createdAt:detailSnapshot?.created_at||null,schemaVersion:detailSnapshot?.schema_version||null,tool:detailSnapshot?.tool_name||null},
    detailSource:detailSnapshot&&latestSnapshot&&detailSnapshot.id!==latestSnapshot.id?"PREVIOUS_OFFICIAL_RAW":"LATEST_SNAPSHOT",
    identity:{masterId:positiveInt(master.id),serverId:positiveInt(master.server_id),characterId:clean(profile.characterId,900),charKey:clean(master.char_key||getCharKey(master.profile_image_url),160)},
    metrics,
    profile:{
      characterName:clean(master.character_name||profile.characterName,160),className:clean(master.class_name||profile.className,80),
      serverId:positiveInt(profile.serverId)||positiveInt(master.server_id),serverName:clean(master.server_name||profile.serverName,120),
      raceName:clean(profile.raceName,80),genderName:clean(profile.genderName,80),level:Number(profile.characterLevel||0),
      regionName:clean(profile.regionName,160),titleName:clean(profile.titleName,200),titleGrade:clean(profile.titleGrade,80),
      combatPower:metrics.pve.combatPower,itemLevel:metrics.pve.itemLevel,
      pveCombatPower:metrics.pve.combatPower,pveItemLevel:metrics.pve.itemLevel,
      pvpCombatPower:metrics.pvp.combatPower,pvpItemLevel:metrics.pvp.itemLevel,
      profileImageUrl:clean(master.profile_image_url||profile.profileImage,1600)
    },
    coreStatsMode:"official_axis_sum",
    coreStatsPolicy:{sameStatSameUnitOnly:true,fixedAndPercentSeparated:true,equipmentDetailExcluded:true,unverifiedFormulaExcluded:true},
    coreStats:coreStats(info),
    baseStats:statList.map((row:any)=>({name:clean(row.name,120),type:clean(row.type,80),value:row.value,effects:Array.isArray(row.statSecondList)?row.statSecondList.map((v:any)=>clean(v,240)):[]})),
    equipment:items.filter((item:any)=>item.category!=="arcana"),arcana:items.filter((item:any)=>item.category==="arcana"),skills,daevanion:boards,petwing:equipmentPayload.petwing||{},
    detailAvailable:items.length>0||statList.length>0,
    equipmentDetailStored:Object.keys(object(officialRaw.equipmentDetails)).length>0,
    note:officialRawAvailable
      ?(detailSnapshot&&latestSnapshot&&detailSnapshot.id!==latestSnapshot.id
        ?"최신 기본정보와 가장 최근 공식 상세 Snapshot을 Server에서 병합했습니다."
        :"공통 조회 Queue가 저장한 최신 공식 원본입니다.")
      :"공식 상세정보 수집 전입니다. 다음 공통 최신화 후 표시됩니다."
  };
}

function statMap(profile:Record<string,any>){
  const map=new Map<string,{key:string;label:string;unit:string;value:number}>();
  for(const row of Array.isArray(profile.baseStats)?profile.baseStats:[]){
    if(clean(row.type,80).toLowerCase()==="itemlevel")continue;
    const value=Number(row.value);
    if(Number.isFinite(value))map.set(`axis:${clean(row.type||row.name,100)}`,{key:`axis:${clean(row.type||row.name,100)}`,label:clean(row.name||row.type,120),unit:"fixed",value});
  }
  for(const row of Array.isArray(profile.coreStats)?profile.coreStats:[]){
    for(const total of Array.isArray(row.totals)?profile.coreStats?row.totals:[]:[]){
      const value=Number(total.value);
      if(Number.isFinite(value))map.set(`sum:${row.key}:${total.unit}`,{key:`sum:${row.key}:${total.unit}`,label:clean(row.label,120),unit:clean(total.unit,20),value});
    }
  }
  return map;
}

function compareProfiles(target:Record<string,any>,own:Record<string,any>){
  const targetMap=statMap(target),ownMap=statMap(own);
  const keys=[...new Set([...targetMap.keys(),...ownMap.keys()])];
  const stats=keys.map(key=>{
    const t=targetMap.get(key),o=ownMap.get(key);
    return{key,label:t?.label||o?.label||key,unit:t?.unit||o?.unit||"fixed",targetValue:t?.value??null,ownValue:o?.value??null,delta:t&&o?Number((o.value-t.value).toFixed(4)):null};
  });
  return{
    combatPower:{target:Number(target.profile?.combatPower||0),own:Number(own.profile?.combatPower||0),delta:Number(own.profile?.combatPower||0)-Number(target.profile?.combatPower||0)},
    itemLevel:{target:Number(target.profile?.itemLevel||0),own:Number(own.profile?.itemLevel||0),delta:Number(own.profile?.itemLevel||0)-Number(target.profile?.itemLevel||0)},
    stats
  };
}

async function overview(body:Record<string,any>){
  const master=await findMaster(body),snapshots=await findSnapshots(master);
  return overviewPayload(master,snapshots.latest,snapshots.detail);
}

async function equipmentItem(body:Record<string,any>){
  const profile=await overview(body);
  const itemId=positiveInt(body.itemId||body.id),slotPos=positiveInt(body.slotPos);
  const item=[...(Array.isArray(profile.equipment)?profile.equipment:[]),...(Array.isArray(profile.arcana)?profile.arcana:[])].find((row:any)=>
    (!itemId||Number(row.id)===itemId)&&(!slotPos||Number(row.slotPos)===slotPos)
  );
  if(!item)throw new SnapshotProfileError("저장된 장비 목록에서 선택 항목을 찾지 못했습니다.","EQUIPMENT_ITEM_NOT_FOUND",404);
  return{
    ok:true,apiVersion:API_VERSION,source:"KINOJO_STORED_SNAPSHOT",
    item,detailStored:false,
    message:"현재 공식 일괄 응답이 제공하는 장비명·등급·강화·돌파·슬롯 정보입니다. 옵션·마석 상세는 별도 상세 수집 전입니다."
  };
}

async function comparison(body:Record<string,any>){
  const passKey=clean(body.passKey||body.pass_key,240);
  if(!passKey)throw new SnapshotProfileError("PASS KEY 로그인이 필요합니다.","PASS_KEY_REQUIRED",401);
  const verified=await rpc("kinojo_member_verify_session_264",{p_pass_key:passKey,p_tool_name:"KINOJO_WEB_CHARACTER_COMPARE"});
  if(verified.ok!==true)throw new SnapshotProfileError(clean(verified.message||"PASS KEY를 확인할 수 없습니다.",600),clean(verified.code||"PASS_KEY_INVALID",120),403);
  const mainCharacter=clean(verified.profile?.mainCharacterName||verified.profile?.mainCharacter,160);
  if(!mainCharacter)throw new SnapshotProfileError("계정의 대표 캐릭터가 지정되지 않았습니다.","MAIN_CHARACTER_MISSING",409);
  const owned=await dbRows("character_master",{
    select:MASTER_SELECT,is_active:"eq.true",main_character_name:`eq.${mainCharacter}`,order:"is_main.desc,character_name.asc",limit:"50"
  });
  if(!owned.length)throw new SnapshotProfileError("계정에 연결된 캐릭터를 찾지 못했습니다.","OWNED_CHARACTER_NOT_FOUND",404);
  const requestedId=positiveInt(body.ownCharacterId||body.own_character_id);
  const ownMaster=owned.find((row:any)=>requestedId&&Number(row.id)===requestedId)||owned.find((row:any)=>row.is_main===true)||owned[0];
  const targetMaster=await findMaster(body);
  const [targetSnapshots,ownSnapshots]=await Promise.all([findSnapshots(targetMaster),findSnapshots(ownMaster)]);
  const target=overviewPayload(targetMaster,targetSnapshots.latest,targetSnapshots.detail);
  const own=overviewPayload(ownMaster,ownSnapshots.latest,ownSnapshots.detail);
  return{
    ok:true,apiVersion:API_VERSION,source:"KINOJO_SERVER_COMPARE",
    target:{id:target.identity.masterId,name:target.profile.characterName,serverName:target.profile.serverName,className:target.profile.className},
    own:{id:own.identity.masterId,name:own.profile.characterName,serverName:own.profile.serverName,className:own.profile.className},
    ownedCharacters:owned.map((row:any)=>({id:positiveInt(row.id),name:clean(row.character_name,160),serverName:clean(row.server_name,120),className:clean(row.class_name,80),isMain:row.is_main===true})),
    comparison:compareProfiles(target,own)
  };
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="POST")return json({ok:false,message:"POST만 허용합니다."},405);
  try{
    const body=object(await request.json().catch(()=>({})));
    const action=clean(body.action||"overview",80);
    if(action==="health")return json({ok:true,service:"character-profile-snapshot",apiVersion:API_VERSION,source:"KINOJO_STORED_SNAPSHOT",playncDirectRequestCount:0,features:["snapshot_merge","equipment_categories","arcana_separate","official_slot_order","equipment_skin_summary","official_axis_sum","pve_pvp_latest_metrics","passkey_comparison"]});
    if(action==="overview")return json(await overview(body));
    if(action==="equipmentItem")return json(await equipmentItem(body));
    if(action==="comparison")return json(await comparison(body));
    if(action==="daevanionDetail")return json({ok:false,code:"DETAIL_NOT_STORED",message:"데바니온 노드 상세는 공통 저장 범위 확장 후 표시합니다."},409);
    return json({ok:false,code:"UNKNOWN_ACTION",message:"지원하지 않는 저장 프로필 action입니다."},400);
  }catch(error:any){
    const status=Number(error?.status||500);
    return json({ok:false,code:clean(error?.code||"STORED_PROFILE_FAILED",120),message:clean(error?.message||error,1000),retryable:false},status>=400&&status<600?status:500);
  }
});
