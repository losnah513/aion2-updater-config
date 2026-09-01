/* KINOJO Character Refresh Worker
 * Contract 295.9 · 2026-09-01
 * - runQueue: lookup_session_targets를 최대 5명씩 공식 조회
 * - 3-2차: 조회 완료 후 Master → 성장 리뷰 → 랭킹 후처리
 * - 3-3차: Google list Queue → 실제 쓰기 → 행별 readback → 실패 행만 재전송
 * - 3-4차: 브라우저와 분리된 자동 Batch 인계 및 종료 안전 상태
 * - 3-5차: WEB·Extension 공통 PLAYNC Rate Gate, 429 자동대기, 15분 공식 원본 재사용
 * - 3-6차: Target 원자 완료·stale Claim 복구·분리형 자동 Tick
 * - 3-7차: 공식 수치/장비 응답 교차검증·고유키 중복 차단
 * - 3-8차: 서버 이전/이름 변경 대상을 정규 Queue에서 자동 재탐색하고 불일치 후보는 관리자 검토
 * - 3-9차: 검증된 캐시 → 저장 상세 식별값 → 이름+서버 → 신원 복구 순서와 소수 진행률 계약
 * - 3-10차: 브라우저 CORS 사전 요청 호환과 순수 JavaScript 런타임 안전성 복구
 * - 3-11차: Google list 실제 쓰기·readback을 전용 lookup-list-sync Edge로 분리
 * - 3-12차: 실측 병목 최적화 · Target 고정 250ms 대기 제거 · 정상 Batch 재인계 500ms → 250ms
 * - 3-13차: 서버 자동 Batch self-handoff 502/503/504 일시 장애 재시도 · 중복 Worker claim 안전 종료
 * - 3-14차: self-handoff HTTP status 보존 · 502/503/504 숫자 우선 재시도 판정 · 오류 진단 강화
 * - 3-15차: Server 예약 실행의 완료/실패 상태를 자동화 제어 상태에 원자 반영
 * - 3-16차: 두 terminal miss 뒤에만 신원 복구 · DB461 서버 이전/레기온 원자 결과 검증
 * - 3-17차: 이전 서버 상세 API의 식별값 없는 빈 200 프로필을 terminal miss로 정규화
 * - 레기온 트리 v455 단일 Target은 Master·관계·랭킹 확정 후 Google list 쓰기/readback을 생략
 * - 단계 체크포인트에 따라 실패 단계부터 최대 3회 재시작
 */

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS",
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};
const API_VERSION="295.9";
const CONTRACT="295";
const BUILD_DATE="2026-09-01";
const IDENTITY_DATABASE_CONTRACT="461";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const clean=(value,max=1200)=>String(value??"").trim().slice(0,max);
const object=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
const positiveInt=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.trunc(n):null;};
const boolean=value=>value===true||String(value).toLowerCase()==="true";
const normalized=value=>clean(value,160).replace(/<[^>]+>/g,"").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g,"");
const decodeId=value=>{const source=clean(value,800);try{return decodeURIComponent(source);}catch{return source;}};
const detailId=value=>encodeURIComponent(clean(value,800)).replace(/%3D/gi,"=");
const escapeHtml=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const getCharKey=value=>{const source=clean(value,3000);const match=source.match(/[?&]charKey=(\d{10,})/i)||source.match(/\b(\d{10,})\b/);return match?match[1]:"";};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function identityRecoveryDecision(storedCode,nameSearchCode){
  const stored=clean(storedCode,120),nameSearch=clean(nameSearchCode,120);
  if(stored==="STORED_DETAIL_NOT_FOUND"&&nameSearch==="NAME_SERVER_NOT_FOUND")return{allowed:true,code:"IDENTITY_RECOVERY_ALLOWED",terminalMisses:[stored,nameSearch]};
  if(stored==="PROVIDER_RETRY_REQUIRED"||nameSearch==="PROVIDER_RETRY_REQUIRED"||/(?:NAME_MISSING|CHAR_KEY_MISSING)/.test(stored))return{allowed:false,code:"PROVIDER_RETRY_REQUIRED",retryable:true,terminalMisses:[]};
  if(/(?:CHAR_KEY_MISMATCH|IDENTITY_REVIEW_REQUIRED)/.test(`${stored} ${nameSearch}`))return{allowed:false,code:"IDENTITY_REVIEW_REQUIRED",retryable:false,terminalMisses:[]};
  return{allowed:false,code:"IDENTITY_RECOVERY_EVIDENCE_INCOMPLETE",retryable:false,terminalMisses:[]};
}
function identityTransitionContract(applied,previousServerId,currentServerId){
  const result=object(applied),previous=positiveInt(previousServerId||object(result.previous).serverId),current=positiveInt(currentServerId||object(result.current).serverId||object(result.character).serverId);
  const databaseContract=clean(result.databaseContract,40),serverTransferred=previous!==null&&current!==null&&previous!==current;
  if(!previous||!current)return{ok:false,code:"IDENTITY_TRANSITION_CONTEXT_MISSING",message:"신원 변경 전후 서버 식별값이 없습니다."};
  if(databaseContract!==IDENTITY_DATABASE_CONTRACT)return{ok:false,code:"IDENTITY_DATABASE_CONTRACT_MISMATCH",message:`신원 적용 DB 계약 ${IDENTITY_DATABASE_CONTRACT} 확인이 필요합니다.`,databaseContract,previousServerId:previous,currentServerId:current};
  if(serverTransferred&&(result.serverTransferred!==true||result.legionCleared!==true))return{ok:false,code:"SERVER_TRANSFER_LEGION_CONTRACT_MISMATCH",message:"서버 이전 결과에 레기온 원자 해제 확인값이 없습니다.",databaseContract,previousServerId:previous,currentServerId:current};
  if(!serverTransferred&&(result.serverTransferred===true||result.legionCleared===true))return{ok:false,code:"SAME_SERVER_LEGION_CONTRACT_MISMATCH",message:"같은 서버 이름 변경에서 레기온 해제 결과가 반환되었습니다.",databaseContract,previousServerId:previous,currentServerId:current};
  return{ok:true,databaseContract,serverTransferred,legionCleared:result.legionCleared===true,previousLegionName:clean(result.previousLegionName,160)||null,organizationAssignmentRemoved:result.organizationAssignmentRemoved===true,legionTreeRevisions:object(result.legionTreeRevisions),previousServerId:previous,currentServerId:current};
}
const AUTONOMOUS_HANDOFF_RETRY_DELAYS=[800,1600,3200];
const AUTONOMOUS_HANDOFF_TRANSIENT_HTTP_STATUSES=new Set([502,503,504]);
const transientAutonomousHandoffError=error=>{
  const httpStatus=Number(error?.httpStatus);
  if(AUTONOMOUS_HANDOFF_TRANSIENT_HTTP_STATUSES.has(httpStatus))return true;
  return /(?:\b502\b|\b503\b|\b504\b|bad gateway|service unavailable|gateway timeout|failed to fetch|networkerror|network error|connection reset|econnreset|fetch failed)/i.test(`${clean(error?.code,160)} ${clean(error?.message||error,2000)}`);
};
const autonomousHandoffClassifierSelfTest=()=>[502,503,504].every(httpStatus=>transientAutonomousHandoffError({httpStatus,message:""}))&&!transientAutonomousHandoffError({httpStatus:500,message:"internal server error"});

class WorkerError extends Error{
  constructor(message,code="SERVER_QUEUE_TARGET_FAILED",retryable=true,details={}){
    super(message);
    this.code=code;
    this.retryable=retryable;
    Object.assign(this,object(details));
  }
}

function rows(value,depth=0){
  if(depth>6||value==null)return[];
  if(Array.isArray(value))return value;
  const item=object(value);
  for(const key of ["list","content","items","characters"])if(Array.isArray(item[key]))return item[key];
  for(const child of Object.values(item)){const found=rows(child,depth+1);if(found.length)return found;}
  return[];
}
function classSlug(name){
  return ({"수호성":"templar","검성":"gladiator","살성":"assassin","궁성":"ranger","마도성":"sorcerer","정령성":"elementalist","치유성":"cleric","호법성":"chanter","권성":"fighter"})[clean(name,80)]||"gladiator";
}
function service(){
  const url=clean(Deno.env.get("SUPABASE_URL"),500).replace(/\/$/,"");
  let key=clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),4000);
  if(!key){try{key=clean(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default,4000);}catch{key="";}}
  if(!url||!key)throw new Error("Supabase service 환경 설정이 없습니다.");
  return{url,key};
}
async function rpc(name,body){
  const env=service();
  const res=await fetch(`${env.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:env.key,authorization:`Bearer ${env.key}`,"content-type":"application/json"},body:JSON.stringify(body)});
  const raw=await res.text();let data={};
  try{data=raw?JSON.parse(raw):{};}catch{data={ok:false,message:raw};}
  if(!res.ok)throw new WorkerError(clean(data.message||data.error||data.details||`RPC ${name} HTTP ${res.status}`,1000),"SUPABASE_RPC_FAILED",true);
  return data;
}
async function callEdge(name,body){
  const env=service();
  const res=await fetch(`${env.url}/functions/v1/${name}`,{method:"POST",headers:{apikey:env.key,authorization:`Bearer ${env.key}`,"content-type":"application/json"},body:JSON.stringify(body)});
  const raw=await res.text();let data={};
  try{data=raw?JSON.parse(raw):{};}catch{data={ok:false,message:raw};}
  if(!res.ok||data.ok===false){
    const httpStatus=Number(res.status||0);
    throw new WorkerError(
      clean(data.message||data.error||`Edge ${name} HTTP ${httpStatus}`,1000),
      clean(data.code||(!res.ok?`EDGE_HTTP_${httpStatus}`:"EDGE_CALL_FAILED"),120),
      data.retryable!==false,
      {httpStatus,edgeName:name,responseBody:clean(raw,500)}
    );
  }
  return data;
}
function retryAfterMs(value){
  const raw=clean(value,160);
  if(!raw)return 30000;
  const seconds=Number(raw);
  if(Number.isFinite(seconds)&&seconds>0)return Math.min(Math.max(Math.ceil(seconds*1000),1000),600000);
  const date=Date.parse(raw);
  if(Number.isFinite(date))return Math.min(Math.max(date-Date.now(),1000),600000);
  return 30000;
}
async function officialRateGate(sessionId,sessionToken,source){
  const gate=await rpc("kinojo_official_rate_gate_acquire_v276",{
    p_session_id:sessionId,
    p_session_token:sessionToken,
    p_source:source
  });
  if(gate.ok!==true)throw new WorkerError(clean(gate.message||gate.code||"PLAYNC 요청 제어 확인 실패",1000),clean(gate.code||"PLAYNC_RATE_GATE_FAILED",120),true);
  const waitMs=Math.max(0,Number(gate.waitMs||0));
  if(gate.allowed===false){
    throw new WorkerError(
      clean(gate.message||"PLAYNC 요청 제한 대기 중입니다.",1000),
      "PLAYNC_RATE_PAUSED",
      true,
      {rateLimited:true,retryAfterMs:waitMs||30000,retryAfterSeconds:Math.max(1,Math.ceil((waitMs||30000)/1000)),pausedUntil:gate.pausedUntil||null}
    );
  }
  if(waitMs>0)await sleep(Math.min(waitMs,5000));
  return gate;
}
async function officialJson(url,sessionId,sessionToken,source){
  await officialRateGate(sessionId,sessionToken,source);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const res=await fetch(url,{headers:{accept:"application/json,text/plain,*/*","accept-language":"ko-KR,ko;q=0.9","user-agent":`KINOJO-Character-Refresh/${API_VERSION}`},signal:controller.signal,redirect:"follow"});
    const raw=await res.text();
    if(!res.ok){
      const delay=res.status===429?retryAfterMs(res.headers.get("retry-after")):0;
      throw new WorkerError(
        `PLAYNC HTTP ${res.status}: ${raw.slice(0,300)}`,
        `PLAYNC_HTTP_${res.status}`,
        res.status===408||res.status===429||res.status>=500,
        res.status===429?{rateLimited:true,retryAfterMs:delay,retryAfterSeconds:Math.max(1,Math.ceil(delay/1000))}:{httpStatus:res.status}
      );
    }
    await rpc("kinojo_official_rate_gate_success_v276",{
      p_session_id:sessionId,
      p_session_token:sessionToken,
      p_source:source
    });
    try{return raw?JSON.parse(raw):{};}catch{throw new WorkerError("PLAYNC 공식 API 응답이 JSON 형식이 아닙니다.","PLAYNC_NON_JSON",true);}
  }catch(error){
    if(error?.name==="AbortError")throw new WorkerError("PLAYNC 공식 API 응답 시간이 초과되었습니다.","PLAYNC_TIMEOUT",true);
    throw error;
  }finally{clearTimeout(timer);}
}
async function progress(sessionId,sessionToken,stage,characterName,message,current,total,payload={}){
  await rpc("kinojo_runtime_progress",{p_session_id:sessionId,p_session_token:sessionToken,p_stage:stage,p_current_character:characterName||null,p_message:message,p_progress_current:Number.isFinite(Number(current))?Number(current):null,p_progress_total:Number.isFinite(Number(total))?Number(total):null,p_payload:{source:"KINOJO_SERVER_CHARACTER_QUEUE",progressContract:"server-worker-seven-phase-v2",apiVersion:API_VERSION,...payload}});
}
async function handoff(sessionId,sessionToken,workerId,state,message,error=""){
  return await rpc("kinojo_server_queue_handoff_update_v276",{
    p_session_id:sessionId,
    p_session_token:sessionToken,
    p_worker_id:workerId,
    p_state:state,
    p_message:message||null,
    p_error:error||null
  });
}
async function finishScheduledAutomation(sessionId,status,message){
  try{
    return await rpc("kinojo_automation_finish_v377",{
      p_job_type:"character_refresh",
      p_run_id:null,
      p_status:status,
      p_message:clean(message,1000),
      p_session_id:sessionId
    });
  }catch{return null;}
}
function internalRequest(request){
  const env=service();
  return clean(request.headers.get("authorization"),5000)===`Bearer ${env.key}`;
}
function exactCandidateOutcome(payload,name,serverId,expectedKey){
  const wanted=normalized(name);
  let mismatchedCount=0;
  for(const source of rows(payload)){
    const item=object(source);const itemName=clean(item.name||item.characterName||item.character_name,160).replace(/<[^>]+>/g,"");const itemServer=positiveInt(item.serverId||item.server_id);
    if(normalized(itemName)!==wanted||itemServer!==serverId)continue;
    const image=clean(item.profileImageUrl||item.profile_image_url,1600);const itemKey=getCharKey(image);
    if(expectedKey&&itemKey&&itemKey!==expectedKey){mismatchedCount+=1;continue;}
    const characterId=decodeId(item.characterId||item.character_id||item.encryptedCharacterId);if(!characterId)continue;
    return{found:true,code:"NAME_SERVER_EXACT_MATCH",terminal:false,candidate:{characterName:itemName,serverId:itemServer,serverName:clean(item.serverName||item.server_name,120),characterId,profileImageUrl:image,charKey:itemKey,className:clean(item.className||item.class_name,80)}};
  }
  if(mismatchedCount>0)return{found:false,code:"NAME_SERVER_CHAR_KEY_MISMATCH",terminal:false,reviewRequired:true,mismatchedCount};
  return{found:false,code:"NAME_SERVER_NOT_FOUND",terminal:true,mismatchedCount:0};
}
async function searchCharacter(name,serverId,expectedKey,sessionId,sessionToken){
  const url=new URL("https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character");
  url.searchParams.set("keyword",name);url.searchParams.set("serverId",String(serverId));url.searchParams.set("page","1");url.searchParams.set("size","20");
  try{return exactCandidateOutcome(await officialJson(url.toString(),sessionId,sessionToken,"SERVER_WORKER_SEARCH"),name,serverId,expectedKey);}
  catch(error){
    if(clean(error?.code,120)==="PLAYNC_HTTP_404")return{found:false,code:"NAME_SERVER_NOT_FOUND",terminal:true,httpStatus:404};
    throw error;
  }
}
function storedDetailIdentity(value,fallbackServerId){
  const source=clean(value,1600);if(!source)return null;
  try{
    const url=new URL(source,"https://aion2.plaync.com");
    const parts=url.pathname.split("/").filter(Boolean);const index=parts.findIndex(part=>part.toLowerCase()==="characters");
    const serverId=positiveInt(index>=0?parts[index+1]:null)||positiveInt(fallbackServerId);
    const characterId=decodeId(index>=0?parts[index+2]:"");
    if(serverId&&characterId)return{serverId,characterId,detailUrl:`https://aion2.plaync.com/ko-kr/characters/${serverId}/${detailId(characterId)}`};
  }catch{}
  const match=source.match(/\/characters\/(\d+)\/([^/?#]+)/i);
  const serverId=positiveInt(match?.[1])||positiveInt(fallbackServerId);const characterId=decodeId(match?.[2]||"");
  return serverId&&characterId?{serverId,characterId,detailUrl:`https://aion2.plaync.com/ko-kr/characters/${serverId}/${detailId(characterId)}`}:null;
}
function candidateFromStoredInfo(infoPayload,detail,expectedKey){
  const info=object(infoPayload),profile=object(info.profile);
  const characterName=clean(profile.characterName||info.characterName||info.character_name,160);
  const profileImageUrl=clean(profile.profileImage||profile.profileImageUrl||info.profileImage||info.profileImageUrl,1600);
  const charKey=getCharKey(profileImageUrl)||clean(profile.charKey||info.charKey,160);
  const characterId=clean(profile.characterId||info.characterId||info.character_id,800);
  const responseServerId=positiveInt(profile.serverId||info.serverId||info.server_id);
  if(!characterName){
    const identityPresent=Boolean(characterId||responseServerId||profileImageUrl||charKey);
    return identityPresent
      ?{ok:false,code:"STORED_DETAIL_NAME_MISSING",terminal:false}
      :{ok:false,code:"STORED_DETAIL_NOT_FOUND",terminal:true,emptyProfile:true};
  }
  if(expectedKey&&charKey!==expectedKey)return{ok:false,code:charKey?"STORED_DETAIL_CHAR_KEY_MISMATCH":"STORED_DETAIL_CHAR_KEY_MISSING",actualCharKey:charKey};
  return{ok:true,candidate:{characterName,serverId:detail.serverId,serverName:clean(profile.serverName||info.serverName,120),characterId:detail.characterId,profileImageUrl,charKey,className:clean(profile.className||info.className,80),detailUrl:detail.detailUrl,method:"OFFICIAL_STORED_DETAIL_EXACT_KEY"}};
}
async function resolveStoredDetailTarget(sessionId,sessionToken,target,context,characterName,serverId,expectedKey){
  const detail=storedDetailIdentity(context.detailUrl,serverId);if(!detail)return{found:false,code:"STORED_DETAIL_UNAVAILABLE",terminal:false};
  await progress(sessionId,sessionToken,"OFFICIAL_STORED_DETAIL",characterName,"저장된 공식 상세 식별값 조회 중",null,null,{targetId:target.targetId,serverId:detail.serverId});
  const infoUrl=new URL("https://aion2.plaync.com/api/character/info");
  infoUrl.searchParams.set("lang","ko");infoUrl.searchParams.set("serverId",String(detail.serverId));infoUrl.searchParams.set("characterId",detail.characterId);
  let infoPayload;
  try{infoPayload=await officialJson(infoUrl.toString(),sessionId,sessionToken,"SERVER_WORKER_STORED_INFO");}
  catch(error){
    if(clean(error?.code,120)==="PLAYNC_HTTP_404")return{found:false,code:"STORED_DETAIL_NOT_FOUND",terminal:true,httpStatus:404};
    throw error;
  }
  const checked=candidateFromStoredInfo(infoPayload,detail,expectedKey);
  if(checked.ok!==true){
    await progress(sessionId,sessionToken,"IDENTITY_RECOVERY",characterName,"저장 상세 식별값의 고유값 불일치 · 이름 기반 안전 조회로 전환",null,null,{targetId:target.targetId,code:checked.code});
    return{found:false,code:checked.code,terminal:checked.terminal===true,emptyProfile:checked.emptyProfile===true,reviewRequired:/CHAR_KEY_MISMATCH/.test(checked.code),actualCharKey:checked.actualCharKey||""};
  }
  let candidate=checked.candidate,identityRecovery=null;
  if(normalized(candidate.characterName)!==normalized(characterName)){
    const applied=object(await rpc("kinojo_character_identity_recovery_apply_v1",{p_session_id:sessionId,p_session_token:sessionToken,p_target_id:positiveInt(target.targetId),p_candidate:candidate}));
    if(applied.ok!==true)throw new WorkerError(clean(applied.message||applied.code||"저장 상세 식별값 이름 변경 반영 실패",1000),clean(applied.code||"IDENTITY_APPLY_FAILED",120),applied.retryable!==false);
    const current=object(applied.current);
    candidate={...candidate,characterName:clean(current.characterName||candidate.characterName,160),serverId:positiveInt(current.serverId)||candidate.serverId,serverName:clean(current.serverName||candidate.serverName,120),profileImageUrl:clean(current.profileImageUrl||candidate.profileImageUrl,1600)};
    const transition=identityTransitionContract(applied,serverId,candidate.serverId);
    if(transition.ok!==true)throw new WorkerError(transition.message,transition.code,false,transition);
    identityRecovery={...applied,recovered:applied.applied===true,method:"OFFICIAL_STORED_DETAIL_EXACT_KEY",transition};
    await progress(sessionId,sessionToken,"IDENTITY_RECOVERY_APPLIED",candidate.characterName,"같은 서버 이름 변경 반영 · 레기온 소속 유지",null,null,{targetId:target.targetId,...transition});
  }
  return{found:true,candidate,identityRecovery,identityTransition:identityRecovery?.transition||null,characterName:candidate.characterName,serverId:candidate.serverId,expectedKey,prefetchedInfoPayload:infoPayload,lookupMethod:"stored_detail"};
}
function parserSource(infoPayload,equipmentPayload){
  const info=object(infoPayload),profile=object(info.profile),stat=object(info.stat),title=object(info.title);
  const equipment=object(object(equipmentPayload).equipment);
  const itemLevelEntry=(Array.isArray(stat.statList)?stat.statList:[]).map(object).find(item=>clean(item.type,80).toLowerCase()==="itemlevel");
  const itemLevel=Number(itemLevelEntry?.value||profile.itemLevel||0),combatPower=Number(profile.combatPower||0);
  if(!Number.isFinite(itemLevel)||itemLevel<=0||!Number.isFinite(combatPower)||combatPower<=0)throw new WorkerError("PLAYNC character/info 응답에 아이템레벨 또는 전투력이 없습니다.","OFFICIAL_STATS_MISSING",false);
  const equipmentList=(Array.isArray(equipment.equipmentList)?equipment.equipmentList:[]).map(object);
  if(equipmentList.length<5)throw new WorkerError(`PLAYNC 장착 장비가 ${equipmentList.length}개만 확인되었습니다.`,`OFFICIAL_EQUIPMENT_INCOMPLETE`,true);
  const titleList=(Array.isArray(title.titleList)?title.titleList:[]).map(object);
  const slots=equipmentList.slice(0,10).map(item=>{const name=clean(item.name,240);return `<div class="equipment__slots-item" data-item-name="${escapeHtml(name)}"><div class="equipment__item-name">${escapeHtml(name)}</div><img src="${escapeHtml(item.icon)}" alt="${escapeHtml(name)}"></div>`;}).join("");
  const titleStats=titleList.flatMap(item=>(Array.isArray(item.equipStatList)?item.equipStatList:[]).map(object)).map(item=>`<div>${escapeHtml(item.desc)}</div>`).join("");
  const profileImage=clean(profile.profileImage,1600),className=clean(profile.className,80),classIcon=`https://assets.playnccdn.com/static-aion2/characters/img/class/class_icon_${classSlug(className)}.png`;
  const pageHtml=[
    `<div class="profile__avatar"><img src="${escapeHtml(profileImage)}"></div>`,
    `<div class="profile__class-img"><img src="${escapeHtml(classIcon)}"></div>`,
    `<div class="profile__info-name">${escapeHtml(profile.characterName)}</div>`,
    `<div class="profile__info-power-level"><span>${Math.trunc(combatPower)}</span></div>`,
    `<div class="profile__info-item-level"><span>${Math.trunc(itemLevel)}</span></div>`,
    `<div class="equipment info__section"><button class="equipment__tab-item active" aria-selected="true">무기 · 방어구</button><div class="equipment__slots">${slots}<div class="equipment__slots-item is-empty"></div></div></div>`,
    `<div class="title info__section"><div class="title__item-stat">${titleStats}</div></div>`
  ].join("");
  return{pageHtml,profile,itemLevel:Math.trunc(itemLevel),combatPower:Math.trunc(combatPower),equipmentCount:equipmentList.length};
}
function officialSnapshot({sessionId,targetId,lookupOrder,context,target,candidate,resolved,characterId,serverId,adapted,infoPayload,equipmentPayload}){
  const profile=adapted.profile;
  const officialName=clean(profile.characterName,160)||resolved.characterName;
  const officialServerName=clean(profile.serverName,120)||clean(candidate.serverName,120)||clean(context.serverName,120);
  const profileImageUrl=clean(profile.profileImage,1600)||clean(candidate.profileImageUrl,1600);
  const officialCharKey=getCharKey(profileImageUrl)||resolved.expectedKey;
  if(resolved.expectedKey&&officialCharKey&&resolved.expectedKey!==officialCharKey)throw new WorkerError("PLAYNC 공식 프로필 고유값이 기존 character_master와 일치하지 않습니다.","CHAR_KEY_MISMATCH",false);
  return{
    officialName,
    officialServerName,
    profileImageUrl,
    officialCharKey,
    snapshot:{
      schemaVersion:"kinojo-crawl-v2",
      tool:"KINOJO_SERVER_CHARACTER_QUEUE",
      clientVersion:API_VERSION,
      buildDate:BUILD_DATE,
      snapshotUid:crypto.randomUUID(),
      sessionId,
      targetId,
      lookupOrder,
      listRow:context.listRow??target.row??null,
      listOriginalName:target.originalName||officialName,
      name:target.characterName||officialName,
      characterName:officialName,
      mainCharacterName:context.mainCharacterName||target.mainCharacterName||officialName,
      serverId:String(serverId),
      serverName:officialServerName,
      className:clean(profile.className,80)||clean(context.className||target.className,80),
      pageText:adapted.pageHtml,
      profileHtml:adapted.pageHtml,
      visibleText:`${officialName}\n${adapted.combatPower}\n${adapted.itemLevel}`,
      profileImageUrl,
      detailUrl:`https://aion2.plaync.com/ko-kr/characters/${serverId}/${detailId(characterId)}`,
      charKey:officialCharKey,
      profileExtracted:true,
      profileExtractAttempts:1,
      equipmentSlotCount:adapted.equipmentCount,
      equipmentPopulatedSlotCount:adapted.equipmentCount,
      faction:positiveInt(profile.raceId)===1?"천족":positiveInt(profile.raceId)===2?"마족":"",
      status:"OK",
      isFinal:true,
      officialApiSource:{info:true,equipment:true,workerVersion:API_VERSION,fetchedAt:new Date().toISOString()},
      officialRaw:{info:infoPayload,equipment:equipmentPayload}
    }
  };
}
async function precheckOfficialSnapshot(sessionId,sessionToken,targetId,snapshot,previousFingerprint=null){
  const checked=await rpc("kinojo_official_snapshot_precheck_v285",{
    p_session_id:sessionId,
    p_session_token:sessionToken,
    p_target_id:targetId,
    p_snapshot:snapshot,
    p_previous_fingerprint:previousFingerprint
  });
  if(checked.ok!==true||checked.accepted!==true){
    throw new WorkerError(
      clean(checked.message||checked.code||"공식 수치·장비 응답의 일관성 검증에 실패했습니다.",1000),
      clean(checked.code||"OFFICIAL_STATE_PRECHECK_FAILED",120),
      checked.retryable!==false
    );
  }
  return checked;
}
async function finalizeTarget(sessionId,sessionToken,targetId,submitted){
  const finalized=await rpc("kinojo_lookup_finalize_target_v285",{
    p_session_id:sessionId,
    p_session_token:sessionToken,
    p_target_id:targetId,
    p_payload_id:positiveInt(submitted?.payloadId||submitted?.payload_id),
    p_snapshot_id:positiveInt(submitted?.snapshotId||submitted?.snapshot_id)
  });
  if(finalized.ok!==true)throw new WorkerError(clean(finalized.message||finalized.code||"Target 완료 연결 실패",1000),clean(finalized.code||"TARGET_FINALIZE_FAILED",120),finalized.retryable!==false);
  return finalized;
}
async function resolveOfficialTarget(sessionId,sessionToken,target,context){
  let characterName=clean(context.characterName||target.characterName||target.name,160);
  let serverId=positiveInt(context.serverId||target.serverId);
  const expectedKey=clean(context.charKey,160);
  const stored=await resolveStoredDetailTarget(sessionId,sessionToken,target,context,characterName,serverId,expectedKey);
  if(stored.found===true)return stored;
  await progress(sessionId,sessionToken,"OFFICIAL_SEARCH",characterName,"저장 상세 조회 불가 · PLAYNC 공식 서버·캐릭터명 조회 중",null,null,{targetId:target.targetId,serverId,storedDetailResult:stored.code||null});
  const nameSearch=await searchCharacter(characterName,serverId,expectedKey,sessionId,sessionToken);
  let candidate=nameSearch.found===true?nameSearch.candidate:null,identityRecovery=null,identityTransition=null,lookupMethod="name_search";
  if(!candidate){
    const decision=identityRecoveryDecision(stored.code,nameSearch.code);
    if(decision.allowed!==true){
      throw new WorkerError(
        decision.code==="IDENTITY_REVIEW_REQUIRED"?"저장 상세 또는 기존 이름 후보의 고유값이 달라 자동 신원 변경을 중단했습니다.":"저장 상세와 기존 이름·서버가 모두 terminal not-found로 확인되지 않아 신원 복구를 시작하지 않습니다.",
        decision.code,
        decision.retryable===true,
        {storedDetailResult:stored.code||null,nameServerResult:nameSearch.code||null,identityRecoveryEntered:false}
      );
    }
    await progress(sessionId,sessionToken,"IDENTITY_RECOVERY",characterName,"저장 상세·기존 이름/서버 terminal miss 확인 · 이름 힌트 기반 신원 복구 중",null,null,{targetId:target.targetId,storedDetailResult:stored.code,nameServerResult:nameSearch.code,terminalMisses:decision.terminalMisses,identityDatabaseContract:IDENTITY_DATABASE_CONTRACT});
    const previousServerId=serverId;
    identityRecovery=await callEdge("character-identity-recovery",{action:"extensionProbe",sessionId,sessionToken,targetId:target.targetId,clientVersion:API_VERSION});
    if(identityRecovery.recovered!==true)throw new WorkerError(clean(identityRecovery.message||"동일 고유값 캐릭터를 찾지 못했습니다.",1000),clean(identityRecovery.code||"CHARACTER_NOT_FOUND",120),identityRecovery.retryable!==false);
    const recovered=object(identityRecovery.character||identityRecovery.current);characterName=clean(recovered.characterName,160);serverId=positiveInt(recovered.serverId);const recoveredId=decodeId(recovered.characterId);
    if(!characterName||!serverId||!recoveredId)throw new WorkerError("고유값 복구 결과에 현재 캐릭터 식별 정보가 없습니다.","IDENTITY_RECOVERY_INVALID",false);
    identityTransition=identityTransitionContract(identityRecovery,previousServerId,serverId);
    if(identityTransition.ok!==true)throw new WorkerError(identityTransition.message,identityTransition.code,false,identityTransition);
    await progress(sessionId,sessionToken,"IDENTITY_RECOVERY_APPLIED",characterName,identityTransition.serverTransferred?"다른 서버 동일 고유값 확인 · 서버 이전과 레기온 해제 원자 반영":"같은 서버 이름 변경 반영 · 레기온 소속 유지",null,null,{targetId:target.targetId,...identityTransition});
    candidate={...recovered,characterName,serverId,characterId:recoveredId};
    lookupMethod="identity_recovery";
  }
  return{candidate,identityRecovery,identityTransition,characterName,serverId,expectedKey,prefetchedInfoPayload:null,lookupMethod};
}
async function processTarget(sessionId,sessionToken,target,providedContext=null){
  const targetId=positiveInt(target.targetId);const lookupOrder=positiveInt(target.lookupOrder)||1;
  const context=providedContext||await rpc("kinojo_server_queue_target_context_v270",{p_session_id:sessionId,p_session_token:sessionToken,p_target_id:targetId});
  if(context.ok!==true)throw new WorkerError(clean(context.message||"Target Context 확인 실패",1000),clean(context.code||"TARGET_CONTEXT_FAILED",120),false);
  let characterName=clean(context.characterName||target.characterName||target.name,160);let serverId=positiveInt(context.serverId||target.serverId);
  const reuse=await rpc("kinojo_lookup_reuse_candidate_v276",{p_session_id:sessionId,p_session_token:sessionToken,p_target_id:targetId,p_max_age_seconds:900});
  if(reuse.ok===true&&reuse.reusable===true){
    const cached=object(reuse.snapshot);
    const cachedSource=object(cached.officialApiSource);
    const snapshot={
      ...cached,
      schemaVersion:"kinojo-crawl-v2",
      tool:"KINOJO_SERVER_CHARACTER_QUEUE",
      toolName:"KINOJO_SERVER_CHARACTER_QUEUE",
      clientVersion:API_VERSION,
      buildDate:BUILD_DATE,
      snapshotUid:crypto.randomUUID(),
      sessionId,
      targetId,
      lookupOrder,
      listRow:context.listRow??target.row??cached.listRow??null,
      listOriginalName:target.originalName||cached.listOriginalName||characterName,
      name:target.characterName||characterName,
      characterName,
      mainCharacterName:context.mainCharacterName||target.mainCharacterName||cached.mainCharacterName||characterName,
      serverId:String(serverId),
      serverName:clean(context.serverName||target.serverName||cached.serverName,120),
      className:clean(context.className||target.className||cached.className,80),
      officialApiSource:{
        ...cachedSource,
        reused:true,
        reusedAt:new Date().toISOString(),
        reusedFromSnapshotId:reuse.snapshotId,
        reusedFromSessionId:reuse.sourceSessionId,
        cacheAgeSeconds:Number(reuse.ageSeconds||0),
        workerVersion:API_VERSION
      }
    };
    await progress(sessionId,sessionToken,"OFFICIAL_CACHE_REUSE",characterName,`최근 공식 원본 재사용 · ${Number(reuse.ageSeconds||0)}초 전`,null,null,{targetId,lookupOrder,sourceSnapshotId:reuse.snapshotId});
    const submitted=await rpc("kinojo_snapshot_submit",{p_session_id:sessionId,p_session_token:sessionToken,p_snapshot:snapshot,p_lookup_order:lookupOrder});
    if(submitted.ok!==true)throw new WorkerError(clean(submitted.message||submitted.code||"재사용 Snapshot 저장 실패",1000),clean(submitted.code||"SNAPSHOT_REUSE_FAILED",120),submitted.retryable!==false);
    const finalized=await finalizeTarget(sessionId,sessionToken,targetId,submitted);
    return{ok:true,targetId,lookupOrder,cached:true,cacheAgeSeconds:Number(reuse.ageSeconds||0),sourceSnapshotId:reuse.snapshotId,identityRecovered:false,character:{characterName,serverId,serverName:snapshot.serverName,className:snapshot.className,profileImageUrl:clean(snapshot.profileImageUrl,1600)},previous:context.previous||null,official:{reused:true},submitted,finalized};
  }
  const resolved=await resolveOfficialTarget(sessionId,sessionToken,{...target,targetId},context);
  const candidate=resolved.candidate;characterName=resolved.characterName;serverId=resolved.serverId;
  const characterId=decodeId(candidate.characterId);if(!characterId||!serverId)throw new WorkerError("공식 캐릭터 식별값 또는 서버 ID가 없습니다.","OFFICIAL_IDENTITY_MISSING",false);
  await progress(sessionId,sessionToken,"OFFICIAL_INFO",characterName,"PLAYNC 공식 프로필·전투력·아이템레벨 조회 중",null,null,{targetId,serverId,lookupOrder});
  const infoUrl=new URL("https://aion2.plaync.com/api/character/info"),equipmentUrl=new URL("https://aion2.plaync.com/api/character/equipment");
  for(const url of [infoUrl,equipmentUrl]){url.searchParams.set("lang","ko");url.searchParams.set("serverId",String(serverId));url.searchParams.set("characterId",characterId);}
  let infoPayload=resolved.prefetchedInfoPayload||await officialJson(infoUrl.toString(),sessionId,sessionToken,"SERVER_WORKER_INFO");
  let equipmentPayload=await officialJson(equipmentUrl.toString(),sessionId,sessionToken,"SERVER_WORKER_EQUIPMENT");
  let adapted=parserSource(infoPayload,equipmentPayload);
  let official=officialSnapshot({sessionId,targetId,lookupOrder,context,target,candidate,resolved,characterId,serverId,adapted,infoPayload,equipmentPayload});
  await progress(sessionId,sessionToken,"SNAPSHOT_PARSE",official.officialName,"기존 Server Parser로 장비 유형·수치 판정 중",null,null,{targetId,lookupOrder,equipmentCount:adapted.equipmentCount});
  let checked=await precheckOfficialSnapshot(sessionId,sessionToken,targetId,official.snapshot);
  if(checked.requiresSecondRead===true){
    await progress(sessionId,sessionToken,"OFFICIAL_STATE_VERIFY",official.officialName,"장비 유형 변경·급상승 감지 · 공식 응답 재검증 중",null,null,{targetId,lookupOrder,reason:checked.reason||checked.code||null});
    await sleep(1250);
    infoPayload=await officialJson(infoUrl.toString(),sessionId,sessionToken,"SERVER_WORKER_INFO_VERIFY");
    equipmentPayload=await officialJson(equipmentUrl.toString(),sessionId,sessionToken,"SERVER_WORKER_EQUIPMENT_VERIFY");
    adapted=parserSource(infoPayload,equipmentPayload);
    official=officialSnapshot({sessionId,targetId,lookupOrder,context,target,candidate,resolved,characterId,serverId,adapted,infoPayload,equipmentPayload});
    checked=await precheckOfficialSnapshot(sessionId,sessionToken,targetId,official.snapshot,clean(checked.fingerprint,500));
  }
  const submitted=await rpc("kinojo_snapshot_submit",{p_session_id:sessionId,p_session_token:sessionToken,p_snapshot:official.snapshot,p_lookup_order:lookupOrder});
  if(submitted.ok!==true)throw new WorkerError(clean(submitted.message||submitted.code||"Snapshot 저장 실패",1000),clean(submitted.code||"SNAPSHOT_SUBMIT_FAILED",120),submitted.retryable!==false);
  const finalized=await finalizeTarget(sessionId,sessionToken,targetId,submitted);
  return{ok:true,targetId,lookupOrder,identityRecovered:resolved.identityRecovery?.recovered===true,identityTransition:resolved.identityTransition||null,serverTransferred:resolved.identityTransition?.serverTransferred===true,legionCleared:resolved.identityTransition?.legionCleared===true,character:{characterName:official.officialName,serverId,serverName:official.officialServerName,className:clean(adapted.profile.className,80),profileImageUrl:official.profileImageUrl},previous:context.previous||null,official:{itemLevel:adapted.itemLevel,combatPower:adapted.combatPower,precheck:checked},submitted,finalized};
}
async function recordTargetFailure(sessionId,sessionToken,target,error){
  const code=clean(error?.code||"SERVER_QUEUE_TARGET_FAILED",120);const message=clean(error?.message||error||"Server Queue Target 처리 실패",1000);const retryable=error?.retryable!==false;
  return await rpc("kinojo_lookup_record_target_failure",{p_session_id:sessionId,p_session_token:sessionToken,p_target_id:positiveInt(target.targetId),p_list_row:positiveInt(target.row),p_server_id:positiveInt(target.serverId),p_character_name:clean(target.characterName||target.name,160),p_code:code,p_message:message,p_retryable:retryable});
}

async function syncListSheet(sessionId,sessionToken){
  const queue=await rpc("kinojo_queue_list_sheet_sync_session",{p_session_id:sessionId,p_session_token:sessionToken});
  if(queue.ok!==true)throw new WorkerError(clean(queue.message||queue.code||"Google list Queue 생성 실패",1000),clean(queue.code||"LIST_SHEET_QUEUE_FAILED",120),queue.retryable!==false);
  const expectedQueuedCount=Math.max(0,Number(queue.queuedCount||queue.queued||queue.targetCount||0));
  if(expectedQueuedCount<=0)throw new WorkerError("Google list에 반영할 Queue가 없습니다.","LIST_SHEET_QUEUE_EMPTY",false);
  const sync=await callEdge("lookup-list-sync",{action:"syncList",sessionId,sessionToken,expectedQueuedCount,noReviewToSheet:true,clientVersion:API_VERSION});
  if(sync.ok!==true||sync.finished!==true)throw new WorkerError(clean(sync.message||sync.code||"Google list 실제 쓰기·readback 검증 실패",1000),clean(sync.code||"LIST_SHEET_SYNC_FAILED",120),sync.retryable!==false);
  return{ok:true,expectedQueuedCount,queue,sync};
}
async function runQueue(body){
  const sessionId=clean(body.sessionId||body.session_id,240),sessionToken=clean(body.sessionToken||body.session_token,500),batchLimit=Math.max(1,Math.min(positiveInt(body.batchLimit||body.batch_limit)||5,5));
  if(!sessionId||!sessionToken)return json({ok:false,code:"MISSING_SESSION",message:"Server Queue sessionId/sessionToken이 필요합니다."},400);
  const workerId=`queue-${crypto.randomUUID()}`;
  const claimed=await rpc("kinojo_server_queue_worker_claim_v270",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_batch_limit:batchLimit});
  if(claimed.ok!==true)return json(claimed,400);
  if(claimed.acquired!==true)return json({...claimed,sessionId,workerId});
  const results=[];let processed=0,successCount=0,failureCount=0,paused=false,cancelled=false,done=false,rateLimited=false,rateLimitWaitMs=0,waiting=false,waitMs=0;
  try{
    while(processed<batchLimit){
      const control=await rpc("kinojo_lookup_control_state_v268",{p_session_id:sessionId,p_session_token:sessionToken});
      if(control.ok!==true)throw new WorkerError(clean(control.message||"Queue 제어 상태 확인 실패",1000),clean(control.code||"CONTROL_STATE_FAILED",120),true);
      if(control.cancelled===true||control.controlState==="cancelled"){cancelled=true;break;}
      if(control.paused===true||control.controlState==="paused"){paused=true;break;}
      const next=await rpc("kinojo_lookup_next_target_v285",{p_session_id:sessionId,p_session_token:sessionToken});
      if(next.ok!==true)throw new WorkerError(clean(next.message||"다음 Target 발급 실패",1000),clean(next.code||"NEXT_TARGET_FAILED",120),true);
      if(next.busy===true){
        waiting=true;
        waitMs=Math.max(1000,Number(next.retryAfterMs||1500));
        break;
      }
      if(next.done===true){
        const retried=await rpc("kinojo_lookup_retry_missing",{p_session_id:sessionId,p_session_token:sessionToken});
        if(Number(retried.retryQueued||0)>0)continue;
        done=true;break;
      }
      const target=object(next.target);processed+=1;
      try{
        const result=await processTarget(sessionId,sessionToken,target);successCount+=1;results.push({ok:true,...result});
      }catch(error){
        if(error?.rateLimited===true||error?.code==="PLAYNC_HTTP_429"||error?.code==="PLAYNC_RATE_PAUSED"){
          const retryAfterSeconds=Math.max(1,Math.ceil(Number(error?.retryAfterMs||30000)/1000));
          const reported=error?.code==="PLAYNC_RATE_PAUSED"
            ? await rpc("kinojo_official_rate_wait_defer_v276",{
                p_session_id:sessionId,
                p_session_token:sessionToken,
                p_target_id:positiveInt(target.targetId),
                p_message:clean(error?.message||"PLAYNC 요청 제한 대기 중",1000)
              })
            : await rpc("kinojo_official_rate_limit_report_v276",{
                p_session_id:sessionId,
                p_session_token:sessionToken,
                p_target_id:positiveInt(target.targetId),
                p_retry_after_seconds:retryAfterSeconds,
                p_source:"SERVER_CHARACTER_REFRESH_WORKER",
                p_message:clean(error?.message||"PLAYNC HTTP 429",1000)
              });
          rateLimited=true;
          rateLimitWaitMs=Math.max(1000,Number(reported.retryAfterMs||error?.retryAfterMs||30000));
          results.push({ok:false,rateLimited:true,attemptConsumed:false,targetId:target.targetId,characterName:target.characterName||target.name,code:clean(error?.code||"PLAYNC_HTTP_429",120),message:clean(error?.message||error,1000),retryable:true,retryAfterMs:rateLimitWaitMs});
          break;
        }
        failureCount+=1;const failure=await recordTargetFailure(sessionId,sessionToken,target,error).catch(recordError=>({ok:false,code:"FAILURE_RECORD_FAILED",message:clean(recordError?.message||recordError,1000)}));
        results.push({ok:false,targetId:target.targetId,characterName:target.characterName||target.name,code:clean(error?.code||"SERVER_QUEUE_TARGET_FAILED",120),message:clean(error?.message||error,1000),retryable:error?.retryable!==false,failure});
      }
      const summary=await rpc("kinojo_lookup_progress_summary",{p_session_id:sessionId});
      await rpc("kinojo_server_queue_worker_update_v270",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_stage:"SERVER_QUEUE_RUNNING",p_message:`Server Queue ${summary.completedCount||0}/${summary.total||0} · ${clean(summary.currentCharacter||target.characterName||target.name,160)}`,p_release:false,p_summary:{batchNo:claimed.batchNo,processed,successCount,failureCount,progress:summary}});
    }
    let summary=await rpc("kinojo_lookup_progress_summary",{p_session_id:sessionId});
    if(!paused&&!cancelled&&!rateLimited&&!waiting&&Number(summary.queuedCount||0)===0&&Number(summary.claimedCount||0)===0&&Number(summary.retryPendingCount||0)>0){
      await rpc("kinojo_lookup_retry_missing",{p_session_id:sessionId,p_session_token:sessionToken});summary=await rpc("kinojo_lookup_progress_summary",{p_session_id:sessionId});
    }
    done=!paused&&!cancelled&&!rateLimited&&!waiting&&Number(summary.total||0)>0&&Number(summary.completedCount||0)>=Number(summary.total||0);
    if(done){
      const lookupComplete=await rpc("kinojo_server_queue_lookup_complete_v271",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_summary:{apiVersion:API_VERSION,batchNo:claimed.batchNo,processed,successCount,failureCount,results:results.slice(-10)}});
      if(lookupComplete.ok!==true)return json({...lookupComplete,sessionId,workerId,batchNo:claimed.batchNo,processed,successCount,failureCount,results,progress:lookupComplete.progress||summary},400);
      if(lookupComplete.failed===true||lookupComplete.allFailed===true)return json({...lookupComplete,sessionId,workerId,batchNo:claimed.batchNo,processed,successCount,failureCount,results,progress:lookupComplete.progress||summary});
      const postprocess=await runPostprocess({sessionId,sessionToken});
      return json({ok:postprocess.ok!==false,done:postprocess.done===true,completed:postprocess.completed===true,failed:postprocess.failed===true,partialSuccess:postprocess.partialSuccess===true,hasMore:postprocess.hasMore===true,retryable:postprocess.retryable===true,listWriteSkipped:postprocess.listWriteSkipped===true,listReadbackSkipped:postprocess.listReadbackSkipped===true,listlessCharacterAdd:postprocess.listlessCharacterAdd===true,sessionId,workerId,batchNo:claimed.batchNo,processed,successCount,failureCount,results,progress:postprocess.progress||lookupComplete.progress||summary,lookupComplete,postprocess,message:postprocess.message||lookupComplete.message||"Server Queue 조회·후처리 완료"},postprocess.ok===false?400:200);
    }
    if(!cancelled){
      await rpc("kinojo_server_queue_worker_update_v270",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_stage:rateLimited?"PLAYNC_RATE_LIMITED":waiting?"SERVER_QUEUE_WAITING":paused?"PAUSED_BY_ADMIN":"SERVER_QUEUE_BATCH_DONE",p_message:rateLimited?`PLAYNC 요청 제한 · ${Math.ceil(rateLimitWaitMs/1000)}초 후 자동 재개`:waiting?"처리 중인 Target 확인 · stale Claim 자동 복구 대기":paused?"관리자 일시정지 · 현재 Batch 종료":"Server Queue Batch 처리 완료 · 다음 Batch 대기",p_release:true,p_summary:{apiVersion:API_VERSION,batchNo:claimed.batchNo,processed,successCount,failureCount,paused,rateLimited,waiting,retryAfterMs:Math.max(rateLimitWaitMs,waitMs),progress:summary}});
    }
    const hasMore=!paused&&!cancelled&&(rateLimited||waiting||Number(summary.queuedCount||0)>0||Number(summary.retryPendingCount||0)>0||Number(summary.claimedCount||0)>0);
    return json({ok:true,done:false,paused,cancelled,rateLimited,retryAfterMs:Math.max(rateLimitWaitMs,waitMs),attemptConsumed:rateLimited?false:undefined,hasMore,busy:waiting,sessionId,workerId,batchNo:claimed.batchNo,processed,successCount,failureCount,results,progress:summary,message:rateLimited?`PLAYNC 요청 제한 · ${Math.ceil(rateLimitWaitMs/1000)}초 후 자동 재개`:waiting?"처리 중인 Target 확인 · 자동 복구 대기":paused?"Server Queue가 일시정지되었습니다.":cancelled?"Server Queue가 중단되었습니다.":hasMore?"현재 Batch 완료 · 다음 Batch 대기":"처리 가능한 Target이 없습니다."});
  }catch(error){
    try{await rpc("kinojo_server_queue_worker_update_v270",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_stage:"SERVER_QUEUE_ERROR",p_message:clean(error?.message||error,1000),p_release:true,p_summary:{apiVersion:API_VERSION,batchNo:claimed.batchNo,processed,successCount,failureCount,error:clean(error?.message||error,1000)}});}catch{}
    return json({ok:false,code:clean(error?.code||"SERVER_QUEUE_WORKER_FAILED",120),retryable:error?.retryable!==false,sessionId,workerId,batchNo:claimed.batchNo,processed,successCount,failureCount,results,message:clean(error?.message||error,1000)},500);
  }
}

async function scheduleAutonomousTick(sessionId,sessionToken,workerId,delayMs=450){
  if(delayMs>0)await sleep(Math.min(Math.max(delayMs,250),120000));
  let lastError=null;
  for(let attempt=0;attempt<=AUTONOMOUS_HANDOFF_RETRY_DELAYS.length;attempt+=1){
    try{
      return await callEdge("character-refresh-worker",{
        action:"autonomousTick",
        sessionId,
        sessionToken,
        handoffWorkerId:workerId,
        clientVersion:API_VERSION
      });
    }catch(error){
      lastError=error;
      if(attempt>=AUTONOMOUS_HANDOFF_RETRY_DELAYS.length||!transientAutonomousHandoffError(error))throw error;
      try{
        await handoff(
          sessionId,
          sessionToken,
          workerId,
          "running",
          `일시적 Gateway 오류 · 다음 Server Batch 인계 재시도 ${attempt+1}/${AUTONOMOUS_HANDOFF_RETRY_DELAYS.length}`
        );
      }catch{}
      await sleep(AUTONOMOUS_HANDOFF_RETRY_DELAYS[attempt]);
    }
  }
  throw lastError||new WorkerError("다음 Server Batch 인계 재시도에 실패했습니다.","AUTONOMOUS_HANDOFF_RETRY_EXHAUSTED",true);
}
function background(task){
  const edgeRuntime=globalThis.EdgeRuntime;
  if(edgeRuntime&&typeof edgeRuntime.waitUntil==="function")edgeRuntime.waitUntil(task);
  else void task.catch(()=>{});
}
function dispatchAutonomousTick(sessionId,sessionToken,workerId,delayMs=450){
  background(scheduleAutonomousTick(sessionId,sessionToken,workerId,delayMs).catch(async error=>{
    const diagnostic=clean(`${clean(error?.code,120)}${error?.httpStatus?` / HTTP ${error.httpStatus}`:""} / ${clean(error?.message||error,800)}`,1000);
    try{await handoff(sessionId,sessionToken,workerId,"attention","다음 Server Batch 인계에 실패했습니다.",diagnostic);}catch{}
    await finishScheduledAutomation(sessionId,"failed",diagnostic);
  }));
}
async function runAutonomousTick(body){
  const sessionId=clean(body.sessionId||body.session_id,240);
  const sessionToken=clean(body.sessionToken||body.session_token,500);
  const workerId=clean(body.handoffWorkerId||body.workerId,240)||`auto-${crypto.randomUUID()}`;
  try{
    await handoff(sessionId,sessionToken,workerId,"running","서버가 캐릭터 조회와 후처리를 계속 진행하고 있습니다.");
    const response=await runQueue({sessionId,sessionToken,batchLimit:5});
    const result=object(await response.json().catch(()=>({ok:false,message:"Server Queue 응답을 읽지 못했습니다."})));

    if(result.acquired===false&&result.busy===true){
      await handoff(sessionId,sessionToken,workerId,"running","다른 Server Worker가 현재 Batch를 처리 중입니다. 기존 Worker 완료를 기다립니다.");
      return;
    }
    if(result.completed===true||result.done===true){
      const listless=result.listWriteSkipped===true||result.postprocess?.listWriteSkipped===true;
      const completedMessage=listless
        ?"캐릭터 조회와 Master·관계·성장 리뷰·랭킹 반영을 완료했습니다."
        :"캐릭터 조회와 Master·성장 리뷰·랭킹·Google list 반영을 완료했습니다.";
      await handoff(sessionId,sessionToken,workerId,"complete",completedMessage);
      await finishScheduledAutomation(sessionId,"completed",completedMessage);
      return;
    }
    if(result.cancelled===true){
      const cancelledMessage=clean(result.message||"관리자가 조회를 중단했습니다.",1000);
      await handoff(sessionId,sessionToken,workerId,"cancelled",cancelledMessage);
      await finishScheduledAutomation(sessionId,"failed",cancelledMessage);
      return;
    }
    if(result.paused===true){
      const pausedMessage=clean(result.message||"관리자가 조회를 일시정지했습니다.",1000);
      await handoff(sessionId,sessionToken,workerId,"paused",pausedMessage);
      await finishScheduledAutomation(sessionId,"failed",pausedMessage);
      return;
    }
    if(result.hasMore===true||result.busy===true||result.retryable===true){
      await handoff(sessionId,sessionToken,workerId,"running",clean(result.message||"다음 Server Batch를 준비하고 있습니다.",1000),result.failed===true?clean(result.code||"",120):"");
      const nextDelay=result.rateLimited===true?Math.max(1000,Number(result.retryAfterMs||30000)):result.busy===true?Math.max(1000,Number(result.retryAfterMs||1500)):result.postprocess===true?900:250;
      dispatchAutonomousTick(sessionId,sessionToken,workerId,nextDelay);
      return;
    }
    const stoppedMessage=clean(result.message||"Server Queue가 완료되지 않은 상태로 멈췄습니다.",1000);
    await handoff(sessionId,sessionToken,workerId,"attention",stoppedMessage,clean(result.code||"AUTONOMOUS_QUEUE_STOPPED",120));
    await finishScheduledAutomation(sessionId,"failed",stoppedMessage);
  }catch(error){
    const failedMessage=clean(error?.message||error,1000);
    try{await handoff(sessionId,sessionToken,workerId,"attention","서버 자동 실행 중 오류가 발생했습니다.",failedMessage);}catch{}
    await finishScheduledAutomation(sessionId,"failed",failedMessage);
  }
}
async function startAutonomous(body){
  const sessionId=clean(body.sessionId||body.session_id,240);
  const sessionToken=clean(body.sessionToken||body.session_token,500);
  if(!sessionId||!sessionToken)return json({ok:false,code:"MISSING_SESSION",message:"자동 실행 인계에 필요한 sessionId/sessionToken이 없습니다."},400);
  const workerId=`auto-${crypto.randomUUID()}`;
  const prepared=await handoff(sessionId,sessionToken,workerId,"preparing","서버 자동 실행을 인계하고 있습니다.");
  if(prepared.ok!==true)return json(prepared,400);
  dispatchAutonomousTick(sessionId,sessionToken,workerId,0);
  return json({
    ok:true,
    accepted:true,
    sessionId,
    workerId,
    handoff:{state:"safe",safety:"safe"},
    message:"서버 실행 인계를 완료했습니다. 이제 페이지나 브라우저를 닫아도 조회가 계속됩니다."
  });
}

async function runPostprocess(body){
  const sessionId=clean(body.sessionId||body.session_id,240),sessionToken=clean(body.sessionToken||body.session_token,500);
  if(!sessionId||!sessionToken)return{ok:false,code:"MISSING_SESSION",message:"Server 후처리 sessionId/sessionToken이 필요합니다."};
  const workerId=`post-${crypto.randomUUID()}`;
  const claimed=await rpc("kinojo_server_queue_postprocess_claim_v271",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId});
  if(claimed.ok!==true)return{...claimed,sessionId,workerId,postprocess:true};
  if(claimed.acquired!==true)return{...claimed,sessionId,workerId,postprocess:true,hasMore:claimed.busy===true||claimed.paused===true};

  const stages=[];
  let nextStage=clean(claimed.nextStage,80)||"MASTER_SYNC";
  for(let index=0;index<3&&nextStage!=="COMPLETE";index+=1){
    const control=await rpc("kinojo_lookup_control_state_v268",{p_session_id:sessionId,p_session_token:sessionToken});
    if(control.ok!==true)return{ok:false,code:clean(control.code||"CONTROL_STATE_FAILED",120),message:clean(control.message||"Queue 제어 상태 확인 실패",1000),sessionId,workerId,postprocess:true,retryable:true};
    if(control.cancelled===true||control.controlState==="cancelled")return{ok:true,done:false,cancelled:true,hasMore:false,sessionId,workerId,postprocess:true,message:"Server 후처리가 중단되었습니다."};
    if(control.paused===true||control.controlState==="paused")return{ok:true,done:false,paused:true,hasMore:false,sessionId,workerId,postprocess:true,message:"Server 후처리가 일시정지되었습니다."};

    const stage=await rpc("kinojo_server_queue_postprocess_run_stage_v271",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId});
    stages.push(stage);
    if(stage.ok!==true||stage.stageOk===false||stage.finalFailure===true){
      return{ok:true,done:stage.finalFailure===true,completed:false,failed:true,postprocessFailed:true,finalFailure:stage.finalFailure===true,retryable:stage.finalFailure!==true,hasMore:stage.finalFailure!==true,sessionId,workerId,postprocess:true,failedStage:stage.stage||nextStage,attemptCount:stage.attemptCount,maxAttempts:stage.maxAttempts,stages,message:clean(stage.message||"Server 후처리 단계가 실패했습니다.",1000)};
    }
    nextStage=clean(stage.nextStage,80)||"COMPLETE";
  }

  if(nextStage!=="COMPLETE")return{ok:true,done:false,completed:false,hasMore:true,sessionId,workerId,postprocess:true,nextStage,stages,message:"Server 후처리 다음 단계를 계속합니다."};
  const listlessPolicy=await rpc("kinojo_legion_tree_listless_policy_v455",{
    p_session_id:sessionId,
    p_session_token:sessionToken
  });
  if(listlessPolicy.ok!==true)return{...listlessPolicy,sessionId,workerId,postprocess:true};
  if(listlessPolicy.skipListWrite===true){
    const completed=await rpc("kinojo_legion_tree_listless_complete_v455",{
      p_session_id:sessionId,
      p_session_token:sessionToken,
      p_worker_id:workerId,
      p_summary:{
        apiVersion:API_VERSION,
        stages:stages.map(item=>({stage:item.stage,nextStage:item.nextStage,ok:item.ok})),
        listlessPolicy
      }
    });
    return{
      ...completed,
      sessionId,
      workerId,
      postprocess:true,
      stages,
      listlessPolicy,
      listWriteSkipped:completed.listWriteSkipped===true,
      listReadbackSkipped:completed.listReadbackSkipped===true,
      listlessCharacterAdd:completed.listlessCharacterAdd===true,
      hasMore:false,
      message:clean(completed.message||"캐릭터 Master·관계·랭킹 반영을 완료했습니다.",1000)
    };
  }
  const listClaim=await rpc("kinojo_server_queue_list_sync_claim_v289",{
    p_session_id:sessionId,
    p_session_token:sessionToken,
    p_worker_id:workerId
  });
  if(listClaim.ok!==true)return{...listClaim,sessionId,workerId,postprocess:true};
  if(listClaim.acquired!==true){
    return{
      ...listClaim,
      sessionId,
      workerId,
      postprocess:true,
      hasMore:listClaim.busy===true
    };
  }

  let listSheet;
  try{
    listSheet=await syncListSheet(sessionId,sessionToken);
  }catch(error){
    const failed=await rpc("kinojo_server_queue_list_sync_fail_v289",{
      p_session_id:sessionId,
      p_session_token:sessionToken,
      p_worker_id:workerId,
      p_code:clean(error?.code||"LIST_SHEET_SYNC_FAILED",120),
      p_message:clean(error?.message||error,1000),
      p_retryable:error?.retryable!==false
    }).catch(()=>({ok:false}));
    return{
      ok:true,
      done:failed.finalFailure===true,
      completed:false,
      failed:true,
      sheetSyncFailed:true,
      finalFailure:failed.finalFailure===true,
      retryable:failed.retryable===true,
      hasMore:failed.hasMore===true,
      sessionId,
      workerId,
      postprocess:true,
      failedStage:"LIST_SHEET_EXPORT",
      stages,
      code:clean(error?.code||"LIST_SHEET_SYNC_FAILED",120),
      message:clean(failed.message||error?.message||error,1000)
    };
  }
  const completed=await rpc("kinojo_server_queue_postprocess_complete_v271",{p_session_id:sessionId,p_session_token:sessionToken,p_worker_id:workerId,p_summary:{apiVersion:API_VERSION,stages:stages.map(item=>({stage:item.stage,nextStage:item.nextStage,ok:item.ok})),listSheet:{expectedQueuedCount:listSheet.expectedQueuedCount,updatedCount:Number(listSheet.sync.updatedCount||0),failedCount:Number(listSheet.sync.failedCount||0),readbackVerifiedCount:Number(listSheet.sync.bridge?.readbackVerifiedCount||0),completedAt:listSheet.sync.completedAt||null}}});
  return{...completed,sessionId,workerId,postprocess:true,stages,listSheet,hasMore:false,message:clean(completed.message||"Server 후처리와 Google list 반영을 완료했습니다.",1000)};
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="POST")return json({ok:false,message:"POST만 허용합니다."},405);
  try{
    const body=object(await request.json().catch(()=>({}))),action=clean(body.action,80);
    if(action==="health")return json({ok:true,service:"character-refresh-worker",apiVersion:API_VERSION,databaseContract:CONTRACT,identityDatabaseContract:IDENTITY_DATABASE_CONTRACT,progressContract:"server-worker-seven-phase-v2",progressPhases:7,modes:["startAutonomous","autonomousTick","runQueue","runPostprocess"],queueBatchLimit:5,lookupOnlyPhase:false,postprocessPhase:true,sheetDeferred:false,sheetSyncPhase:true,sheetReadbackRequired:true,listSyncSingleWorkerLease:true,listSyncCompletionAtomic:true,legionTreeCharacterAddListless:true,legionTreeCharacterAddListWrite:false,legionTreeCharacterAddListReadback:false,legionTreeListlessDatabaseContract:"455",legionTreeListlessTargetSource:"server:legion_tree_character_add_v455",legionTreeListlessTerminalStage:"SERVER_QUEUE_CHARACTER_MASTER_DONE",etaContract:"remaining-plaync-targets-only",retryFailedRowsOnly:true,browserIndependentQueue:true,autonomousTickMode:"detached",autonomousHandoffRetryMax:AUTONOMOUS_HANDOFF_RETRY_DELAYS.length,autonomousHandoffRetryStatuses:[502,503,504],autonomousHandoffRetryClassifier:"http-status-first+message-fallback",autonomousHandoffHttpStatusPreserved:true,autonomousHandoffClassifierSelfTest:autonomousHandoffClassifierSelfTest(),targetAtomicFinalize:true,staleClaimRecoverySeconds:120,gearSpecificPayloadIds:true,officialStatePrecheck:true,perTargetReconcile:false,finalReconcileOnly:true,storesOfficialRaw:true,officialExactCombatPower:true,officialRateGate:"plaync_global_700ms",officialRawReuseSeconds:900,plaync429AttemptConsumed:false,identityRecovery:"two-terminal-misses-then-same-race-name-hint-exact-key",identityRecoveryEntry:"stored-detail-404-or-empty-identity-200+name-server-terminal-not-found",providerRetryEntersIdentityRecovery:false,serverTransferLegionAtomic:true,sameServerRenamePreservesLegion:true,listSyncEdge:"lookup-list-sync"});
    if(action==="startAutonomous")return await startAutonomous(body);
    if(action==="autonomousTick"){
      if(!internalRequest(request))return json({ok:false,code:"INTERNAL_ONLY",message:"서버 내부 자동 실행 요청만 허용합니다."},403);
      const sessionId=clean(body.sessionId||body.session_id,240),sessionToken=clean(body.sessionToken||body.session_token,500),workerId=clean(body.handoffWorkerId||body.workerId,240)||`auto-${crypto.randomUUID()}`;
      if(!sessionId||!sessionToken)return json({ok:false,code:"MISSING_SESSION",message:"자동 실행 sessionId/sessionToken이 없습니다."},400);
      await handoff(sessionId,sessionToken,workerId,"safe","서버 실행 인계 완료 · 브라우저 없이 조회와 후처리를 계속합니다.");
      const task=runAutonomousTick({...body,sessionId,sessionToken,handoffWorkerId:workerId});
      const edgeRuntime=globalThis.EdgeRuntime;
      if(edgeRuntime&&typeof edgeRuntime.waitUntil==="function")edgeRuntime.waitUntil(task);
      else await task;
      return json({ok:true,accepted:true,sessionId,workerId,message:"서버 자동 실행 Batch를 인계받았습니다."},202);
    }
    if(action==="runQueue")return await runQueue(body);
    if(action==="runPostprocess")return json(await runPostprocess(body));
    return json({ok:false,code:"UNKNOWN_ACTION",message:"지원하지 않는 character refresh action입니다."},400);
  }catch(error){return json({ok:false,code:clean(error?.code||"EDGE_FUNCTION_ERROR",120),message:clean(error?.message||error,1000)},500);}
});
