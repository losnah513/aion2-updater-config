/* KINOJO Character Detail Refresh
 * API 305.3 · 2026-08-10
 * - 사용자 수동 요청 시에만 PLAYNC 장비/데바니온 상세를 순차 수집한다.
 * - 기본 캐릭터 조회에는 상세 호출을 추가하지 않는다.
 * - 캐릭터별 공용 실행 잠금과 완료 후 30분 쿨타임을 Server에서 적용한다.
 */

const CORS: Record<string,string> = {
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS",
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};
const API_VERSION="305.5";
const CONTRACT="302";
const SUPABASE_URL=String(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const SERVICE_ROLE_KEY=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"");
const FUNCTION_NAME="character-detail-refresh";
const OFFICIAL_BASE="https://aion2.plaync.com";
const ACTIVE_STATUSES=new Set(["queued","running","waiting"]);
const TERMINAL_STATUSES=new Set(["completed","partial_failed","failed"]);
const WEAPON_SLOTS=new Set(["MainHand","SubHand"]);
const ARMOR_SLOTS=new Set(["Helmet","Shoulder","Torso","Belt","Pants","Gloves","Boots","Cape","Rune1","Rune2"]);
const SLOT_LABELS:Record<string,string>={
  MainHand:"주무기",SubHand:"보조무기",Helmet:"투구",Shoulder:"어깨",Torso:"상의",Pants:"하의",Gloves:"장갑",Boots:"장화",Cape:"망토",
  Belt:"허리띠",Necklace:"목걸이",Earring1:"귀걸이 1",Earring2:"귀걸이 2",EarringL:"귀걸이 1",EarringR:"귀걸이 2",
  Ring1:"반지 1",Ring2:"반지 2",Bracelet1:"팔찌 1",Bracelet2:"팔찌 2",Brooch1:"브로치 1",Brooch2:"브로치 2",
  Rune1:"룬 1",Rune2:"룬 2",Amulet:"아뮬렛",Seal1:"인장 1",Seal2:"인장 2",Pendant:"펜던트",
  Arcana1:"아르카나 1",Arcana2:"아르카나 2",Arcana3:"아르카나 3",Arcana4:"아르카나 4",
  Arcana5:"아르카나 5",Arcana6:"아르카나 6",Arcana7:"아르카나 7",Arcana8:"아르카나 8"
};
const SLOT_ORDER:Record<string,number>={
  MainHand:10,SubHand:20,Helmet:30,Shoulder:40,Torso:50,Belt:60,Pants:70,Gloves:80,Cape:90,Boots:100,Rune1:110,Rune2:120,
  Earring1:210,Earring2:220,EarringL:210,EarringR:220,Necklace:230,Amulet:240,Brooch1:250,Brooch2:260,Ring1:270,Ring2:280,
  Bracelet1:290,Bracelet2:300,Seal1:301,Seal2:302,Pendant:310,
  Arcana1:410,Arcana2:420,Arcana3:430,Arcana4:440,Arcana5:450,Arcana6:460,Arcana7:470,Arcana8:480
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const object=(value:unknown):Record<string,any>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,any>:{};
const clean=(value:unknown,max=1200)=>String(value??"").trim().slice(0,max);
const positiveInt=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.trunc(n):null;};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
const normalizeName=(value:unknown)=>clean(value,160).normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]+/g,"").toLocaleLowerCase("ko-KR");

class DetailError extends Error{
  code:string;status:number;retryable:boolean;rateLimited:boolean;retryAfterMs:number;
  constructor(message:string,code="DETAIL_REFRESH_FAILED",status=500,options:Record<string,any>={}){
    super(message);this.code=code;this.status=status;this.retryable=options.retryable!==false;
    this.rateLimited=options.rateLimited===true;this.retryAfterMs=Math.max(0,Number(options.retryAfterMs||0));
  }
}

function serviceHeaders(extra:Record<string,string>={}){
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY)throw new DetailError("Supabase service 환경 설정이 없습니다.","SERVER_CONFIG_MISSING",500,{retryable:false});
  return {apikey:SERVICE_ROLE_KEY,authorization:`Bearer ${SERVICE_ROLE_KEY}`,"content-type":"application/json",...extra};
}

async function boundedDetailFetch(url:string|URL,options:RequestInit,timeoutMs=30000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const raw=await response.text();
    return {ok:response.ok,status:response.status,text:async()=>raw};
  }catch(error){
    if(controller.signal.aborted)throw new DetailError('Server 응답 시간 초과','SERVER_CALL_TIMEOUT',504);
    throw error;
  }finally{clearTimeout(timer);}
}

async function dbRows(table:string,params:Record<string,string>){
  const url=new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  const response=await boundedDetailFetch(url,{headers:serviceHeaders({accept:"application/json"}),cache:"no-store"});
  const raw=await response.text();
  if(!response.ok)throw new DetailError(`Server DB 조회 실패 (${response.status})`,"SERVER_DB_READ_FAILED",502);
  try{return raw?JSON.parse(raw):[];}catch{throw new DetailError("Server DB 응답이 JSON이 아닙니다.","SERVER_DB_NON_JSON",502);}
}

async function rpc(name:string,args:Record<string,unknown>){
  const response=await boundedDetailFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:serviceHeaders(),body:JSON.stringify(args)});
  const raw=await response.text();let data:Record<string,any>={};
  try{data=raw?JSON.parse(raw):{};}catch{data={ok:false,message:raw};}
  if(!response.ok)throw new DetailError(clean(data.message||data.error||data.details||`RPC ${name} HTTP ${response.status}`,1000),"SERVER_RPC_FAILED",502);
  return data;
}

function characterIdFromDetailUrl(value:unknown){
  const source=clean(value,2000);if(!source)return "";
  try{
    const url=new URL(source,OFFICIAL_BASE);const parts=url.pathname.split("/").filter(Boolean);
    const index=parts.findIndex(part=>part.toLowerCase()==="characters");
    return index>=0&&parts[index+2]?decodeURIComponent(parts[index+2]):"";
  }catch{return "";}
}

async function findMaster(body:Record<string,any>){
  const masterId=positiveInt(body.characterMasterId||body.masterId||body.character_master_id);
  if(masterId){
    const rows=await dbRows("character_master",{select:"id,server_id,server_name,character_name,char_key,profile_image_url,detail_url,class_name,is_active",id:`eq.${masterId}`,limit:"1"});
    if(rows[0]&&rows[0].is_active!==false)return rows[0];
    throw new DetailError("캐릭터 Master를 찾지 못했습니다.","CHARACTER_MASTER_NOT_FOUND",404,{retryable:false});
  }
  const serverId=positiveInt(body.serverId||body.server_id);
  if(!serverId)throw new DetailError("캐릭터 서버 정보가 없습니다.","SERVER_ID_REQUIRED",400,{retryable:false});
  const rows=await dbRows("character_master",{select:"id,server_id,server_name,character_name,char_key,profile_image_url,detail_url,class_name,is_active",server_id:`eq.${serverId}`,is_active:"eq.true",limit:"1000"});
  const wantedCharacterId=clean(body.characterId||body.character_id,1000);
  const wantedName=normalizeName(body.characterName||body.name);
  let hit=null;
  if(wantedCharacterId)hit=rows.find((row:any)=>characterIdFromDetailUrl(row.detail_url)===wantedCharacterId)||null;
  if(!hit&&wantedName)hit=rows.find((row:any)=>normalizeName(row.character_name)===wantedName)||null;
  if(!hit)throw new DetailError("Server Master에서 캐릭터를 찾지 못했습니다.","CHARACTER_MASTER_NOT_FOUND",404,{retryable:false});
  return hit;
}

function equipmentCategory(slotName:string){
  if(WEAPON_SLOTS.has(slotName))return "weapon";
  if(ARMOR_SLOTS.has(slotName))return "armor";
  if(/^Arcana\d+$/i.test(slotName))return "arcana";
  return "accessory";
}

function canonicalAppearanceSlot(value:unknown){
  const source=clean(value,80).replace(/[\s_-]+/g,"");
  const sideMatch=source.match(/^(Earring|Ring|Bracelet|Brooch)(1|2|L|R)$/i);
  if(sideMatch){
    const side=/^(1|l)$/i.test(sideMatch[2])?"L":"R";
    return `${sideMatch[1].toLowerCase()}${side.toLowerCase()}`;
  }
  return source.toLowerCase();
}

function equipmentItems(payload:Record<string,any>){
  const root=object(object(payload).equipment);
  const skins=Array.isArray(root.skinList)?root.skinList:[];
  const skinByName=new Map<string,Record<string,any>>();
  const unnamedSkinBySlot=new Map<number,Record<string,any>>();
  for(const source of skins){
    const skin=object(source),slotPos=positiveInt(skin.slotPos),slotKey=canonicalAppearanceSlot(skin.slotPosName);
    if(slotKey&&!skinByName.has(slotKey))skinByName.set(slotKey,skin);
    else if(!slotKey&&slotPos&&!unnamedSkinBySlot.has(slotPos))unnamedSkinBySlot.set(slotPos,skin);
  }
  return (Array.isArray(root.equipmentList)?root.equipmentList:[]).map((source:any)=>{
    const item=object(source),slotPos=positiveInt(item.slotPos),slotPosName=clean(item.slotPosName,80),category=equipmentCategory(slotPosName);
    const skin=skinByName.get(canonicalAppearanceSlot(slotPosName))||(slotPos?unnamedSkinBySlot.get(slotPos):null);
    return {
      id:positiveInt(item.id),name:clean(item.name,240),grade:clean(item.grade,80),icon:clean(item.icon,1600),
      enchantLevel:Math.max(0,Number(item.enchantLevel||0)),exceedLevel:Math.max(0,Number(item.exceedLevel||0)),
      slotPos,slotPosName,slotLabel:SLOT_LABELS[slotPosName]||slotPosName,
      category,group:category==="arcana"?"arcana":category==="accessory"?"accessory":"weaponArmor",
      slotOrder:SLOT_ORDER[slotPosName]||Number(slotPos||9999),
      skinId:positiveInt(skin?.id),skinName:clean(skin?.name,240),skinIcon:clean(skin?.icon,1600),skinGrade:clean(skin?.grade,80)
    };
  }).filter((item:any)=>item.id&&item.slotPos).sort((a:any,b:any)=>Number(a.slotOrder||9999)-Number(b.slotOrder||9999));
}

function arcanaSetEffects(rows:any[]){
  const sets=new Map<string,Record<string,any>>();
  for(const row of rows){
    const set=object(object(row?.raw_payload).set),id=clean(set.id||set.name,160);
    if(!id||sets.has(id))continue;
    const equippedCount=Math.max(0,Number(set.equippedCount||0));
    const bonuses=(Array.isArray(set.bonuses)?set.bonuses:[]).map((source:any)=>{
      const bonus=object(source),degree=Math.max(0,Number(bonus.degree||0));
      return {degree,descriptions:(Array.isArray(bonus.descriptions)?bonus.descriptions:[]).map((value:any)=>clean(value,1000)).filter(Boolean),active:equippedCount>=degree};
    }).filter((bonus:any)=>bonus.degree>0&&bonus.descriptions.length>0).sort((a:any,b:any)=>a.degree-b.degree);
    sets.set(id,{id,name:clean(set.name||id,200),equippedCount,bonuses});
  }
  return [...sets.values()].sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"ko-KR"));
}

function daevanionBoards(info:Record<string,any>){
  const root=object(info.daevanion);
  const list=Array.isArray(root.boardList)?root.boardList:Array.isArray(root.daevanionList)?root.daevanionList:[];
  return list.map((source:any)=>{const row=object(source);return{
    id:positiveInt(row.id||row.boardId),name:clean(row.name||row.boardName,160),icon:clean(row.icon,1600),
    openNodeCount:Number(row.openNodeCount||0),totalNodeCount:Number(row.totalNodeCount||0),openPercent:Number(row.openPercent||0),open:Number(row.open||0)
  };}).filter((row:any)=>row.id);
}

function profilePayload(infoPayload:Record<string,any>,equipmentPayload:Record<string,any>,master:Record<string,any>,job:Record<string,any>){
  const info=object(infoPayload),profile=object(info.profile),statList=Array.isArray(info.stat?.statList)?info.stat.statList:[];
  const itemLevelRow=statList.find((row:any)=>clean(row?.type,80).toLowerCase()==="itemlevel");
  const skills=(Array.isArray(equipmentPayload.skill?.skillList)?equipmentPayload.skill.skillList:[]).map((source:any)=>{const row=object(source);return{
    id:positiveInt(row.id),name:clean(row.name,160),category:clean(row.category,80),level:Number(row.level||0),acquired:Number(row.acquired||0),equip:Number(row.equip||0)===1,icon:clean(row.icon,1600)
  };});
  const items=equipmentItems(equipmentPayload);
  return {
    profile:{
      characterName:clean(profile.characterName||master.character_name,160),className:clean(profile.className||master.class_name,80),
      serverId:positiveInt(profile.serverId)||positiveInt(master.server_id),serverName:clean(profile.serverName||master.server_name,120),
      raceName:clean(profile.raceName,80),genderName:clean(profile.genderName,80),level:Number(profile.characterLevel||0),
      regionName:clean(profile.regionName,160),titleName:clean(profile.titleName,200),titleGrade:clean(profile.titleGrade,80),
      combatPower:Number(profile.combatPower||0),itemLevel:Number(itemLevelRow?.value||profile.itemLevel||0),
      profileImageUrl:clean(profile.profileImage||master.profile_image_url,1600)
    },
    baseStats:statList.map((source:any)=>{const row=object(source);return{name:clean(row.name,120),type:clean(row.type,80),value:row.value,effects:Array.isArray(row.statSecondList)?row.statSecondList.map((v:any)=>clean(v,240)):[]};}),
    equipment:items.filter((item:any)=>item.category!=="arcana"),arcana:items.filter((item:any)=>item.category==="arcana"),skills,daevanion:daevanionBoards(info),petwing:object(equipmentPayload.petwing),
    detailRefresh:{jobId:job.id,status:job.status,refreshedAt:job.completed_at||job.updated_at,cooldownUntil:job.cooldown_until}
  };
}

function retryAfterMs(value:unknown){
  const raw=clean(value,160);if(!raw)return 30000;const seconds=Number(raw);
  if(Number.isFinite(seconds)&&seconds>0)return Math.min(Math.max(Math.ceil(seconds*1000),1000),600000);
  const date=Date.parse(raw);if(Number.isFinite(date))return Math.min(Math.max(date-Date.now(),1000),600000);
  return 30000;
}

async function officialJson(url:string,jobId:string,source:string,counter:{calls:number}){
  const gate=await rpc("kinojo_character_detail_rate_acquire_v302",{p_job_id:jobId,p_source:source});
  if(gate.ok!==true)throw new DetailError(clean(gate.message||gate.code||"PLAYNC 요청 제어 실패",1000),clean(gate.code||"PLAYNC_RATE_GATE_FAILED",120),502);
  const gateWait=Math.max(0,Number(gate.waitMs||0));
  if(gate.allowed===false)throw new DetailError(clean(gate.message||"PLAYNC 요청 제한 대기 중입니다.",1000),"PLAYNC_RATE_PAUSED",429,{rateLimited:true,retryAfterMs:gateWait||30000});
  if(gateWait>30000)throw new DetailError("다른 공식 조회 작업의 요청 순서를 기다리고 있습니다.","PLAYNC_RATE_WAIT",429,{rateLimited:true,retryAfterMs:gateWait});
  if(gateWait>0)await sleep(gateWait);

  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);counter.calls+=1;
  try{
    const response=await fetch(url,{headers:{accept:"application/json,text/plain,*/*","accept-language":"ko-KR,ko;q=0.9","user-agent":`KINOJO-Character-Detail/${API_VERSION}`},signal:controller.signal,redirect:"follow"});
    const raw=await response.text();
    if(!response.ok){
      if(response.status===429){
        const delay=retryAfterMs(response.headers.get("retry-after"));
        const reported=await rpc("kinojo_character_detail_rate_limit_v302",{p_job_id:jobId,p_retry_after_seconds:Math.max(1,Math.ceil(delay/1000)),p_source:source,p_message:`PLAYNC HTTP 429: ${raw.slice(0,300)}`});
        throw new DetailError("PLAYNC 요청 제한으로 자동 대기합니다.","PLAYNC_HTTP_429",429,{rateLimited:true,retryAfterMs:Number(reported.retryAfterMs||delay)});
      }
      throw new DetailError(`PLAYNC HTTP ${response.status}: ${raw.slice(0,300)}`,`PLAYNC_HTTP_${response.status}`,response.status,response.status===408||response.status>=500?{}:{retryable:false});
    }
    await rpc("kinojo_character_detail_rate_success_v302",{p_job_id:jobId,p_source:source});
    try{return raw?JSON.parse(raw):{};}catch{throw new DetailError("PLAYNC 공식 응답이 JSON 형식이 아닙니다.","PLAYNC_NON_JSON",502);}
  }catch(error:any){
    if(error?.name==="AbortError")throw new DetailError("PLAYNC 공식 API 응답 시간이 초과되었습니다.","PLAYNC_TIMEOUT",504);
    throw error;
  }finally{clearTimeout(timer);}
}

function officialUrl(path:string,params:Record<string,unknown>){
  const url=new URL(path,OFFICIAL_BASE);url.searchParams.set("lang","ko");
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&String(value)!=="")url.searchParams.set(key,String(value));
  return url.toString();
}

async function getJob(jobId:string){
  const rows=await dbRows("character_detail_refresh_jobs",{select:"*",id:`eq.${jobId}`,limit:"1"});
  if(!rows[0])throw new DetailError("상세 갱신 작업을 찾지 못했습니다.","DETAIL_JOB_NOT_FOUND",404,{retryable:false});
  return rows[0];
}

async function detailWrite(job:Record<string,any>,kind:string,payload:Record<string,any>){
  const result=await rpc("kinojo_character_detail_write_v1",{p_job_id:job.id,p_worker_id:job.worker_id,p_kind:kind,p_payload:payload});
  if(result.ok!==true)throw new DetailError(clean(result.message||result.code||"상세 저장이 차단되었습니다.",1000),clean(result.code||"DETAIL_WRITE_FAILED",120),409,{retryable:false});
  return result;
}

async function patchJob(job:Record<string,any>,patch:Record<string,any>){
  return (await detailWrite(job,"job",patch)).job;
}

function assertDetailIdentity(master:Record<string,any>,info:Record<string,any>){
  const p=object(info.profile),key=clean(master.char_key,120);
  if(!/^[0-9]+$/.test(key)||typeof p.charKey!=="string"||p.charKey!==key||
    positiveInt(p.serverId)!==positiveInt(master.server_id)||!clean(p.characterName)||
    normalizeName(p.characterName)!==normalizeName(master.character_name)||
    !clean(master.class_name)||clean(p.className)!==clean(master.class_name))
    throw new DetailError("공식 신원이 저장된 캐릭터와 일치하지 않습니다. 캐릭터 정보 최신화를 먼저 진행해 주세요.","DETAIL_IDENTITY_MISMATCH",409,{retryable:false});
}

function countTotals(items:any[]){
  const result={weapon:0,armor:0,accessory:0,arcana:0};
  for(const item of items)if(Object.prototype.hasOwnProperty.call(result,item.category))result[item.category as keyof typeof result]+=1;
  return result;
}

function progressField(category:string,kind:"done"|"failed"){
  const safe=["weapon","armor","accessory","arcana"].includes(category)?category:"accessory";
  return `${safe}_${kind}`;
}

function appendFailure(job:Record<string,any>,entry:Record<string,any>){
  const list=Array.isArray(job.failure_items)?job.failure_items.slice(-99):[];list.push(entry);return list;
}

async function waitJob(job:Record<string,any>,error:DetailError,calls:number){
  const waitMs=Math.max(1000,error.retryAfterMs||30000),resumeAt=new Date(Date.now()+waitMs).toISOString();
  await patchJob(job,{status:"waiting",worker_id:null,resume_at:resumeAt,last_heartbeat_at:new Date().toISOString(),
    request_count:Number(job.request_count||0)+calls,last_error_code:error.code,last_error_message:clean(error.message,1000),
    current_label:`PLAYNC 요청 제한 · ${Math.ceil(waitMs/1000)}초 후 자동 재개`});
  dispatchRun(job.id,waitMs);return {ok:true,waiting:true,retryAfterMs:waitMs};
}

async function failJob(job:Record<string,any>,error:any,calls:number){
  const cooldown=new Date(Date.now()+30*60*1000).toISOString();
  await patchJob(job,{status:"failed",phase:"COMPLETE",worker_id:null,resume_at:null,completed_at:new Date().toISOString(),cooldown_until:cooldown,
    request_count:Number(job.request_count||0)+calls,last_error_code:clean(error?.code||"DETAIL_REFRESH_FAILED",120),last_error_message:clean(error?.message||error,1000),
    current_category:"complete",current_label:"전체 상세정보 갱신 실패"});
}

async function initializeJob(job:Record<string,any>,counter:{calls:number}){
  const masterRows=await dbRows("character_master",{select:"id,server_id,server_name,character_name,char_key,profile_image_url,detail_url,class_name,is_active",id:`eq.${job.character_master_id}`,limit:"1"});
  const master=masterRows[0];if(!master)throw new DetailError("캐릭터 Master를 찾지 못했습니다.","CHARACTER_MASTER_NOT_FOUND",404,{retryable:false});
  const characterId=clean(characterIdFromDetailUrl(master.detail_url),1000);
  if(!characterId)throw new DetailError("PLAYNC 캐릭터 식별값을 확인할 수 없습니다.","CHARACTER_ID_MISSING",409,{retryable:false});
  const serverId=positiveInt(master.server_id);if(!serverId)throw new DetailError("캐릭터 서버 ID가 없습니다.","SERVER_ID_MISSING",409,{retryable:false});
  await patchJob(job,{character_id:characterId,server_id:serverId,character_name:master.character_name,current_category:"basic",current_label:"최신 프로필·장비 목록 확인 중",last_heartbeat_at:new Date().toISOString()});
  const info=await officialJson(officialUrl("/api/character/info",{serverId,characterId}),job.id,"CHARACTER_DETAIL_INFO",counter);
  assertDetailIdentity(master,info);
  const equipment=await officialJson(officialUrl("/api/character/equipment",{serverId,characterId}),job.id,"CHARACTER_DETAIL_EQUIPMENT_LIST",counter);
  const items=equipmentItems(equipment),boards=daevanionBoards(info),totals=countTotals(items);
  if(items.length<1)throw new DetailError("PLAYNC 장착 장비 목록이 비어 있습니다.","DETAIL_EQUIPMENT_EMPTY",409);
  return await patchJob(job,{phase:"EQUIPMENT",status:"running",character_id:characterId,
    base_info_payload:info,base_equipment_payload:equipment,equipment_targets:items,daevanion_targets:boards,
    equipment_cursor:0,daevanion_cursor:0,weapon_total:totals.weapon,armor_total:totals.armor,accessory_total:totals.accessory,arcana_total:totals.arcana,
    daevanion_total:boards.length,current_category:"weapon",current_label:"장비 상세 수집 시작",last_heartbeat_at:new Date().toISOString(),
    request_count:Number(job.request_count||0)+counter.calls});
}

async function processEquipment(job:Record<string,any>,counter:{calls:number}){
  const targets=Array.isArray(job.equipment_targets)?job.equipment_targets:[];let cursor=Math.max(0,Number(job.equipment_cursor||0));
  const patch:Record<string,any>={};const limit=Math.min(targets.length,cursor+5);
  for(;cursor<limit;cursor+=1){
    const target=object(targets[cursor]),category=clean(target.category,20)||"accessory";
    await patchJob(job,{current_category:category,current_label:clean(target.name||"장비 상세",240),last_heartbeat_at:new Date().toISOString()});
    try{
      const detail=await officialJson(officialUrl("/api/character/equipment/item",{
        id:target.id,enchantLevel:Number(target.enchantLevel||0),characterId:job.character_id,serverId:job.server_id,slotPos:target.slotPos
      }),job.id,"CHARACTER_DETAIL_EQUIPMENT_ITEM",counter);
      await detailWrite(job,"equipment",{
        character_master_id:job.character_master_id,slot_pos:target.slotPos,item_id:target.id,item_name:target.name,slot_pos_name:target.slotPosName,
        slot_label:target.slotLabel,category,grade:target.grade,icon:target.icon,enchant_level:Number(target.enchantLevel||0),exceed_level:Number(target.exceedLevel||0),
        raw_payload:detail,refresh_job_id:job.id,refreshed_at:new Date().toISOString(),updated_at:new Date().toISOString()
      });
      const key=progressField(category,"done");job[key]=Number(job[key]||0)+1;patch[key]=job[key];
    }catch(error:any){
      if(["DETAIL_STALE_WORKER","DETAIL_IDENTITY_CHANGED","DETAIL_IDENTITY_MISMATCH","DETAIL_TARGET_MISMATCH"].includes(error?.code))throw error;
      if(error?.rateLimited===true){
        await patchJob(job,{...patch,equipment_cursor:cursor,request_count:Number(job.request_count||0)+counter.calls,last_heartbeat_at:new Date().toISOString()});
        job.request_count=Number(job.request_count||0)+counter.calls;counter.calls=0;return await waitJob(job,error,counter.calls);
      }
      const key=progressField(category,"failed");job[key]=Number(job[key]||0)+1;patch[key]=job[key];
      job.failure_items=appendFailure(job,{type:"equipment",category,itemId:target.id,slotPos:target.slotPos,name:target.name,code:clean(error?.code||"DETAIL_ITEM_FAILED",120),message:clean(error?.message||error,600)});
      patch.failure_items=job.failure_items;
    }
  }
  patch.equipment_cursor=cursor;patch.request_count=Number(job.request_count||0)+counter.calls;counter.calls=0;
  patch.last_heartbeat_at=new Date().toISOString();
  if(cursor>=targets.length){patch.phase="DAEVANION";patch.current_category="daevanion";patch.current_label="데바니온 상세 수집 시작";}
  return await patchJob(job,patch);
}

async function processDaevanion(job:Record<string,any>,counter:{calls:number}){
  const targets=Array.isArray(job.daevanion_targets)?job.daevanion_targets:[];let cursor=Math.max(0,Number(job.daevanion_cursor||0));
  const patch:Record<string,any>={};const limit=Math.min(targets.length,cursor+2);
  for(;cursor<limit;cursor+=1){
    const target=object(targets[cursor]);
    await patchJob(job,{current_category:"daevanion",current_label:clean(target.name||"데바니온 보드",240),last_heartbeat_at:new Date().toISOString()});
    try{
      const detail=await officialJson(officialUrl("/api/character/daevanion/detail",{id:target.id,characterId:job.character_id,serverId:job.server_id,boardId:target.id}),job.id,"CHARACTER_DETAIL_DAEVANION",counter);
      await detailWrite(job,"daevanion",{
        character_master_id:job.character_master_id,board_id:target.id,board_name:target.name,raw_payload:detail,refresh_job_id:job.id,
        refreshed_at:new Date().toISOString(),updated_at:new Date().toISOString()
      });
      job.daevanion_done=Number(job.daevanion_done||0)+1;patch.daevanion_done=job.daevanion_done;
    }catch(error:any){
      if(["DETAIL_STALE_WORKER","DETAIL_IDENTITY_CHANGED","DETAIL_IDENTITY_MISMATCH","DETAIL_TARGET_MISMATCH"].includes(error?.code))throw error;
      if(error?.rateLimited===true){
        await patchJob(job,{...patch,daevanion_cursor:cursor,request_count:Number(job.request_count||0)+counter.calls,last_heartbeat_at:new Date().toISOString()});
        job.request_count=Number(job.request_count||0)+counter.calls;counter.calls=0;return await waitJob(job,error,counter.calls);
      }
      job.daevanion_failed=Number(job.daevanion_failed||0)+1;patch.daevanion_failed=job.daevanion_failed;
      job.failure_items=appendFailure(job,{type:"daevanion",boardId:target.id,name:target.name,code:clean(error?.code||"DETAIL_BOARD_FAILED",120),message:clean(error?.message||error,600)});
      patch.failure_items=job.failure_items;
    }
  }
  patch.daevanion_cursor=cursor;patch.request_count=Number(job.request_count||0)+counter.calls;counter.calls=0;patch.last_heartbeat_at=new Date().toISOString();
  if(cursor>=targets.length){patch.phase="COMPLETE";patch.current_category="complete";patch.current_label="상세정보 저장 마무리";}
  return await patchJob(job,patch);
}

async function completeJob(job:Record<string,any>){
  const failed=Number(job.weapon_failed||0)+Number(job.armor_failed||0)+Number(job.accessory_failed||0)+Number(job.arcana_failed||0)+Number(job.daevanion_failed||0);
  const completedAt=new Date().toISOString(),cooldownUntil=new Date(Date.now()+30*60*1000).toISOString();
  return await patchJob(job,{status:failed>0?"partial_failed":"completed",phase:"COMPLETE",worker_id:null,resume_at:null,
    completed_at:completedAt,cooldown_until:cooldownUntil,last_heartbeat_at:completedAt,current_category:"complete",
    current_label:failed>0?`전체 상세정보 갱신 완료 · 실패 ${failed}건`:"전체 상세정보 갱신 완료",
    summary:{apiVersion:API_VERSION,failedCount:failed,cooldownMinutes:30}});
}

async function runJob(jobId:string){
  const workerId=`detail-${crypto.randomUUID()}`;
  const claimed=await rpc("kinojo_character_detail_refresh_claim_v302",{p_job_id:jobId,p_worker_id:workerId});
  if(claimed.ok!==true)throw new DetailError(clean(claimed.message||claimed.code||"상세 갱신 작업 Claim 실패",1000),clean(claimed.code||"DETAIL_CLAIM_FAILED",120),502);
  if(claimed.done===true)return {ok:true,done:true,job:claimed.job};
  if(claimed.waiting===true){dispatchRun(jobId,Number(claimed.retryAfterMs||30000));return {ok:true,waiting:true};}
  if(claimed.busy===true){dispatchRun(jobId,Number(claimed.retryAfterMs||1500));return {ok:true,busy:true};}
  if(claimed.acquired!==true)return {ok:true,accepted:false};

  let job=await getJob(jobId);const counter={calls:0};
  if(job.worker_id!==workerId)return {ok:true,busy:true};
  try{
    if(job.phase==="INIT"){job=await initializeJob(job,counter);counter.calls=0;}
    if(job.phase==="EQUIPMENT"){
      const result=await processEquipment(job,counter);
      if(result?.waiting===true)return result;
      job=result||await getJob(jobId);
    }
    if(job.phase==="DAEVANION"){
      const result=await processDaevanion(job,counter);
      if(result?.waiting===true)return result;
      job=result||await getJob(jobId);
    }
    if(job.phase==="COMPLETE"){
      const completed=await completeJob(job);return {ok:true,done:true,job:completed};
    }
    job=(await patchJob(job,{status:"queued",worker_id:null,last_heartbeat_at:new Date().toISOString()}))||job;
    dispatchRun(jobId,350);return {ok:true,hasMore:true,job};
  }catch(error:any){
    if(error?.code==="DETAIL_STALE_WORKER")return {ok:true,staleWorker:true};
    if(error?.rateLimited===true)return await waitJob(job,error,counter.calls);
    await failJob(job,error,counter.calls);throw error;
  }
}

function background(task:Promise<unknown>){
  const runtime=(globalThis as any).EdgeRuntime;
  if(runtime&&typeof runtime.waitUntil==="function")runtime.waitUntil(task);else void task.catch(()=>{});
}

async function scheduleRun(jobId:string,delayMs:number){
  if(delayMs>0)await sleep(Math.min(Math.max(delayMs,250),120000));
  const response=await boundedDetailFetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,{method:"POST",headers:serviceHeaders(),body:JSON.stringify({action:"run",jobId,clientVersion:API_VERSION})},15000);
  if(!response.ok)throw new Error(`detail run HTTP ${response.status}`);
  const ack=JSON.parse(await response.text());
  if(ack?.ok!==true||ack?.accepted!==true)throw new Error('detail run not accepted');
}

function dispatchRun(jobId:string,delayMs=250){
  background((async()=>{
    const before=await getJob(jobId);
    for(let attempt=0;attempt<3;attempt++){
      try{await scheduleRun(jobId,attempt===0?delayMs:500*attempt);return;}
      catch{if(attempt<2)continue;}
    }
    await rpc('kinojo_character_detail_dispatch_failed_v1',{p_job_id:jobId,p_expected_updated_at:before.updated_at});
  })().catch(()=>{console.error('DETAIL_DISPATCH_DIAGNOSTIC_UNCONFIRMED');}));
}

function internalRequest(request:Request){return clean(request.headers.get("authorization"),5000)===`Bearer ${SERVICE_ROLE_KEY}`;}

async function statusAction(body:Record<string,any>){
  const master=await findMaster(body);const status=await rpc("kinojo_character_detail_refresh_status_v302",{p_character_master_id:master.id});
  return {...status,identity:{characterMasterId:master.id,serverId:master.server_id,characterId:characterIdFromDetailUrl(master.detail_url),characterName:master.character_name}};
}

async function startAction(body:Record<string,any>){
  const master=await findMaster(body);const result=await rpc("kinojo_character_detail_refresh_start_v302",{p_character_master_id:master.id});
  if(result.ok!==true)return result;
  const job=object(result.job),characterId=clean(characterIdFromDetailUrl(master.detail_url),1000);
  if(result.accepted===true&&job.id){
    dispatchRun(job.id,0);
  }
  return {...result,identity:{characterMasterId:master.id,serverId:master.server_id,characterId,characterName:master.character_name}};
}

async function overviewAction(body:Record<string,any>){
  const master=await findMaster(body);
  const jobs=await dbRows("character_detail_refresh_jobs",{select:"*",character_master_id:`eq.${master.id}`,status:"in.(completed,partial_failed)",order:"completed_at.desc",limit:"1"});
  const job=jobs[0];
  if(!job||!job.base_info_payload||!job.base_equipment_payload)return {ok:true,available:false,characterMasterId:master.id};
  const arcanaRows=await dbRows("character_equipment_detail_latest",{select:"raw_payload",character_master_id:`eq.${master.id}`,category:"eq.arcana",order:"slot_pos.asc",limit:"8"});
  return {ok:true,available:true,apiVersion:API_VERSION,source:"KINOJO_MANUAL_DETAIL_REFRESH",...profilePayload(object(job.base_info_payload),object(job.base_equipment_payload),master,job),arcanaSetEffects:arcanaSetEffects(arcanaRows),
    detailSnapshot:{createdAt:job.completed_at||job.updated_at},equipmentDetailStored:true};
}

async function equipmentItemAction(body:Record<string,any>){
  const master=await findMaster(body),slotPos=positiveInt(body.slotPos||body.slot_pos),itemId=positiveInt(body.itemId||body.id);
  if(!slotPos&&!itemId)throw new DetailError("장비 슬롯 또는 아이템 ID가 필요합니다.","EQUIPMENT_ID_REQUIRED",400,{retryable:false});
  const params:Record<string,string>={select:"*",character_master_id:`eq.${master.id}`,limit:"1"};
  if(slotPos)params.slot_pos=`eq.${slotPos}`;
  if(itemId)params.item_id=`eq.${itemId}`;
  const rows=await dbRows("character_equipment_detail_latest",params),row=rows[0];
  if(!row)throw new DetailError("저장된 장비 상세정보가 없습니다. 전체 상세정보 갱신을 먼저 실행해 주세요.","EQUIPMENT_DETAIL_NOT_STORED",404,{retryable:false});
  return {ok:true,apiVersion:API_VERSION,source:"KINOJO_STORED_EQUIPMENT_DETAIL",detailStored:true,refreshedAt:row.refreshed_at,
    item:{...object(row.raw_payload),id:row.item_id,name:row.item_name,slotPos:row.slot_pos,slotPosName:row.slot_pos_name,slotLabel:SLOT_LABELS[row.slot_pos_name]||row.slot_label,category:row.category,grade:row.grade,icon:row.icon,
      enchantLevel:row.enchant_level,exceedLevel:row.exceed_level}};
}

async function daevanionDetailAction(body:Record<string,any>){
  const master=await findMaster(body),boardId=positiveInt(body.boardId||body.board_id);
  if(!boardId)throw new DetailError("데바니온 보드 ID가 필요합니다.","BOARD_ID_REQUIRED",400,{retryable:false});
  const rows=await dbRows("character_daevanion_detail_latest",{select:"*",character_master_id:`eq.${master.id}`,board_id:`eq.${boardId}`,limit:"1"}),row=rows[0];
  if(!row)throw new DetailError("저장된 데바니온 상세정보가 없습니다. 전체 상세정보 갱신을 먼저 실행해 주세요.","DAEVANION_DETAIL_NOT_STORED",404,{retryable:false});
  return {ok:true,apiVersion:API_VERSION,source:"KINOJO_STORED_DAEVANION_DETAIL",detailStored:true,refreshedAt:row.refreshed_at,
    board:{id:row.board_id,name:row.board_name,...object(row.raw_payload)}};
}

Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="POST")return json({ok:false,message:"POST만 허용합니다."},405);
  try{
    const body=object(await request.json().catch(()=>({}))),action=clean(body.action||"status",80);
    if(action==="health")return json({ok:true,service:FUNCTION_NAME,apiVersion:API_VERSION,databaseContract:CONTRACT,cooldownMinutes:30,
      features:["manual_only","shared_character_lock","equipment_item_details","equipment_option_skills","arcana_separate","arcana_set_effects","official_slot_order","equipment_skin_slot_name_match","daevanion_details","category_progress","global_plaync_rate_gate","canonical_master_detail_id","official_identity_verified","atomic_worker_identity_write_fence"]});
    if(action==="run"){
      if(!internalRequest(request))return json({ok:false,code:"INTERNAL_ONLY",message:"서버 내부 실행만 허용합니다."},403);
      const jobId=clean(body.jobId||body.job_id,80);if(!jobId)return json({ok:false,code:"JOB_ID_REQUIRED",message:"작업 ID가 필요합니다."},400);
      const task=runJob(jobId);background(task.catch(()=>{}));return json({ok:true,accepted:true,jobId},202);
    }
    if(action==="start")return json(await startAction(body));
    if(action==="status")return json(await statusAction(body));
    if(action==="overview")return json(await overviewAction(body));
    if(action==="equipmentItem")return json(await equipmentItemAction(body));
    if(action==="daevanionDetail")return json(await daevanionDetailAction(body));
    return json({ok:false,code:"UNKNOWN_ACTION",message:"지원하지 않는 상세 갱신 action입니다."},400);
  }catch(error:any){
    const status=Math.max(400,Math.min(599,Number(error?.status||500)));
    return json({ok:false,code:clean(error?.code||"CHARACTER_DETAIL_REFRESH_FAILED",120),message:clean(error?.message||error,1000),retryable:error?.retryable!==false},status);
  }
});
