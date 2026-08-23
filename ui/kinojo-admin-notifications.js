/* KINOJO administrator request notification bridge v20260823.02 */
(function(){
  'use strict';
  if(window.__KINOJO_ADMIN_NOTIFICATION_BRIDGE__) return;
  window.__KINOJO_ADMIN_NOTIFICATION_BRIDGE__=true;

  const SEEN_KEY='kinojo_admin_notification_seen_v389';
  const LEGACY_SUPPORT_SEEN_KEY='kinojo_support_notice_seen_v316';
  const queue=[];
  const queuedKeys=new Set();
  let active=false;
  let hideTimer=0;
  let lastSummaryAt=0;

  function esc(value){
    return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function isMobile(){ return /(^|\/)m(\/|$)/.test(location.pathname.replace(/\\/g,'/')); }
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
      +'.kinojo-admin-notification-card{position:relative;box-sizing:border-box;width:min(360px,calc(100vw - 28px));aspect-ratio:4/3;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid rgba(255,255,255,.19);border-radius:16px;background:radial-gradient(circle at 84% 13%,rgba(82,137,227,.28),transparent 34%),linear-gradient(145deg,#08182f 0%,#123b6d 55%,#1d2d62 100%);color:#fff;text-align:left;box-shadow:0 20px 56px rgba(4,15,35,.4);opacity:0;transform:translateY(22px) scale(.985);transition:opacity .24s ease,transform .24s ease;pointer-events:auto;cursor:pointer;outline:none}'
      +'.kinojo-admin-notification-card.show{opacity:1;transform:translateY(0) scale(1)}'
      +'.kinojo-admin-notification-card:focus-visible{box-shadow:0 0 0 3px rgba(147,197,253,.58),0 20px 56px rgba(4,15,35,.4)}'
      +'.kinojo-admin-notification-link-hint{position:absolute;right:0;bottom:calc(100% + 8px);display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(147,197,253,.28);border-radius:9px;background:rgba(4,18,39,.94);color:rgba(255,255,255,.94);font-size:12px;line-height:1;font-weight:900;letter-spacing:-.01em;box-shadow:0 10px 28px rgba(4,15,35,.32);opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;white-space:nowrap}'
      +'.kinojo-admin-notification-link-hint-arrow{color:#60a5fa;font-size:16px;line-height:1;font-weight:1000}'
      +'.kinojo-admin-notification-card:hover + .kinojo-admin-notification-link-hint,.kinojo-admin-notification-card:focus-visible + .kinojo-admin-notification-link-hint{opacity:1;transform:translateY(0)}'
      +'.kinojo-admin-notification-head{min-height:72px;display:flex;align-items:center;padding:20px 54px 16px 22px;border-bottom:1px solid rgba(255,255,255,.12);background:linear-gradient(100deg,rgba(4,18,39,.38),rgba(29,78,137,.16))}'
      +'.kinojo-admin-notification-title{margin:0;color:#fff;font-size:20px;line-height:1.2;font-weight:1000;letter-spacing:-.02em}'
      +'.kinojo-admin-notification-close{position:absolute;top:14px;right:14px;width:32px;height:32px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(3,15,32,.26);color:#fff;font:900 20px/1 system-ui,sans-serif;cursor:pointer}'
      +'.kinojo-admin-notification-close:hover,.kinojo-admin-notification-close:focus-visible{background:rgba(255,255,255,.14);outline:none}'
      +'.kinojo-admin-notification-body{min-height:0;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:20px 22px 22px}'
      +'.kinojo-admin-notification-character{overflow:hidden;color:#fff;font-size:19px;line-height:1.25;font-weight:1000;text-overflow:ellipsis;white-space:nowrap}'
      +'.kinojo-admin-notification-message{margin:0;color:rgba(255,255,255,.91);font-size:14px;line-height:1.55;font-weight:800;word-break:keep-all;overflow-wrap:anywhere}'
      +'.kinojo-admin-notification-more{margin-top:auto;color:rgba(219,234,254,.8);font-size:11px;line-height:1.3;font-weight:900}'
      +'.kinojo-admin-notification-card.is-leaving{opacity:0;transform:translateY(16px) scale(.985)}'
      +'@media(max-width:720px){.kinojo-admin-notification-host{left:12px;right:12px;bottom:calc(var(--kinojo-safe-bottom,0px) + 70px)}.kinojo-admin-notification-card{width:min(360px,100%);margin-left:auto}.kinojo-admin-notification-head{min-height:64px;padding:17px 50px 14px 18px}.kinojo-admin-notification-title{font-size:18px}.kinojo-admin-notification-body{padding:17px 18px 19px}.kinojo-admin-notification-character{font-size:17px}.kinojo-admin-notification-message{font-size:13px}}'
      +'@media(hover:none){.kinojo-admin-notification-link-hint{display:none}}'
      +'@media(prefers-reduced-motion:reduce){.kinojo-admin-notification-card{transition:none}}';
    document.head.appendChild(style);
  }

  function normalize(summary){
    const rows=[];
    const code=summary?.latestCodeRequest;
    if(code&&(code.requestId||code.id)){
      const name=String(code.characterName||'캐릭터').trim()||'캐릭터';
      rows.push({
        eventKey:'CODE_REQUEST:'+String(code.requestId||code.id),title:'코드 요청',characterName:name,
        message:'['+name+']님이 코드 발급을 요청하였습니다.',moreCount:Math.max(0,Number(summary?.codeRequestCount||0)-1),
        href:adminHref('#requests'),createdAt:String(code.createdAt||'')
      });
    }
    const support=summary?.latestSupportRequest;
    if(support?.id){
      const name=String(support.characterName||'캐릭터').trim()||'캐릭터';
      const target=[support.teamNo?String(support.teamNo)+'팀':'',support.partyNo?String(support.partyNo)+'파티':'',support.slotNo?String(support.slotNo)+'번 슬롯':''].filter(Boolean).join(' · ');
      rows.push({
        eventKey:'FORCE_REQUEST:'+String(support.id),title:'포스 요청',characterName:name,
        message:'['+name+']님이 '+(target?target+'에 ':'')+'포스 지원 요청하였습니다.',moreCount:Math.max(0,Number(summary?.supportRequestCount||0)-1),
        href:adminHref('#sanctuary/requests'),createdAt:String(support.createdAt||'')
      });
    }
    const reference=summary?.latestReferenceUpload;
    if(reference?.characterId&&reference?.uploadedAt){
      const name=String(reference.characterName||'캐릭터').trim()||'캐릭터';
      rows.push({
        eventKey:'REFERENCE_IMAGE:'+String(reference.characterId)+':'+String(reference.slot||'')+':'+String(reference.uploadedAt),title:'참고 이미지 업로드',characterName:name,
        message:'['+name+']님이 참고 이미지를 업로드 하였습니다.',moreCount:0,
        href:adminHref('#members/accounts'),createdAt:String(reference.uploadedAt||'')
      });
    }
    return rows.sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
  }

  function finish(card){
    if(hideTimer){clearTimeout(hideTimer);hideTimer=0;}
    if(card?.isConnected){card.classList.add('is-leaving');setTimeout(()=>card.remove(),260);}
    active=false;
    setTimeout(showNext,280);
  }

  function showNext(){
    if(active||!queue.length)return;
    const item=queue.shift();queuedKeys.delete(item.eventKey);active=true;markSeen(item.eventKey);ensureStyles();
    let host=document.getElementById('kinojoAdminNotificationHost');
    if(!host){host=document.createElement('div');host.id='kinojoAdminNotificationHost';host.className='kinojo-admin-notification-host';document.body.appendChild(host);}
    host.replaceChildren();
    const card=document.createElement('article');
    card.className='kinojo-admin-notification-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',item.title+' · '+item.message+' · 관리자 페이지 이동');
    card.innerHTML='<header class="kinojo-admin-notification-head"><h2 class="kinojo-admin-notification-title">'+esc(item.title)+'</h2></header>'
      +'<button class="kinojo-admin-notification-close" type="button" aria-label="알림 닫기">×</button>'
      +'<div class="kinojo-admin-notification-body"><strong class="kinojo-admin-notification-character">'+esc(item.characterName)+'</strong><p class="kinojo-admin-notification-message">'+esc(item.message)+'</p>'
      +(item.moreCount>0?'<span class="kinojo-admin-notification-more">외 '+esc(item.moreCount)+'건</span>':'')+'</div>';
    const open=()=>{if(item.href)location.href=item.href;};
    card.addEventListener('click',event=>{if(event.target.closest('.kinojo-admin-notification-close'))return;open();});
    card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.kinojo-admin-notification-close')){event.preventDefault();open();}});
    card.querySelector('.kinojo-admin-notification-close')?.addEventListener('click',event=>{event.stopPropagation();finish(card);});
    const hint=document.createElement('div');hint.className='kinojo-admin-notification-link-hint';hint.setAttribute('aria-hidden','true');
    hint.innerHTML='관리자 페이지 이동 <span class="kinojo-admin-notification-link-hint-arrow">→</span>';
    host.appendChild(card);host.appendChild(hint);requestAnimationFrame(()=>card.classList.add('show'));
    hideTimer=setTimeout(()=>finish(card),8500);
  }

  function enqueue(summary){
    if(!summary||summary.ok!==true)return;
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
    const wait=setInterval(()=>{if(installApiHook()){clearInterval(wait);setTimeout(fallbackSummary,650);}},40);
    setTimeout(()=>clearInterval(wait),5000);
    setInterval(fallbackSummary,30000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(fallbackSummary,80);});
    window.addEventListener('kinojo:auth-changed',()=>setTimeout(fallbackSummary,100));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
