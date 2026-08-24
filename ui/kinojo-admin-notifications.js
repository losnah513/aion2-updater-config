/* KINOJO administrator request notification bridge v20260824.01 */
(function(){
  'use strict';
  if(window.__KINOJO_ADMIN_NOTIFICATION_BRIDGE__) return;
  window.__KINOJO_ADMIN_NOTIFICATION_BRIDGE__=true;

  const SEEN_KEY='kinojo_admin_notification_seen_v392';
  const LEGACY_SUPPORT_SEEN_KEY='kinojo_support_notice_seen_v316';
  const queue=[];
  const queuedKeys=new Set();
  let active=false;
  let lastSummaryAt=0;

  function esc(value){
    return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function normalizedPath(){ return String(location.pathname||'/').replace(/\\/g,'/').replace(/\/{2,}/g,'/'); }
  function isMobile(){ return /(^|\/)m(\/|$)/.test(normalizedPath()); }
  function isAdminPage(){
    const path=normalizedPath().replace(/\/+$/,'')||'/';
    return path==='/admin'||path.startsWith('/admin/')||path==='/m/admin'||path.startsWith('/m/admin/');
  }
  function adminHref(hash){ return (isMobile()?'/m/admin/':'/admin/')+String(hash||''); }

  function readSeen(){
    try{
      const rows=JSON.parse(sessionStorage.getItem(SEEN_KEY)||'[]');
      return new Set(Array.isArray(rows)?rows.map(String).filter(Boolean):[]);
    }catch(_err){ return new Set(); }
  }
  function markSeen(key){
    const eventKey=String(key||'');if(!eventKey)return;
    const seen=readSeen();seen.add(eventKey);
    try{sessionStorage.setItem(SEEN_KEY,JSON.stringify(Array.from(seen).slice(-120)));}catch(_err){}
  }

  function ensureStyles(){
    if(document.getElementById('kinojoAdminNotificationStyles'))return;
    const style=document.createElement('style');
    style.id='kinojoAdminNotificationStyles';
    style.textContent=''
      +'.kinojo-admin-notification-host{position:fixed;z-index:2147483001;right:16px;bottom:calc(var(--kinojo-safe-bottom,0px) + 76px);pointer-events:none}'
      +'.kinojo-admin-notification-card,.kinojo-admin-notification-link-hint{--kinojo-admin-notification-accent:#3b82f6;--kinojo-admin-notification-accent-soft:rgba(59,130,246,.22);--kinojo-admin-notification-focus:rgba(59,130,246,.34)}'
      +'.kinojo-admin-notification-card.tone-code,.kinojo-admin-notification-link-hint.tone-code{--kinojo-admin-notification-accent:#3b82f6;--kinojo-admin-notification-accent-soft:rgba(59,130,246,.23);--kinojo-admin-notification-focus:rgba(56,189,248,.38)}'
      +'.kinojo-admin-notification-card.tone-support,.kinojo-admin-notification-link-hint.tone-support{--kinojo-admin-notification-accent:#ef4444;--kinojo-admin-notification-accent-soft:rgba(239,68,68,.22);--kinojo-admin-notification-focus:rgba(251,113,133,.36)}'
      +'.kinojo-admin-notification-card.tone-reference,.kinojo-admin-notification-link-hint.tone-reference{--kinojo-admin-notification-accent:#10b981;--kinojo-admin-notification-accent-soft:rgba(16,185,129,.22);--kinojo-admin-notification-focus:rgba(52,211,153,.36)}'
      +'.kinojo-admin-notification-card{position:relative;box-sizing:border-box;width:min(460px,calc(100vw - 28px));aspect-ratio:2/1;display:grid;grid-template-rows:1fr 2fr;overflow:hidden;border:1px solid #dbe4ef;border-radius:14px;background:#fff;color:#172033;text-align:left;box-shadow:0 18px 50px rgba(15,23,42,.2);opacity:0;transform:translateY(36px);transition:opacity .24s ease,transform .24s ease,border-color .18s ease,box-shadow .18s ease,filter .12s ease;pointer-events:auto;cursor:pointer;outline:none}'
      +'.kinojo-admin-notification-card.show{opacity:1;transform:translateY(0)}'
      +'.kinojo-admin-notification-card:focus-visible{border-color:var(--kinojo-admin-notification-accent);box-shadow:0 0 0 3px var(--kinojo-admin-notification-focus),0 18px 50px rgba(15,23,42,.22)}'
      +'.kinojo-admin-notification-card:hover{border-color:var(--kinojo-admin-notification-accent);box-shadow:0 0 0 1px var(--kinojo-admin-notification-accent-soft),0 0 24px var(--kinojo-admin-notification-accent-soft),0 22px 58px rgba(15,23,42,.24)}'
      +'.kinojo-admin-notification-card.is-pressing{border-color:var(--kinojo-admin-notification-accent);box-shadow:0 0 0 1px var(--kinojo-admin-notification-accent-soft),0 9px 24px rgba(15,23,42,.22);transform:translateY(2px) scale(.976);filter:brightness(.96);transition-duration:.08s}'
      +'.kinojo-admin-notification-link-hint{position:absolute;right:0;bottom:calc(100% + 8px);display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid var(--kinojo-admin-notification-focus);border-radius:9px;background:rgba(15,23,42,.95);color:rgba(255,255,255,.96);font-size:12px;line-height:1;font-weight:900;letter-spacing:-.01em;box-shadow:0 10px 28px rgba(15,23,42,.24);opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;white-space:nowrap}'
      +'.kinojo-admin-notification-link-hint-arrow{color:var(--kinojo-admin-notification-accent);font-size:16px;line-height:1;font-weight:1000}'
      +'.kinojo-admin-notification-card:hover + .kinojo-admin-notification-link-hint,.kinojo-admin-notification-card:focus-visible + .kinojo-admin-notification-link-hint{opacity:1;transform:translateY(0)}'
      +'.kinojo-admin-notification-head{min-height:0;display:flex;align-items:center;padding:16px 54px 14px 22px;border-bottom:1px solid rgba(255,255,255,.2)}'
      +'.kinojo-admin-notification-card.tone-code .kinojo-admin-notification-head{background:linear-gradient(135deg,#38bdf8 0%,#3b82f6 100%)}'
      +'.kinojo-admin-notification-card.tone-support .kinojo-admin-notification-head{background:linear-gradient(135deg,#fb7185 0%,#ef4444 100%)}'
      +'.kinojo-admin-notification-card.tone-reference .kinojo-admin-notification-head{background:linear-gradient(135deg,#34d399 0%,#10b981 100%)}'
      +'.kinojo-admin-notification-title{margin:0;color:#fff;font-size:20px;line-height:1.2;font-weight:1000;letter-spacing:-.02em}'
      +'.kinojo-admin-notification-close{position:absolute;top:14px;right:14px;width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.46);border-radius:999px;background:rgba(15,23,42,.14);color:#fff;font:900 20px/1 system-ui,sans-serif;cursor:pointer}'
      +'.kinojo-admin-notification-close:hover,.kinojo-admin-notification-close:focus-visible{background:rgba(15,23,42,.24);outline:2px solid rgba(255,255,255,.72);outline-offset:1px}'
      +'.kinojo-admin-notification-body{min-height:0;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:17px 22px 18px;background:#fff}'
      +'.kinojo-admin-notification-message{margin:0;color:#334155;font-size:15px;line-height:1.55;font-weight:760;word-break:keep-all;overflow-wrap:anywhere}'
      +'.kinojo-admin-notification-accent{color:var(--kinojo-admin-notification-accent);font-weight:1000}'
      +'.kinojo-admin-notification-more{margin-top:auto;color:#64748b;font-size:11px;line-height:1.3;font-weight:900}'
      +'.kinojo-admin-notification-card.is-leaving{opacity:0;transform:translateY(16px)}'
      +'@media(max-width:720px){.kinojo-admin-notification-host{left:12px;right:12px;bottom:calc(var(--kinojo-safe-bottom,0px) + 70px)}.kinojo-admin-notification-card{width:min(460px,100%);margin-left:auto}.kinojo-admin-notification-head{padding:14px 50px 12px 18px}.kinojo-admin-notification-title{font-size:18px}.kinojo-admin-notification-body{padding:14px 18px 16px}.kinojo-admin-notification-message{font-size:13px}}'
      +'@media(hover:none){.kinojo-admin-notification-link-hint{display:none}}'
      +'@media(prefers-reduced-motion:reduce){.kinojo-admin-notification-card,.kinojo-admin-notification-link-hint{transition:none}.kinojo-admin-notification-card.is-pressing{transform:none;filter:none}}';
    document.head.appendChild(style);
  }

  function normalize(summary){
    const rows=[];
    const code=summary?.latestCodeRequest;
    if(code&&(code.requestId||code.id)){
      const name=String(code.characterName||'캐릭터').trim()||'캐릭터';
      rows.push({
        eventKey:'CODE_REQUEST:'+String(code.requestId||code.id),tone:'code',title:'코드 요청',characterName:name,
        message:'['+name+']님이 코드 발급을 요청하였습니다.',moreCount:Math.max(0,Number(summary?.codeRequestCount||0)-1),
        href:adminHref('#requests'),createdAt:String(code.createdAt||'')
      });
    }
    const support=summary?.latestSupportRequest;
    if(support?.id){
      const name=String(support.characterName||'캐릭터').trim()||'캐릭터';
      const target=[support.teamNo?String(support.teamNo)+'팀':'',support.partyNo?String(support.partyNo)+'파티':'',support.slotNo?String(support.slotNo)+'번 슬롯':''].filter(Boolean).join(' · ');
      rows.push({
        eventKey:'FORCE_REQUEST:'+String(support.id),tone:'support',title:'포스 지원',characterName:name,
        message:'['+name+']님이 '+(target?target+'에 ':'')+'포스 지원 요청하였습니다.',moreCount:Math.max(0,Number(summary?.supportRequestCount||0)-1),
        href:adminHref('#sanctuary/requests'),createdAt:String(support.createdAt||'')
      });
    }
    const hasUnifiedImageQueue=Object.prototype.hasOwnProperty.call(summary||{},'memberImagePendingCount');
    const reference=hasUnifiedImageQueue?summary?.latestCharacterImageUpload:summary?.latestReferenceUpload;
    if(reference?.characterId&&reference?.uploadedAt){
      const name=String(reference.characterName||reference.memberMainCharacterName||'캐릭터').trim()||'캐릭터';
      rows.push({
        eventKey:'CHARACTER_IMAGE:'+String(reference.memberId||'')+':'+String(reference.characterId)+':'+String(reference.slot||'')+':'+String(reference.uploadedAt),tone:'reference',title:'캐릭터 이미지 업로드',characterName:name,
        message:'['+name+']님이 캐릭터 이미지를 업로드하였습니다.',moreCount:Math.max(0,Number(summary?.memberImagePendingCount||0)-1),
        href:adminHref('#members/character-images'),createdAt:String(reference.uploadedAt||'')
      });
    }
    return rows.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
  }

  function clearRenderer(){
    queue.length=0;queuedKeys.clear();active=false;
    document.getElementById('kinojoAdminNotificationHost')?.remove();
  }

  function finish(card){
    if(card?.isConnected){card.classList.add('is-leaving');setTimeout(()=>card.remove(),240);}
    active=false;
    setTimeout(showNext,260);
  }

  function showNext(){
    if(isAdminPage()){clearRenderer();return;}
    if(active||!queue.length)return;
    const item=queue.shift();queuedKeys.delete(item.eventKey);active=true;markSeen(item.eventKey);ensureStyles();
    let host=document.getElementById('kinojoAdminNotificationHost');
    if(!host){host=document.createElement('div');host.id='kinojoAdminNotificationHost';host.className='kinojo-admin-notification-host';document.body.appendChild(host);}
    host.replaceChildren();
    const toneClass='tone-'+String(item.tone||'code');
    const card=document.createElement('article');
    card.className='kinojo-admin-notification-card '+toneClass;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',item.title+' · '+item.message+' · 관리자 페이지 이동');
    const nameToken='['+item.characterName+']';
    const messageRest=String(item.message||'').startsWith(nameToken)?String(item.message||'').slice(nameToken.length):String(item.message||'');
    card.innerHTML='<header class="kinojo-admin-notification-head"><h2 class="kinojo-admin-notification-title">'+esc(item.title)+'</h2></header>'
      +'<button class="kinojo-admin-notification-close" type="button" aria-label="알림 닫기">×</button>'
      +'<div class="kinojo-admin-notification-body"><p class="kinojo-admin-notification-message"><strong class="kinojo-admin-notification-accent">'+esc(nameToken)+'</strong>'+esc(messageRest)+'</p>'
      +(item.moreCount>0?'<span class="kinojo-admin-notification-more">외 '+esc(item.moreCount)+'건</span>':'')+'</div>';
    const open=()=>{
      if(!item.href||card.dataset.navigating==='1')return;
      card.dataset.navigating='1';card.classList.add('is-pressing');
      setTimeout(()=>{location.href=item.href;},110);
    };
    card.addEventListener('click',event=>{if(event.target.closest('.kinojo-admin-notification-close'))return;open();});
    card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.kinojo-admin-notification-close')){event.preventDefault();open();}});
    card.querySelector('.kinojo-admin-notification-close')?.addEventListener('click',event=>{event.stopPropagation();finish(card);});
    const hint=document.createElement('div');hint.className='kinojo-admin-notification-link-hint '+toneClass;hint.setAttribute('aria-hidden','true');
    hint.innerHTML='관리자 페이지 이동 <span class="kinojo-admin-notification-link-hint-arrow">→</span>';
    host.appendChild(card);host.appendChild(hint);requestAnimationFrame(()=>card.classList.add('show'));
  }

  function enqueue(summary){
    if(!summary||summary.ok!==true||isAdminPage())return;
    const seen=readSeen();
    normalize(summary).forEach(item=>{
      if(seen.has(item.eventKey)||queuedKeys.has(item.eventKey))return;
      queuedKeys.add(item.eventKey);queue.push(item);
    });
    showNext();
  }

  function suppressLegacySupport(summary){
    const id=summary?.latestSupportRequest?.id;
    if(id){try{sessionStorage.setItem(LEGACY_SUPPORT_SEEN_KEY,String(id));}catch(_err){}}
    document.querySelectorAll('.kinojo-request-toast').forEach(node=>node.remove());
  }

  function syncBadge(summary){
    const badge=document.getElementById('kinojoAdminPendingBadge');if(!badge)return;
    const total=Math.max(0,Number(summary?.totalCount||0));
    badge.textContent=total>99?'99+':String(total);badge.hidden=total<1;
  }

  function handleSummary(summary){
    lastSummaryAt=Date.now();
    suppressLegacySupport(summary);
    syncBadge(summary);
    if(isAdminPage()){clearRenderer();return;}
    enqueue(summary);
  }

  function installApiHook(){
    const api=window.KinojoApi;
    if(!api||typeof api.getAction!=='function')return false;
    if(api.getAction.__kinojoAdminNotificationWrapped)return true;
    const original=api.getAction.bind(api);
    const wrapped=async function(name,extra){
      const result=await original(name,extra);
      if(name==='notificationSummary')handleSummary(result);
      return result;
    };
    wrapped.__kinojoAdminNotificationWrapped=true;
    wrapped.__kinojoAdminNotificationOriginal=original;
    api.getAction=wrapped;
    return true;
  }

  async function fallbackSummary(){
    if(document.visibilityState==='hidden'||Date.now()-lastSummaryAt<35000)return;
    const api=window.KinojoApi;if(!api||typeof api.getAction!=='function')return;
    try{await api.getAction('notificationSummary',{});}catch(_err){}
  }

  function boot(){
    ensureStyles();
    if(isAdminPage())clearRenderer();
    const wait=setInterval(()=>{if(installApiHook()){clearInterval(wait);setTimeout(fallbackSummary,650);}},40);
    setTimeout(()=>clearInterval(wait),5000);
    setInterval(fallbackSummary,30000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(fallbackSummary,80);});
    window.addEventListener('kinojo:auth-changed',()=>setTimeout(fallbackSummary,100));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
