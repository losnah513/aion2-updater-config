declare const Deno: any;
/*
 * KINOJO Supabase Edge Function: sanctuary-copy-render
 * Version: 20260831_01
 * Role: 성역 포스/팀 클립보드용 SVG를 서버에서 생성한다.
 * Rule: 기존 WEB v317과 신규 Server 팀 모두 같은 구 성역 카드 SVG 렌더러를 사용한다.
 */

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const CLASS_ICON_FILE: Record<string,string> = {
  "검성":"class_icon_gladiator.png",
  "수호성":"class_icon_templar.png",
  "살성":"class_icon_assassin.png",
  "궁성":"class_icon_ranger.png",
  "정령성":"class_icon_elementalist.png",
  "마도성":"class_icon_sorcerer.png",
  "치유성":"class_icon_cleric.png",
  "호법성":"class_icon_chanter.png",
  "권성":"class_icon_fighter.png"
};
const POWER_ICON_URL = "https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png";

const CARD_W = 342;
const CARD_H = 54;
const PARTY_W = 350;
const PARTY_GAP = 12;
const FORCE_W = 736;
const FORCE_HEADER_H = 62;
const PARTY_HEADER_H = 42;
const SLOT_GAP = 5;
const PARTY_BODY_PAD = 8;
const PARTY_H = PARTY_HEADER_H + PARTY_BODY_PAD * 2 + CARD_H * 5 + SLOT_GAP * 4;
const FORCE_H = FORCE_HEADER_H + 12 + PARTY_H + 12;

type Slot = {
  name?: string;
  characterName?: string;
  className?: string;
  classLabel?: string;
  power?: number;
  profileImageUrl?: string;
  profile_url?: string;
  vacancyText?: string;
  mainCharacterName?: string;
  owner?: string;
  isMain?: boolean;
  isRandomAlt?: boolean;
};
type Party = { partyNo?: number; filled?: number; capacity?: number; slots?: Slot[] };
type Force = {
  forceNo?: number;
  teamNo?: number;
  forceId?: string;
  teamId?: string;
  forceName?: string;
  teamName?: string;
  leaderCharacter?: string;
  averagePower?: number;
  characterCount?: number;
  partyCount?: number;
  parties?: Party[];
};
type TeamGroup = {
  teamGroupNo?: number;
  teamGroupName?: string;
  operatingTeamName?: string;
  leaderCharacter?: string;
  forces?: Force[];
};
type SanctuaryData = { ok?: boolean; message?: string; info?: Record<string, unknown>; teams?: Force[]; teamGroups?: TeamGroup[] };

function json(body: unknown, status = 200){
  return new Response(JSON.stringify(body), { status, headers:{ ...CORS_HEADERS, "content-type":"application/json; charset=utf-8" } });
}
function safeText(value: unknown){ return String(value ?? "").replace(/\s+/g," ").trim(); }
function xml(value: unknown){ return safeText(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;"); }
function fmt(value: unknown){ const n=Number(value || 0); return Number.isFinite(n) ? Math.round(n).toLocaleString("ko-KR") : "0"; }
function fmtShort(value: unknown){
  const n=Number(value || 0);
  if(!Number.isFinite(n) || n <= 0) return "-";
  if(n >= 1_000_000) return `${(n/1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/,"")}M`;
  if(n >= 1_000) return `${(n/1_000).toFixed(1).replace(/\.0$/,"")}K`;
  return Math.round(n).toLocaleString("ko-KR");
}
function slotName(slot: Slot){ return safeText(slot.name || slot.characterName); }
function slotProfileUrl(slot: Slot){ return safeText(slot.profileImageUrl || slot.profile_url); }
function forceNo(force: Force){ return Number(force.forceNo ?? force.teamNo ?? 0); }
function forceName(force: Force){ return safeText(force.forceName || force.teamName || `${forceNo(force)}포스`); }
function forceId(force: Force){ return safeText(force.forceId || force.teamId); }
function filledCount(force: Force){ return normalizeParties(force).reduce((sum,p)=>sum+(p.slots||[]).filter(slotName).length,0); }

function classIconUrl(className: string, req: Request){
  const file=CLASS_ICON_FILE[safeText(className)];
  if(!file) return "";
  const originHeader=safeText(req.headers.get("origin"));
  const refererHeader=safeText(req.headers.get("referer"));
  let base="https://kinojo.info";
  if(/^https?:\/\//i.test(originHeader)) base=originHeader.replace(/\/$/,"");
  else if(/^https?:\/\//i.test(refererHeader)) {
    try{ base=new URL(refererHeader).origin; }catch(_err){}
  }
  return `${base}/assets/images/classes/${file}`;
}
function toBase64(bytes: Uint8Array){
  let binary="";
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
function getSupabaseContext(req: Request){
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||req.headers.get("apikey")||"";
  if(!supabaseUrl||!serviceKey) throw new Error("Supabase URL/KEY가 Edge Function 환경변수에 없습니다.");
  return {supabaseUrl:supabaseUrl.replace(/\/$/,""),serviceKey};
}
async function resolveSanctuaryId(requestedId: string, req: Request){
  const sanitized=safeText(requestedId).toLowerCase();
  if(sanitized) return sanitized;
  const {supabaseUrl,serviceKey}=getSupabaseContext(req);
  const endpoint=`${supabaseUrl}/rest/v1/sanctuary_master?select=code&enabled=eq.true&order=display_order.asc,id.asc&limit=1`;
  const res=await fetch(endpoint,{headers:{apikey:serviceKey,authorization:`Bearer ${serviceKey}`}});
  if(!res.ok) throw new Error(`sanctuary_master HTTP ${res.status} / ${(await res.text()).slice(0,180)}`);
  const rows=await res.json();
  const code=safeText(Array.isArray(rows)?rows[0]?.code:"").toLowerCase();
  if(!code) throw new Error("활성화된 sanctuary_master가 없습니다.");
  return code;
}
async function getSanctuaryData(sanctuaryId: string, req: Request): Promise<SanctuaryData>{
  const {supabaseUrl,serviceKey}=getSupabaseContext(req);
  const endpoint=`${supabaseUrl}/rest/v1/rpc/kinojo_web_get_sanctuary_v317`;
  const res=await fetch(endpoint,{
    method:"POST",
    headers:{"content-type":"application/json",apikey:serviceKey,authorization:`Bearer ${serviceKey}`},
    body:JSON.stringify({p_sanctuary_code:sanctuaryId,p_pass_key:null})
  });
  if(!res.ok) throw new Error(`kinojo_web_get_sanctuary_v317 HTTP ${res.status} / ${(await res.text()).slice(0,220)}`);
  const data=await res.json();
  if(!data||data.ok===false) throw new Error(safeText(data?.message)||"성역 데이터를 불러오지 못했습니다.");
  return data;
}
function normalizeTeamGroups(data: SanctuaryData): TeamGroup[]{
  if(Array.isArray(data.teamGroups)&&data.teamGroups.length) return data.teamGroups.map((g,index)=>({
    ...g,
    teamGroupNo:Number(g.teamGroupNo||index+1),
    teamGroupName:safeText(g.teamGroupName||g.operatingTeamName||`${index+1}팀`),
    leaderCharacter:safeText(g.leaderCharacter||""),
    forces:Array.isArray(g.forces)?g.forces:[]
  }));
  const forces=Array.isArray(data.teams)?data.teams:[];
  return [{teamGroupNo:1,teamGroupName:"성역 운영 팀",forces}];
}
function normalizeParties(force: Force): Party[]{
  const map=new Map<number,Party>();
  (Array.isArray(force.parties)?force.parties:[]).forEach(p=>map.set(Number(p.partyNo||1),p));
  return [1,2].map(no=>{
    const source=map.get(no)||{partyNo:no,capacity:5,slots:[]};
    const slots=Array.isArray(source.slots)?source.slots.slice(0,5):[];
    while(slots.length<5) slots.push({name:"",vacancyText:"파티 인원 모집중"});
    return {...source,partyNo:no,capacity:5,filled:slots.filter(slotName).length,slots};
  });
}

function record(value: unknown): Record<string,unknown>{
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
function boundedInteger(value: unknown, min: number, max: number){
  const parsed=Number(value);
  return Number.isSafeInteger(parsed)&&parsed>=min&&parsed<=max?parsed:0;
}
function managementProfileUrl(value: unknown){
  const source=safeText(value);
  if(!source) return "";
  try{
    const parsed=new URL(source);
    return parsed.protocol==="https:"&&parsed.hostname==="profileimg.plaync.com"?parsed.toString():"";
  }catch(_err){ return ""; }
}
function managementSnapshotGroup(value: unknown): TeamGroup{
  const source=record(value);
  if(safeText(source.contract)!=="KINOJO_SANCTUARY_MANAGEMENT_COPY_V1") throw new Error("신규 성역 복사 snapshot 계약이 올바르지 않습니다.");
  const teamGroupNo=boundedInteger(source.teamId,1,Number.MAX_SAFE_INTEGER);
  const teamGroupName=safeText(source.title).slice(0,80);
  const sourceForces=Array.isArray(source.forces)?source.forces:[];
  if(!teamGroupNo||!teamGroupName||sourceForces.length<1||sourceForces.length>9) throw new Error("신규 성역 복사 팀 정보가 올바르지 않습니다.");

  const forces: Force[]=sourceForces.map((forceValue,index)=>{
    const forceSource=record(forceValue);
    const no=boundedInteger(forceSource.forceNo,1,9);
    const id=safeText(forceSource.forceId).slice(0,80);
    const sourceParties=Array.isArray(forceSource.parties)?forceSource.parties:[];
    if(no!==index+1||!id||sourceParties.length!==2) throw new Error("신규 성역 복사 포스 정보가 올바르지 않습니다.");
    const parties: Party[]=sourceParties.map((partyValue,partyIndex)=>{
      const partySource=record(partyValue);
      const partyNo=boundedInteger(partySource.partyNo,1,2);
      const sourceSlots=Array.isArray(partySource.slots)?partySource.slots:[];
      if(partyNo!==partyIndex+1||sourceSlots.length!==5) throw new Error("신규 성역 복사 파티 정보가 올바르지 않습니다.");
      const slots: Slot[]=sourceSlots.map((slotValue,slotIndex)=>{
        const slotSource=record(slotValue);
        const slotNo=boundedInteger(slotSource.slotNo,1,5);
        if(slotNo!==slotIndex+1) throw new Error("신규 성역 복사 슬롯 순서가 올바르지 않습니다.");
        if(slotSource.occupied!==true) return {name:"",vacancyText:"파티 인원 모집중"};
        const character=record(slotSource.character);
        const name=safeText(character.name).slice(0,16);
        const className=safeText(character.className).slice(0,40);
        const relation=safeText(character.relation).toUpperCase();
        const isRandomAlt=character.isRandomAlt===true||(!className&&relation==="ALT"&&name.endsWith("랜덤 부캐"));
        if(!name||(!isRandomAlt&&!className)||!["MAIN","ALT","GUEST"].includes(relation)) throw new Error("신규 성역 복사 캐릭터 정보가 올바르지 않습니다.");
        return {
          name,
          className:isRandomAlt?"랜덤 부캐":className,
          power:boundedInteger(character.power,0,2_000_000_000),
          profileImageUrl:managementProfileUrl(character.profileImageUrl),
          mainCharacterName:safeText(character.mainCharacterName).slice(0,16),
          isMain:relation==="MAIN",
          isRandomAlt
        };
      });
      return {partyNo,capacity:5,filled:slots.filter(slotName).length,slots};
    });
    const occupiedSlots=parties.flatMap(party=>party.slots||[]).filter(slotName);
    const powers=occupiedSlots.map(slot=>Number(slot.power||0)).filter(power=>power>0);
    return {
      forceNo:no,
      forceId:id,
      forceName:`${no}포스`,
      averagePower:powers.length?Math.round(powers.reduce((sum,power)=>sum+power,0)/powers.length):0,
      characterCount:occupiedSlots.length,
      partyCount:2,
      parties
    };
  });
  return {teamGroupNo,teamGroupName,forces};
}
async function fetchImageDataUrl(url: string){
  const src=safeText(url).replace(/&amp;/g,"&");
  if(!/^https?:\/\//i.test(src)) return "";
  try{
    const res=await fetch(src,{headers:{"user-agent":"KINOJO/1.4 sanctuary-copy-render"}});
    if(!res.ok) return "";
    const bytes=new Uint8Array(await res.arrayBuffer());
    if(!bytes.length||bytes.length>3_000_000) return "";
    const ct=(res.headers.get("content-type")||"image/png").split(";")[0];
    return `data:${ct};base64,${toBase64(bytes)}`;
  }catch(_err){ return ""; }
}
async function assetMap(forces: Force[], req: Request){
  const profileUrls=[...new Set(forces.flatMap(force=>normalizeParties(force).flatMap(party=>(party.slots||[]).map(slotProfileUrl))).filter(Boolean))];
  const classUrls=[...new Set(forces.flatMap(force=>normalizeParties(force).flatMap(party=>(party.slots||[]).map(slot=>classIconUrl(safeText(slot.className||slot.classLabel), req)))).filter(Boolean))];
  const urls=[...new Set([...profileUrls, ...classUrls, POWER_ICON_URL])];
  const map=new Map<string,string>();
  await Promise.all(urls.map(async url=>map.set(url,await fetchImageDataUrl(url))));
  return map;
}

function badgeSvg(label: string, x: number, y: number, main: boolean){
  const fill=main?"#fff7e8":"#eef4ff";
  const stroke=main?"#e7c78f":"#bfd3f0";
  const text=main?"#9a6700":"#3865b0";
  return `<g transform="translate(${x} ${y})"><rect width="34" height="16" rx="8" fill="${fill}" stroke="${stroke}"/><text x="17" y="11.4" text-anchor="middle" font-size="9" font-weight="900" fill="${text}">${xml(label)}</text></g>`;
}

function slotSvg(slot: Slot, x: number, y: number, map: Map<string,string>, req: Request){
  const name=slotName(slot);
  if(!name){
    return `<g transform="translate(${x} ${y})">
      <rect width="${CARD_W}" height="${CARD_H}" rx="8" fill="#fbfdff" stroke="#cfd9e8" stroke-dasharray="5 4"/>
      <rect x="8" y="13" width="28" height="28" rx="9" fill="#edf3fb" stroke="#d5dfed"/>
      <text x="22" y="32" text-anchor="middle" font-size="16" font-weight="900" fill="#6e8bb2">+</text>
      <text x="44" y="24" font-size="13" font-weight="900" fill="#718096">+ ${xml(safeText(slot.vacancyText||'파티 인원 모집중'))}</text>
      <text x="44" y="42" font-size="9.5" font-weight="700" fill="#8794a8">대기자 명단에서 추가 가능</text>
    </g>`;
  }

  const cls=safeText(slot.className||slot.classLabel||"직업 미확인");
  const owner=safeText(slot.mainCharacterName||slot.owner||"");
  const isMain=slot.isMain===true || (!!owner && owner===name);
  const isSub=!isMain && !!owner;
  const image=map.get(slotProfileUrl(slot))||"";
  const iconImage=map.get(classIconUrl(cls, req))||"";
  const powerIcon=map.get(POWER_ICON_URL)||"";
  const cardFill=isMain?"#fffaf0":"#ffffff";
  const cardStroke=isMain?"#d9bd84":"#dce5f2";
  const fadeId=isMain?"profileFadeMain":"profileFade";
  const stageX=220;
  const stageW=CARD_W-stageX;
  const nameWidth=Math.max(1,Math.min(15,name.length));
  const badgeX=Math.min(stageX-40,48+nameWidth*11+5);

  return `<g transform="translate(${x} ${y})">
    <rect width="${CARD_W}" height="${CARD_H}" rx="8" fill="${cardFill}" stroke="${cardStroke}"/>
    ${isMain?`<rect x="0" y="0" width="3" height="${CARD_H}" rx="2" fill="#c58b24"/>`:''}
    <g transform="translate(8 10)">
      ${iconImage?`<image href="${iconImage}" x="0" y="0" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>`:`<circle cx="17" cy="17" r="16" fill="#eef4ff"/><text x="17" y="22" text-anchor="middle" font-size="14" font-weight="900" fill="#3865b0">${slot.isRandomAlt?'R':xml(cls.slice(0,1)||'?')}</text>`}
    </g>
    <text x="48" y="22" font-size="13" font-weight="900" fill="#1f2f46">${xml(name)}</text>
    ${isMain?badgeSvg('본캐',badgeX,10,true):(isSub?badgeSvg('부캐',badgeX,10,false):'')}
    ${powerIcon?`<image href="${powerIcon}" x="48" y="31" width="14" height="14" preserveAspectRatio="xMidYMid meet"/>`:`<circle cx="55" cy="38" r="5" fill="#4c75b8"/>`}
    <text x="66" y="42" font-size="10.5" font-weight="900" fill="#667085">${xml(fmtShort(slot.power))}</text>
    <rect x="${stageX}" y="0" width="${stageW}" height="${CARD_H}" rx="0 8 8 0" fill="#edf3fb"/>
    ${image?`<image href="${image}" x="${stageX}" y="0" width="${stageW}" height="${CARD_H}" preserveAspectRatio="xMaxYMid meet"/>`:''}
    <rect x="${stageX}" y="0" width="58" height="${CARD_H}" fill="url(#${fadeId})"/>
  </g>`;
}

function partySvg(party: Party, x: number, y: number, map: Map<string,string>, req: Request){
  const slots=(party.slots||[]).slice(0,5);
  let body="";
  slots.forEach((slot,index)=>{ body+=slotSvg(slot,x+4,y+PARTY_HEADER_H+PARTY_BODY_PAD+index*(CARD_H+SLOT_GAP),map,req); });
  return `<g>
    <rect x="${x}" y="${y}" width="${PARTY_W}" height="${PARTY_H}" rx="14" fill="#f8fbff" stroke="#dbe5f2"/>
    <text x="${x+16}" y="${y+27}" font-size="16" font-weight="900" fill="#1f2f46">${xml(`${party.partyNo||1}파티`)}</text>
    <text x="${x+PARTY_W-16}" y="${y+27}" text-anchor="end" font-size="11" font-weight="800" fill="#667085">${Number(party.filled||0)} / ${Number(party.capacity||5)}</text>
    <line x1="${x}" y1="${y+PARTY_HEADER_H}" x2="${x+PARTY_W}" y2="${y+PARTY_HEADER_H}" stroke="#e3eaf4"/>
    ${body}
  </g>`;
}

function forceSvg(force: Force, x: number, y: number, map: Map<string,string>, req: Request){
  const parties=normalizeParties(force);
  const filled=Number(force.characterCount||filledCount(force));
  const meta=`${filled} / 10 · ${Number(force.partyCount||2)}파티 · 평균 ${fmt(force.averagePower)}`;
  const bodyY=y+FORCE_HEADER_H+12;
  return `<g>
    <rect x="${x}" y="${y}" width="${FORCE_W}" height="${FORCE_H}" rx="16" fill="#ffffff" stroke="#d9e2f0" stroke-width="1.5"/>
    <text x="${x+18}" y="${y+28}" font-size="20" font-weight="900" fill="#1f2f46">${xml(forceName(force))}</text>
    <text x="${x+18}" y="${y+49}" font-size="10.5" font-weight="800" fill="#667085">${xml(meta)}</text>
    <line x1="${x}" y1="${y+FORCE_HEADER_H}" x2="${x+FORCE_W}" y2="${y+FORCE_HEADER_H}" stroke="#e4ebf4"/>
    ${partySvg(parties[0],x+12,bodyY,map,req)}
    ${partySvg(parties[1],x+12+PARTY_W+PARTY_GAP,bodyY,map,req)}
  </g>`;
}

async function renderForceSvg(force: Force, req: Request){
  const map=await assetMap([force],req);
  const width=FORCE_W+24;
  const height=FORCE_H+24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="profileFade" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity="1"/><stop offset="42%" stop-color="#ffffff" stop-opacity=".80"/><stop offset="78%" stop-color="#ffffff" stop-opacity=".26"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <linearGradient id="profileFadeMain" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#fffaf0" stop-opacity="1"/><stop offset="42%" stop-color="#fffaf0" stop-opacity=".82"/><stop offset="78%" stop-color="#fffaf0" stop-opacity=".28"/><stop offset="100%" stop-color="#fffaf0" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#ffffff"/>
    <style>text{font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif}</style>
    ${forceSvg(force,12,12,map,req)}
  </svg>`;
}

async function renderTeamSvg(group: TeamGroup, forces: Force[], req: Request){
  const map=await assetMap(forces,req);
  const groupHeader=58;
  const gap=14;
  const width=FORCE_W+24;
  const height=groupHeader+12+forces.length*FORCE_H+Math.max(0,forces.length-1)*gap+12;
  const cards=forces.map((force,index)=>forceSvg(force,12,groupHeader+12+index*(FORCE_H+gap),map,req)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="profileFade" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity="1"/><stop offset="42%" stop-color="#ffffff" stop-opacity=".80"/><stop offset="78%" stop-color="#ffffff" stop-opacity=".26"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <linearGradient id="profileFadeMain" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#fffaf0" stop-opacity="1"/><stop offset="42%" stop-color="#fffaf0" stop-opacity=".82"/><stop offset="78%" stop-color="#fffaf0" stop-opacity=".28"/><stop offset="100%" stop-color="#fffaf0" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#ffffff"/>
    <style>text{font-family:"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif}</style>
    <text x="14" y="31" font-size="22" font-weight="900" fill="#1f2f46">${xml(group.teamGroupName||group.operatingTeamName||'운영 팀')}</text>
    <text x="14" y="49" font-size="10.5" font-weight="800" fill="#667085">${xml(`${forces.length}개 포스`)}</text>
    ${cards}
  </svg>`;
}

function findRequestedForce(groups: TeamGroup[], body: Record<string,unknown>){
  const requestedGroupNo=Number(body.teamGroupNo||body.team_group_no||0)||0;
  const requestedForceId=safeText(body.forceId||body.force_id);
  const requestedForceName=safeText(body.forceName||body.force_name);
  const requestedTeamNo=Number(body.teamNo||body.team_no||0)||0;
  const requestedForceNo=Number(body.forceNo||body.force_no||0)||0;

  const group=requestedGroupNo>0?groups.find(g=>Number(g.teamGroupNo||0)===requestedGroupNo):undefined;
  const candidates=group?(group.forces||[]):groups.flatMap(g=>g.forces||[]);
  let force: Force|undefined;
  if(requestedForceId) force=candidates.find(item=>forceId(item)===requestedForceId);
  if(!force&&requestedTeamNo>0) force=candidates.find(item=>Number(item.teamNo||0)===requestedTeamNo);
  if(!force&&requestedForceNo>0) force=candidates.find(item=>forceNo(item)===requestedForceNo);
  if(!force&&requestedForceName) force=candidates.find(item=>forceName(item)===requestedForceName);
  return {group,force,requestedGroupNo,requestedForceId,requestedTeamNo,requestedForceNo,requestedForceName};
}

Deno.serve(async(req: Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS_HEADERS});
  if(req.method!=="POST") return json({ok:false,message:"POST only"},405);
  try{
    const contentLength=Number(req.headers.get("content-length")||0);
    if(contentLength>1_000_000) return json({ok:false,message:"복사 요청이 너무 큽니다."},413);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const scope=safeText(body.scope||"force");
    const managementSnapshot=body.managementSnapshot||body.management_snapshot;
    const groups=managementSnapshot
      ? [managementSnapshotGroup(managementSnapshot)]
      : normalizeTeamGroups(await getSanctuaryData(await resolveSanctuaryId(safeText(body.sanctuaryId||body.sanctuary_id),req),req));
    let svg="";
    let filename="kinojo-sanctuary.png";

    if(scope==="team"){
      const teamGroupNo=Number(body.teamGroupNo||body.team_group_no||0)||0;
      const group=teamGroupNo>0?groups.find(g=>Number(g.teamGroupNo||0)===teamGroupNo):undefined;
      if(!group) return json({ok:false,message:"요청한 운영 팀을 찾지 못했습니다.",teamGroupNo},404);
      const forces=(group.forces||[]).slice().sort((a,b)=>forceNo(a)-forceNo(b));
      if(!forces.length) return json({ok:false,message:"복사할 포스 데이터가 없습니다.",teamGroupNo},404);
      svg=await renderTeamSvg(group,forces,req);
      filename=safeText(body.filename||`kinojo-team-${teamGroupNo}.png`);
    }else{
      const found=findRequestedForce(groups,body);
      if(!found.force){
        return json({ok:false,message:"요청한 포스를 찾지 못했습니다.",teamGroupNo:found.requestedGroupNo,forceId:found.requestedForceId,teamNo:found.requestedTeamNo,forceNo:found.requestedForceNo,forceName:found.requestedForceName},404);
      }
      svg=await renderForceSvg(found.force,req);
      filename=safeText(body.filename||`kinojo-force-${forceId(found.force)||forceNo(found.force)}.png`);
    }

    const safeFilename=(filename.replace(/[\\/:*?"<>|]+/g,"_")||"kinojo-sanctuary.png").replace(/\.png$/i,".svg");
    // Header values must be ByteString. Keep the rendered SVG text untouched,
    // but expose an ASCII-only fallback filename so Korean team names cannot
    // make an otherwise valid legacy image response fail at the last step.
    const headerFilename=safeFilename.replace(/[^\x20-\x7e]+/g,"").replace(/^-+|-+$/g,"")||"kinojo-sanctuary.svg";
    return new Response(svg,{status:200,headers:{...CORS_HEADERS,"content-type":"image/svg+xml; charset=utf-8","cache-control":"no-store","x-kinojo-renderer":"sanctuary-web-layout-svg-v2","x-kinojo-filename":headerFilename}});
  }catch(err){
    console.error("KINOJO sanctuary-copy-render failed",err);
    return json({ok:false,message:String((err as Error)?.message||err),renderer:"sanctuary-web-layout-svg-v2",version:"20260831_01"},500);
  }
});
