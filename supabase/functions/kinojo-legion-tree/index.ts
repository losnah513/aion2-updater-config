const SERVICE_NAME='kinojo-legion-tree';
const API_VERSION='1.3';
const DATABASE_CONTRACT='453';
const AUTH_CONTRACT='320';
const MODE_CONTRACT='1';
const DEDUPE_CONTRACT='366';
const QUEUE_CONTRACT='368';
const WORKER_CONTRACT='295';
const ORGANIZATION_CONTRACT='legion-tree-organization-save-v1';
const MAX_REQUEST_BYTES=131072;
const MAX_CHARACTER_ADD_BYTES=4096;
const TOKEN=/^kws_[A-Za-z0-9_-]{40,80}$/;
const LEGIONS=new Set(['깡','낮','밤','키나노동조합']);
const encoder=new TextEncoder();
const allowedOrigins=new Set(['https://kinojo.info','https://www.kinojo.info']);

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,max=500)=>String(value??'').trim().slice(0,max);
const normalizeName=(value:unknown)=>text(value,120).normalize('NFKC').trim();
const identityName=(value:unknown)=>normalizeName(value).toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
const positiveInt=(value:unknown)=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:null;};
const nonNegativeInt=(value:unknown)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;};

function origin(request:Request){const value=text(request.headers.get('origin'),300);return allowedOrigins.has(value)?value:'';}
function headers(request:Request){return{
  'access-control-allow-origin':origin(request)||'https://kinojo.info',
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
  'access-control-max-age':'600','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff',
  'x-kinojo-legion-tree-contract':'legion-tree-v2','x-kinojo-legion-tree-organization-contract':ORGANIZATION_CONTRACT,'x-kinojo-legion-tree-mode-contract':MODE_CONTRACT,'x-kinojo-legion-tree-dedupe-contract':DEDUPE_CONTRACT,'x-kinojo-legion-tree-queue-contract':QUEUE_CONTRACT,'x-kinojo-legion-tree-worker-contract':WORKER_CONTRACT,'x-kinojo-auth-contract':AUTH_CONTRACT,
};}
function json(request:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers(request)});}
function service(){
  const url=text(Deno.env.get('SUPABASE_URL'),500).replace(/\/$/,'');
  let key=text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),4000);
  if(!key){try{key=text(record(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')).default,4000);}catch{key='';}}
  if(!url||!key)throw new Error('LEGION_TREE_SERVER_NOT_CONFIGURED');
  return{url,key};
}
async function rpc(name:string,body:Record<string,unknown>){
  const{url,key}=service();
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json','x-client-info':`${SERVICE_NAME}/${API_VERSION}`},body:JSON.stringify(body)});
  const raw=await response.text();let data:unknown={};try{data=raw?JSON.parse(raw):{};}catch{data={};}
  if(!response.ok)throw new Error(`RPC_FAILED:${name}`);
  return record(data);
}
async function callEdge(name:string,body:Record<string,unknown>){
  const{url,key}=service();
  try{
    const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json','x-client-info':`${SERVICE_NAME}/${API_VERSION}`},body:JSON.stringify(body)});
    const raw=await response.text();let data:unknown={};try{data=raw?JSON.parse(raw):{};}catch{data={};}
    return{responded:true,httpStatus:response.status,httpOk:response.ok,data:record(data),raw:text(raw,800)};
  }catch(error){
    return{responded:false,httpStatus:0,httpOk:false,data:{},raw:'',error:text(error instanceof Error?error.message:error,800)};
  }
}
async function activeServer(serverId:number){
  const{url,key}=service();const query=new URL(`${url}/rest/v1/server_master`);
  query.searchParams.set('server_id',`eq.${serverId}`);query.searchParams.set('is_active','eq.true');query.searchParams.set('select','server_id,server_name,race_id');query.searchParams.set('limit','1');
  const response=await fetch(query.toString(),{headers:{apikey:key,authorization:`Bearer ${key}`,'x-client-info':`${SERVICE_NAME}/${API_VERSION}`}});
  const raw=await response.text();let rows:unknown=[];try{rows=raw?JSON.parse(raw):[];}catch{rows=[];}
  if(!response.ok)throw new Error('SERVER_REFERENCE_READ_FAILED');
  return Array.isArray(rows)&&rows.length?record(rows[0]):null;
}
function raceName(raceId:number){if(raceId===1)return'천족';if(raceId===2)return'마족';return'';}
function rawCredentialField(body:Record<string,unknown>){return['passKey','pass_key','passCode','pass_code'].find(key=>Object.prototype.hasOwnProperty.call(body,key))||'';}
function memberSelectorField(body:Record<string,unknown>){return['memberId','member_id','targetMemberId','target_member_id','updatedBy','updated_by'].find(key=>Object.prototype.hasOwnProperty.call(body,key))||'';}
function forbiddenField(body:Record<string,unknown>,allowed:Set<string>){
  const rawCredential=rawCredentialField(body);
  if(rawCredential)return{code:'RAW_CREDENTIAL_FORBIDDEN',field:rawCredential,message:'PASS KEY 원문은 이 요청에 사용할 수 없습니다.'};
  const memberSelector=memberSelectorField(body);
  if(memberSelector)return{code:'CLIENT_MEMBER_SELECTOR_FORBIDDEN',field:memberSelector,message:'작업 주체는 Server 세션에서 결정합니다.'};
  const extra=Object.keys(body).find(key=>!allowed.has(key));
  if(extra)return{code:'CLIENT_DERIVED_FIELD_FORBIDDEN',field:extra,message:'Server가 결정하는 값을 요청에 포함할 수 없습니다.'};
  return null;
}
function resolveMode(mainCharacterName:unknown,altCharacterName:unknown){
  const mainName=normalizeName(mainCharacterName),altName=normalizeName(altCharacterName);
  if(!mainName)return{ok:false,code:'MAIN_CHARACTER_REQUIRED',message:'본캐 이름을 입력해 주세요.'};
  if(altName&&identityName(mainName)===identityName(altName))return{ok:false,code:'MAIN_ALT_SAME_CHARACTER',message:'본캐와 부캐 이름이 같습니다.'};
  if(altName)return{ok:true,mode:'ALT',mainCharacterName:mainName,altCharacterName:altName,targetCharacterName:altName};
  return{ok:true,mode:'MAIN',mainCharacterName:mainName,altCharacterName:null,targetCharacterName:mainName};
}
function execution(dedupe:boolean,queueStarted=false,workerStarted=false,nextStage='DEDUPE'){return{dedupeChecked:dedupe===true,queueStarted:queueStarted===true,workerStarted:workerStarted===true,nextStage};}

function normalizeOrganization(body:Record<string,unknown>,resetToDefault:boolean){
  const legionName=text(body.legionName,120);
  const expectedRevision=nonNegativeInt(body.expectedRevision);
  if(!LEGIONS.has(legionName))return{ok:false,code:'INVALID_LEGION',message:'지원하지 않는 레기온입니다.'};
  if(expectedRevision===null)return{ok:false,code:'INVALID_REVISION',message:'revision 값을 다시 확인해 주세요.'};
  if(resetToDefault)return{ok:true,legionName,expectedRevision,stageCount:0,stageNames:[],roles:[],assignments:[]};

  const stageCount=positiveInt(body.stageCount);
  const stages=Array.isArray(body.stages)?body.stages:[];
  const assignmentsInput=Array.isArray(body.assignments)?body.assignments:[];
  if(stageCount===null||stageCount>50||stages.length!==stageCount)return{ok:false,code:'INVALID_STAGE_COUNT',message:'단계 수와 단계 목록을 다시 확인해 주세요.'};
  if(assignmentsInput.length>2000)return{ok:false,code:'ASSIGNMENTS_TOO_LARGE',message:'구성원 배치 수가 허용 범위를 초과했습니다.'};

  const stageNames:string[]=[];
  const roles:Array<Record<string,unknown>>=[];
  for(let stageIndex=0;stageIndex<stages.length;stageIndex+=1){
    const stage=record(stages[stageIndex]);
    const stageNo=positiveInt(stage.stageNo);
    const stageName=text(stage.stageName,121);
    const stageRoles=Array.isArray(stage.roles)?stage.roles:[];
    if(stageNo!==stageIndex+1||!stageName||stageName.length>120||!stageRoles.length)return{ok:false,code:'INVALID_STAGE',message:'각 단계의 번호·이름·직급을 다시 확인해 주세요.'};
    stageNames.push(stageName);
    for(let roleIndex=0;roleIndex<stageRoles.length;roleIndex+=1){
      const role=record(stageRoles[roleIndex]);
      const roleKey=text(role.roleKey,181),roleName=text(role.roleName,121);
      const slotNo=positiveInt(role.slotNo);
      const rawMax=role.maxMembers;
      const maxMembers=rawMax===null||rawMax===undefined||rawMax===''?null:positiveInt(rawMax);
      if(!roleKey||roleKey.length>180||!roleName||roleName.length>120||slotNo!==roleIndex+1||(rawMax!==null&&rawMax!==undefined&&rawMax!==''&&maxMembers===null))return{ok:false,code:'INVALID_ROLE',message:'직급 이름·순서·최대 인원을 다시 확인해 주세요.'};
      roles.push({roleKey,stageNo,slotNo,roleName,maxMembers,sortOrder:roles.length});
    }
  }
  if(roles.length>500)return{ok:false,code:'ROLES_TOO_LARGE',message:'직급 수가 허용 범위를 초과했습니다.'};

  const assignments:Array<Record<string,unknown>>=[];
  for(let index=0;index<assignmentsInput.length;index+=1){
    const assignment=record(assignmentsInput[index]);
    const characterId=positiveInt(assignment.characterId);
    const roleKey=text(assignment.roleKey,181);
    const parentRoleKey=text(assignment.parentRoleKey,181)||null;
    const sortOrder=nonNegativeInt(assignment.sortOrder)??index;
    if(characterId===null||!roleKey||roleKey.length>180||(parentRoleKey&&parentRoleKey.length>180))return{ok:false,code:'INVALID_ASSIGNMENT',message:'구성원 배치와 상위 소속을 다시 확인해 주세요.'};
    assignments.push({characterId,roleKey,parentRoleKey,sortOrder});
  }
  return{ok:true,legionName,expectedRevision,stageCount,stageNames,roles,assignments};
}

function organizationErrorStatus(code:string){
  if(code.startsWith('SESSION_')||code==='MEMBER_INACTIVE')return 401;
  if(code==='ORGANIZATION_SAVE_FORBIDDEN')return 403;
  if(code==='REVISION_CONFLICT')return 409;
  return 400;
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(request)});
  if(request.method!=='POST')return json(request,{ok:false,code:'METHOD_NOT_ALLOWED',message:'POST 요청만 허용합니다.'},405);
  if(!text(request.headers.get('content-type'),200).toLowerCase().includes('application/json'))return json(request,{ok:false,code:'JSON_REQUIRED',message:'JSON 요청만 허용합니다.'},415);
  try{
    const raw=await request.text();
    const rawBytes=encoder.encode(raw).byteLength;
    if(rawBytes>MAX_REQUEST_BYTES)return json(request,{ok:false,code:'REQUEST_TOO_LARGE',message:'요청 크기가 허용 범위를 초과했습니다.'},413);
    const body=record(raw?JSON.parse(raw):{}),action=text(body.action,40)||'health';
    if(action==='health')return json(request,{ok:true,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-v2',organizationContract:ORGANIZATION_CONTRACT,databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,authBoundary:'KWS_SERVER_SESSION_ONLY',serverReference:'server_master',dedupeBasis:'character_master server_id+character_identity_key_v298',queueModel:'existing-global-updater-lock-single-target',workerAction:'startAutonomous',listAppendPending:true,modeRule:{mainOnly:'MAIN',mainAndAlt:'ALT',altOnly:'REJECT',sameName:'REJECT'},dedupeConnected:true,queueConnected:true,workerConnected:true,organizationSaveConnected:true,organizationReadbackConnected:true,organizationTransaction:'single_postgres_transaction',edgeDecision:'REUSE_WITH_DB_MODULE',actions:['character-add','organization-save','organization-reset']});

    if(action==='organization-save'||action==='organization-reset'){
      const allowed=action==='organization-reset'
        ?new Set(['action','sessionToken','legionName','expectedRevision'])
        :new Set(['action','sessionToken','legionName','expectedRevision','stageCount','stages','assignments']);
      const forbidden=forbiddenField(body,allowed);if(forbidden)return json(request,{ok:false,...forbidden},400);
      const sessionToken=text(body.sessionToken,120);if(!TOKEN.test(sessionToken))return json(request,{ok:false,code:'SESSION_TOKEN_INVALID',message:'로그인 세션이 필요합니다.'},401);
      const session=await rpc('kinojo_web_session_validate_v320',{p_session_token:sessionToken,p_touch:false});
      if(session.ok!==true)return json(request,{ok:false,code:text(session.code,80)||'SESSION_INVALID',message:text(session.message,300)||'로그인 세션을 확인하지 못했습니다.'},401);
      if(record(session.profile).canManage!==true)return json(request,{ok:false,code:'ORGANIZATION_SAVE_FORBIDDEN',message:'조직도를 저장할 권한이 없습니다.'},403);

      const resetToDefault=action==='organization-reset';
      const normalized=normalizeOrganization(body,resetToDefault);
      if(normalized.ok!==true)return json(request,normalized,400);
      const saved=await rpc('kinojo_legion_tree_organization_save_v453',{
        p_session_token:sessionToken,
        p_legion_name:normalized.legionName,
        p_expected_revision:normalized.expectedRevision,
        p_stage_count:normalized.stageCount,
        p_stage_names:normalized.stageNames,
        p_roles:normalized.roles,
        p_assignments:normalized.assignments,
        p_reset_to_default:resetToDefault
      });
      if(saved.ok!==true)return json(request,saved,organizationErrorStatus(text(saved.code,80)));

      const tree=await rpc('kinojo_web_get_legion_tree',{});
      if(tree.ok!==true)throw new Error('ORGANIZATION_READBACK_FAILED');
      const legions=Array.isArray(tree.legions)?tree.legions:[];
      const legion=legions.map(record).find(item=>text(item.legionName,120)===normalized.legionName);
      const expectedReadRevision=resetToDefault?0:nonNegativeInt(saved.revision);
      if(!legion||nonNegativeInt(legion.revision)!==expectedReadRevision||Boolean(legion.fallbackApplied)!==resetToDefault)throw new Error('ORGANIZATION_READBACK_MISMATCH');
      return json(request,{ok:true,service:SERVICE_NAME,apiVersion:API_VERSION,contract:ORGANIZATION_CONTRACT,databaseContract:DATABASE_CONTRACT,code:text(saved.code,80),message:resetToDefault?'기본 조직도로 복원했습니다.':'조직도를 저장했습니다.',legionName:normalized.legionName,previousRevision:nonNegativeInt(saved.previousRevision),revision:expectedReadRevision,resetToDefault,readbackVerified:true,tree});
    }

    if(action!=='character-add')return json(request,{ok:false,code:'UNSUPPORTED_ACTION',message:'지원하지 않는 요청입니다.'},400);
    if(rawBytes>MAX_CHARACTER_ADD_BYTES)return json(request,{ok:false,code:'REQUEST_TOO_LARGE',message:'캐릭터 추가 요청 크기가 허용 범위를 초과했습니다.'},413);
    const forbidden=forbiddenField(body,new Set(['action','sessionToken','mainCharacterName','altCharacterName','serverId']));if(forbidden)return json(request,{ok:false,...forbidden},400);
    const sessionToken=text(body.sessionToken,120);if(!TOKEN.test(sessionToken))return json(request,{ok:false,code:'SESSION_TOKEN_INVALID',message:'로그인 세션이 필요합니다.'},401);
    const mode=resolveMode(body.mainCharacterName,body.altCharacterName);if(mode.ok!==true)return json(request,mode,400);
    const serverId=positiveInt(body.serverId);if(serverId===null)return json(request,{ok:false,code:'SERVER_REQUIRED',message:'서버를 선택해 주세요.'},400);

    const session=await rpc('kinojo_web_session_validate_v320',{p_session_token:sessionToken,p_touch:false});
    if(session.ok!==true)return json(request,{ok:false,code:text(session.code,80)||'SESSION_INVALID',message:text(session.message,300)||'로그인 세션을 확인하지 못했습니다.'},401);
    const server=await activeServer(serverId);if(!server)return json(request,{ok:false,code:'SERVER_NOT_FOUND',message:'현재 사용할 수 없는 서버입니다.'},400);
    const resolvedServerId=positiveInt(server.server_id),raceId=positiveInt(server.race_id),resolvedRaceName=raceName(raceId||0);
    if(resolvedServerId!==serverId||!resolvedRaceName)throw new Error('SERVER_REFERENCE_INVALID');

    const dedupe=await rpc('kinojo_legion_tree_character_dedupe_v366',{p_server_id:serverId,p_character_name:mode.targetCharacterName});
    if(dedupe.ok!==true)throw new Error('DEDUPE_RPC_INVALID');
    const dedupeCode=text(dedupe.code,80),existingCharacterId=positiveInt(dedupe.existingCharacterId),listRow=positiveInt(dedupe.listRow);
    const target={mainCharacterName:mode.mainCharacterName,altCharacterName:mode.altCharacterName,targetCharacterName:mode.targetCharacterName,serverId,serverName:text(server.server_name,120),raceId,raceName:resolvedRaceName};

    if(dedupeCode==='ALREADY_REGISTERED')return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'ALREADY_REGISTERED',message:'이미 등록된 캐릭터입니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:true,decision:'STOP_ALREADY_REGISTERED',existingCharacterId,listRow},execution:execution(true,false,false,'STOPPED')},409);
    if(dedupeCode==='EXISTING_CHARACTER_INACTIVE')return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'EXISTING_CHARACTER_INACTIVE',message:'기존 캐릭터 기록이 비활성 상태입니다. 신원 복구 후 다시 시도해 주세요.',mode:mode.mode,target,dedupe:{checked:true,duplicate:true,decision:'STOP_INACTIVE_EXISTING',existingCharacterId,listRow},execution:execution(true,false,false,'STOPPED')},409);
    if(dedupeCode!=='EXISTING_CHARACTER_REUSE'&&dedupeCode!=='NEW_CHARACTER')throw new Error('DEDUPE_RESULT_UNSUPPORTED');

    const prepared=await rpc('kinojo_legion_tree_character_queue_prepare_v368',{p_web_session_token:sessionToken,p_server_id:serverId,p_target_character_name:mode.targetCharacterName,p_main_character_name:mode.mainCharacterName,p_mode:mode.mode});
    const preparedCode=text(prepared.code,80);
    if(preparedCode==='ALREADY_REGISTERED')return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'ALREADY_REGISTERED',message:'이미 등록된 캐릭터입니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:true,decision:'STOP_ALREADY_REGISTERED',existingCharacterId:positiveInt(prepared.existingCharacterId),listRow:positiveInt(prepared.listRow)},execution:execution(true,false,false,'STOPPED')},409);
    if(preparedCode==='EXISTING_CHARACTER_INACTIVE')return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'EXISTING_CHARACTER_INACTIVE',message:'기존 캐릭터 기록이 비활성 상태입니다. 신원 복구 후 다시 시도해 주세요.',mode:mode.mode,target,dedupe:{checked:true,duplicate:true,decision:'STOP_INACTIVE_EXISTING',existingCharacterId:positiveInt(prepared.existingCharacterId),listRow:positiveInt(prepared.listRow)},execution:execution(true,false,false,'STOPPED')},409);
    if(preparedCode==='QUEUE_BUSY')return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'QUEUE_BUSY',message:text(prepared.message,300)||'다른 캐릭터 정보 최신화 작업이 진행 중입니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:dedupeCode!=='NEW_CHARACTER',decision:dedupeCode},execution:execution(true,false,false,'STOPPED')},409);
    if(prepared.ok!==true||!['QUEUE_READY','QUEUE_ALREADY_RUNNING'].includes(preparedCode))throw new Error('QUEUE_PREPARE_FAILED');

    const queueSessionId=text(prepared.sessionId,240),queueSessionToken=text(prepared.sessionToken,500),targetId=positiveInt(prepared.targetId);
    if(!queueSessionId||!queueSessionToken||targetId===null)throw new Error('QUEUE_PREPARE_INVALID');
    const queue={sessionId:queueSessionId,targetId,queueCount:1,resumed:preparedCode==='QUEUE_ALREADY_RUNNING',contract:QUEUE_CONTRACT,targetSource:text(prepared.targetSource,160)||'server:legion_tree_character_add_v368'};
    const worker=await callEdge('character-refresh-worker',{action:'startAutonomous',sessionId:queueSessionId,sessionToken:queueSessionToken,clientVersion:API_VERSION});
    if(worker.responded!==true)return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'WORKER_HANDOFF_UNCERTAIN',message:'Server Worker 응답을 확인하지 못했습니다. 같은 요청으로 다시 시도하면 기존 Queue를 이어갑니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:dedupeCode!=='NEW_CHARACTER',decision:dedupeCode},queue,handoff:{accepted:false,uncertain:true,state:'retry'},execution:execution(true,true,false,'HANDOFF_RETRY')},503);
    const workerData=record(worker.data);
    if(worker.httpOk!==true||workerData.ok!==true||workerData.accepted!==true){
      await rpc('kinojo_legion_tree_character_queue_abort_v368',{p_session_id:queueSessionId,p_session_token:queueSessionToken,p_reason:`character-refresh-worker handoff rejected: HTTP ${worker.httpStatus} ${text(workerData.code||workerData.message||worker.raw,300)}`}).catch(()=>({}));
      return json(request,{ok:false,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'WORKER_HANDOFF_FAILED',message:'Server Worker 실행 인계에 실패했습니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:dedupeCode!=='NEW_CHARACTER',decision:dedupeCode},queue:{...queue,aborted:true},handoff:{accepted:false,uncertain:false,httpStatus:worker.httpStatus,state:'aborted'},execution:execution(true,false,false,'STOPPED')},502);
    }
    return json(request,{ok:true,service:SERVICE_NAME,apiVersion:API_VERSION,contract:'legion-tree-character-add-v1',databaseContract:DATABASE_CONTRACT,authContract:AUTH_CONTRACT,modeContract:MODE_CONTRACT,dedupeContract:DEDUPE_CONTRACT,queueContract:QUEUE_CONTRACT,workerContract:WORKER_CONTRACT,code:'ADD_QUEUE_ACCEPTED',message:'캐릭터 조회를 Server Worker에 인계했습니다.',mode:mode.mode,target,dedupe:{checked:true,duplicate:dedupeCode!=='NEW_CHARACTER',decision:dedupeCode,existingCharacterId:positiveInt(prepared.existingCharacterId)||existingCharacterId,listRow:null},queue,handoff:{accepted:true,workerId:text(workerData.workerId,240),contract:WORKER_CONTRACT,state:text(record(workerData.handoff).state,80)||'safe'},listAppendPending:true,execution:execution(true,true,true,'SERVER_WORKER')},202);
  }catch(error){
    const code=error instanceof Error?error.message:'LEGION_TREE_SERVER_ERROR';
    const organization=/ORGANIZATION_/.test(code);
    return json(request,{ok:false,code:code==='LEGION_TREE_SERVER_NOT_CONFIGURED'?code:(organization?code:'LEGION_TREE_SERVER_ERROR'),message:organization?'조직도 저장 후 Server 재확인을 완료하지 못했습니다. 새로고침 후 상태를 확인해 주세요.':'레기온 트리 캐릭터 추가 요청을 확인하는 중 오류가 발생했습니다.'},500);
  }
});
