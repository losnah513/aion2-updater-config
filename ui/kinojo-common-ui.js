/* KINOJO common UI v20260823.04 */
(function(){
  if(window.__KINOJO_COMMON_UI_INIT_DONE__) return;
  window.__KINOJO_COMMON_UI_INIT_DONE__ = true;
  const DOCS={
    about:{title:"사이트 소개",html:`<h3>KINOJO INFO</h3><p>키노조 인포는 AION2 키노조 관련 정보를 한곳에서 확인하기 위한 정보 허브입니다.</p><p>성역 파티 확인, 레기온 기록, 명예의 전당, KINOJO Meter 등 필요한 기능을 순차적으로 제공합니다.</p>`},
    terms:{title:"이용약관",html:`<h3>이용 안내</h3><p>본 사이트는 키노조 관련 정보를 편리하게 확인하기 위한 비공식 정보 페이지입니다.</p><ul><li>사이트 정보의 무단 변조 또는 악의적 사용을 금지합니다.</li><li>표시되는 데이터는 참고용이며 최종 판단은 이용자 본인에게 있습니다.</li><li>서비스 구조는 사전 안내 없이 변경될 수 있습니다.</li></ul>`},
    privacy:{title:"개인정보처리방침",html:`<h3>개인정보 처리 안내</h3><p>본 사이트는 기본적인 정보 확인 기능을 중심으로 운영되며, 불필요한 개인정보 수집을 지양합니다.</p><ul><li>입력 정보는 사이트 운영 및 문의 확인 목적에 한해 사용됩니다.</li><li>불필요한 민감정보 입력은 권장하지 않습니다.</li><li>정책은 기능 추가에 따라 갱신될 수 있습니다.</li></ul>`},
    contact:{title:"아이디어 제안 및 건의",html:`<h3>문의 안내</h3><p>오류 제보, 기능 제안, 데이터 수정 요청은 아래 문의 채널로 전달해 주세요.</p><p><a href="https://discord.com/channels/939881585061277746/1512052370144493769" target="_blank" rel="noopener">디스코드 문의 채널 열기</a></p>`}
  };

  function pageInfo(){
    const path=location.pathname.replace(/\\/g,'/');
    const mobile=/(^|\/)m(\/|$)/.test(path);
    if(path.includes('/hof/')||path.includes('/hall-of-fame/'))return {key:'hall',label:'명예의 전당',root:mobile?'../../':'../',mobile};
    if(path.includes('/ranking/'))return {key:'ranking',label:'레기온 순위',root:mobile?'../../':'../',mobile};
    if(path.includes('/meter/'))return {key:'meter',label:'키노조 미터',root:mobile?'../../':'../',mobile};
    if(path.includes('/sanctuary-schedule/'))return {key:'schedule',label:'성역 스케줄',root:mobile?'../../':'../',mobile};
    if(path.includes('/sanctuary/'))return {key:'sanctuary',label:'성역',root:mobile?'../../':'../',mobile};
    if(path.includes('/arcana/'))return {key:'arcana',label:'아르카나',root:mobile?'../../':'../',mobile};
    if(path.includes('/admin/'))return {key:'admin',label:'관리자 콘솔',root:mobile?'../../':'../',mobile};
    if(mobile)return {key:'home',label:'메인',root:'../',mobile};
    return {key:'home',label:'메인',root:'./',mobile};
  }
  function q(s,root=document){return root.querySelector(s)}
  function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;')}
  function classIconFor_(className){
    const key=String(className||'').trim();
    const map={
      '검성':'gladiator','수호성':'templar','궁성':'ranger','살성':'assassin',
      '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter',
      'gladiator':'gladiator','templar':'templar','ranger':'ranger','assassin':'assassin',
      'sorcerer':'sorcerer','elementalist':'elementalist','cleric':'cleric','chanter':'chanter','fighter':'fighter','brawler':'fighter'
    };
    const file=map[key];
    return file?'/assets/images/classes/class_icon_'+file+'.png':'';
  }
  function detach(el){if(el&&el.parentNode)el.parentNode.removeChild(el);return el}
  function removeLegacy(){
    const legacyTop=q('.top-utility');
    const slot=q('#kinojoCommonSlot');
    // 방문자바는 공통 UI가 매번 새 구조로만 생성한다. 기존 #visitCard를 재사용하면
    // hall-of-fame 구 방문자 HTML/클래스가 다시 살아나 공통 방문자바를 덮어쓸 수 있다.
    document.querySelectorAll('#visitCard,.visit-mini').forEach(el=>detach(el));
    const admin=slot?q('.admin-menu-wrap',slot):(legacyTop?q('.admin-menu-wrap',legacyTop):q('.admin-menu-wrap'));
    const rescued={visit:null,admin:detach(admin)};
    if(slot)slot.remove();
    if(legacyTop)legacyTop.remove();
    document.querySelectorAll('.side-drawer,.drawer-page-panel,.info-drawer,.info-drawer-overlay,.kinojo-common-drawer,.kinojo-side-panel').forEach(el=>el.remove());
    return rescued;
  }
  function createVisitCard(){
    const el=document.createElement('section');
    el.className='visit-mini kinojo-visitor-statusbar';
    el.id='visitCard';
    el.setAttribute('aria-label','방문자 및 서버 연결 상태');
    el.innerHTML=''
      +'<span class="visit-side visit-total"><span class="visit-icon">👥</span><span class="visit-text"><b>누적</b><strong data-visit-total>확인중</strong></span></span>'
      +'<span class="visit-light is-checking" data-visit-server-light><i></i><b>서버 확인중</b></span>'
      +'<span class="visit-side visit-today"><span class="visit-text"><b>오늘</b><strong data-visit-today>확인중</strong></span><span class="visit-icon">📅</span></span>';
    return el;
  }
  const KINOJO_NOTICE_MARQUEE_DELAY_MS = 1200;
  const KINOJO_NOTICE_MARQUEE_SPEED = 38;
  const KINOJO_NOTICE_END_HOLD_MS = 1800;
  const KINOJO_NOTICE_SHORT_HOLD_MS = 7200;
  const KINOJO_NOTICE_CACHE_KEY = 'kinojo_common_notices_v1';
  const KINOJO_NOTICE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const KINOJO_NOTICE_RETRY_DELAYS_MS = [0, 420, 1200];
  let kinojoNoticeState = { items: [], index: 0, timer: null, paused: false, loadPromise: null, lastFailureAt: 0 };

  function createNoticeStrip(info){
    const strip=document.createElement('section');
    strip.className='kinojo-notice-strip';
    strip.id='kinojoNoticeStrip';
    strip.setAttribute('aria-label','최근 공지사항');
    strip.innerHTML=''
      +'<div class="kinojo-notice-shell">'
      +'<span class="kinojo-notice-label"><i aria-hidden="true"></i>NOTICE</span>'
      +'<button class="kinojo-notice-step" id="kinojoNoticePrevBtn" type="button" aria-label="이전 공지">‹</button>'
      +'<div class="kinojo-notice-list" id="kinojoNoticeList"><span class="kinojo-notice-empty">최근 공지를 불러오는 중입니다.</span></div>'
      +'<button class="kinojo-notice-step" id="kinojoNoticeNextBtn" type="button" aria-label="다음 공지">›</button>'
      +'<button class="kinojo-notice-detail-btn" id="kinojoNoticeDetailBtn" type="button" aria-label="공지사항 전체 보기">전체</button>'
      +'</div>';
    setTimeout(()=>{
      const btn=document.getElementById('kinojoNoticeDetailBtn');
      if(btn&&!btn.dataset.bound){
        btn.dataset.bound='1';
        btn.addEventListener('click',()=>showNoticeBoardModal());
      }
      document.getElementById('kinojoNoticePrevBtn')?.addEventListener('click',()=>showNoticeAt_(kinojoNoticeState.index-1,true));
      document.getElementById('kinojoNoticeNextBtn')?.addEventListener('click',()=>showNoticeAt_(kinojoNoticeState.index+1,true));
      strip.addEventListener('click',event=>{
        const retry=event.target.closest('[data-kinojo-notice-retry]');
        if(!retry)return;
        retry.disabled=true;
        loadCommonNotices({force:true});
      });
      strip.addEventListener('mouseenter',()=>{kinojoNoticeState.paused=true;clearNoticeTimer_();});
      strip.addEventListener('mouseleave',()=>{kinojoNoticeState.paused=false;scheduleNextNotice_();});
      strip.addEventListener('focusin',()=>{kinojoNoticeState.paused=true;clearNoticeTimer_();});
      strip.addEventListener('focusout',()=>{kinojoNoticeState.paused=false;scheduleNextNotice_();});
    },0);
    return strip;
  }
  function normalizeNoticeAuthor_(author){
    return String(author || '관리자')
      .replace(/\s*Lv\.?\s*\d+/gi,'')
      .replace(/\s*Level\s*\d+/gi,'')
      .replace(/\(\s*([^)]*?)\s*Lv\.?\s*\d+\s*\)/gi,'($1)')
      .replace(/\(\s*([^)]*?)\s*Level\s*\d+\s*\)/gi,'($1)')
      .replace(/\(\s*\)/g,'')
      .replace(/\s{2,}/g,' ')
      .trim() || '관리자';
  }
  function noticeTypeMeta_(type){
    const label=String(type||'공지').trim()||'공지';
    const key=label==='이벤트'?'event':(label==='알림'?'alert':'notice');
    const icon=key==='event'?'🎁':(key==='alert'?'🔔':'📢');
    return {label,key,icon};
  }
  function renderNoticeItemHtml_(item){
    const meta=noticeTypeMeta_(item.noticeType||item.notice||'공지');
    const author=normalizeNoticeAuthor_(item.author||'관리자');
    const content=String(item.content||'').trim();
    return '<article class="kinojo-notice-item kinojo-notice-type-'+meta.key+'" data-notice-type="'+meta.key+'">'
      +'<strong><span class="kinojo-notice-icon">'+meta.icon+'</span>'+escapeHtml(meta.label)+'</strong>'
      +'<span class="kinojo-notice-author">'+escapeHtml(author)+'</span>'
      +'<span class="kinojo-notice-text"><span class="kinojo-notice-text-inner">'+escapeHtml(content)+'</span></span>'
      +'</article>';
  }
  function clearNoticeTimer_(){
    if(kinojoNoticeState.timer){
      clearTimeout(kinojoNoticeState.timer);
      kinojoNoticeState.timer=null;
    }
  }
  function applyNoticeMarqueeIfNeeded_(itemEl){
    if(!itemEl)return;
    const textBox=itemEl.querySelector('.kinojo-notice-text');
    const inner=itemEl.querySelector('.kinojo-notice-text-inner');
    if(!textBox||!inner)return;
    inner.classList.remove('is-marquee-active');
    inner.style.removeProperty('--notice-marquee-distance');
    kinojoNoticeState.timer=setTimeout(()=>{
      kinojoNoticeState.timer=null;
      const overflow=Math.max(0, inner.scrollWidth - textBox.clientWidth);
      if(overflow>8){
        const duration=Math.max(2.6,overflow/KINOJO_NOTICE_MARQUEE_SPEED);
        inner.style.setProperty('--notice-marquee-distance', '-'+(overflow+28)+'px');
        inner.style.setProperty('--notice-marquee-duration',duration+'s');
        inner.classList.add('is-marquee-active');
        if(kinojoNoticeState.items.length>1&&!kinojoNoticeState.paused){
          kinojoNoticeState.timer=setTimeout(()=>showNoticeAt_(kinojoNoticeState.index+1),duration*1000+KINOJO_NOTICE_END_HOLD_MS);
        }
      }else if(kinojoNoticeState.items.length>1&&!kinojoNoticeState.paused){
        kinojoNoticeState.timer=setTimeout(()=>showNoticeAt_(kinojoNoticeState.index+1),KINOJO_NOTICE_SHORT_HOLD_MS);
      }
    }, KINOJO_NOTICE_MARQUEE_DELAY_MS);
  }
  function scheduleNextNotice_(){
    clearNoticeTimer_();
    const item=document.querySelector('#kinojoNoticeList .kinojo-notice-item');
    if(item)applyNoticeMarqueeIfNeeded_(item);
  }
  function showNoticeAt_(index,manual){
    const list=document.getElementById('kinojoNoticeList');
    const items=kinojoNoticeState.items||[];
    if(!list||!items.length)return;
    const safeIndex=((index%items.length)+items.length)%items.length;
    kinojoNoticeState.index=safeIndex;
    if(manual)kinojoNoticeState.paused=false;
    clearNoticeTimer_();
    list.classList.remove('is-entering');
    list.classList.add('is-leaving');
    setTimeout(()=>{
      list.innerHTML=renderNoticeItemHtml_(items[safeIndex]);
      list.classList.remove('is-leaving');
      list.classList.add('is-entering');
      applyNoticeMarqueeIfNeeded_(list.querySelector('.kinojo-notice-item'));
      setTimeout(()=>list.classList.remove('is-entering'),520);
    },220);
  }
  function startNoticeRotation_(){
    clearNoticeTimer_();
    scheduleNextNotice_();
  }
  function waitNoticeRetry_(delay){
    return new Promise(resolve=>setTimeout(resolve,delay));
  }
  function noticeRequestWithTimeout_(promise,timeoutMs){
    let timeoutId=0;
    const timeout=new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('공지 서버 응답 시간이 초과되었습니다.')),timeoutMs);});
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timeoutId));
  }
  async function requestNoticesOnce_(limit){
    let request;
    if(window.KinojoApi?.getAction){
      request=window.KinojoApi.getAction('notices',{limit});
    }else{
      const base=commonApiUrl();
      if(!base)throw new Error('공지 서버 모듈을 준비하는 중입니다.');
      const url=base+(base.includes('?')?'&':'?')+'action=notices&limit='+encodeURIComponent(limit)+'&t='+Date.now();
      request=fetch(url,{cache:'no-store'}).then(async response=>{
        if(!response.ok)throw new Error('공지 서버 HTTP '+response.status);
        return response.json();
      });
    }
    const data=await noticeRequestWithTimeout_(request,8000);
    if(!data||data.ok!==true||!Array.isArray(data.notices))throw new Error(data?.message||'공지 응답 형식이 올바르지 않습니다.');
    return data;
  }
  async function fetchNotices_(limit){
    let lastError=null;
    for(let attempt=0;attempt<KINOJO_NOTICE_RETRY_DELAYS_MS.length;attempt+=1){
      const delay=KINOJO_NOTICE_RETRY_DELAYS_MS[attempt];
      if(delay)await waitNoticeRetry_(delay);
      try{return await requestNoticesOnce_(limit);}
      catch(error){lastError=error;if(navigator.onLine===false)break;}
    }
    throw lastError||new Error('공지사항을 불러오지 못했습니다.');
  }
  function readNoticeCache_(){
    try{
      const cached=JSON.parse(localStorage.getItem(KINOJO_NOTICE_CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.items)||!Number.isFinite(Number(cached.savedAt)))return null;
      if(Date.now()-Number(cached.savedAt)>KINOJO_NOTICE_CACHE_MAX_AGE_MS)return null;
      return {items:cached.items,savedAt:Number(cached.savedAt)};
    }catch(_error){return null;}
  }
  function writeNoticeCache_(items){
    try{localStorage.setItem(KINOJO_NOTICE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),items:Array.isArray(items)?items:[]}));}
    catch(_error){}
  }
  function renderNoticeList_(notices,source){
    const list=document.getElementById('kinojoNoticeList');
    if(!list)return false;
    clearNoticeTimer_();
    list.dataset.noticeSource=source||'network';
    if(source==='cache')list.title='공지 서버 연결이 지연되어 마지막으로 확인한 공지를 표시합니다.';
    else list.removeAttribute('title');
    if(!notices.length){
      kinojoNoticeState.items=[];
      list.innerHTML='<span class="kinojo-notice-empty">등록된 공지가 없습니다.</span>';
      return true;
    }
    kinojoNoticeState.items=notices;
    kinojoNoticeState.index=0;
    list.innerHTML=renderNoticeItemHtml_(notices[0]);
    startNoticeRotation_();
    return true;
  }
  function renderNoticeLoadError_(){
    const list=document.getElementById('kinojoNoticeList');
    if(!list)return;
    list.dataset.noticeSource='error';
    list.innerHTML='<div class="kinojo-notice-load-error"><span>공지 연결이 지연되고 있습니다.</span><button class="kinojo-notice-retry" type="button" data-kinojo-notice-retry>다시 시도</button></div>';
  }
  async function loadCommonNotices(options){
    const list=document.getElementById('kinojoNoticeList');
    if(!list)return;
    if(kinojoNoticeState.loadPromise)return kinojoNoticeState.loadPromise;
    clearNoticeTimer_();
    const cached=readNoticeCache_();
    if(!kinojoNoticeState.items.length&&cached?.items?.length)renderNoticeList_(cached.items.slice(0,5),'cache');
    kinojoNoticeState.loadPromise=(async()=>{
      try{
        const data=await fetchNotices_(5);
        const notices=data.notices.slice(0,5);
        writeNoticeCache_(notices);
        kinojoNoticeState.lastFailureAt=0;
        renderNoticeList_(notices,'network');
      }catch(_error){
        kinojoNoticeState.lastFailureAt=Date.now();
        const fallback=readNoticeCache_();
        if(fallback?.items?.length)renderNoticeList_(fallback.items.slice(0,5),'cache');
        else renderNoticeLoadError_();
      }finally{
        kinojoNoticeState.loadPromise=null;
      }
    })();
    return kinojoNoticeState.loadPromise;
  }
  async function showNoticeBoardModal(){
    let notices=[];
    let cached=false;
    try{
      const data=await fetchNotices_(50);
      notices=data.notices;
      writeNoticeCache_(notices.slice(0,50));
    }catch(e){
      const fallback=readNoticeCache_();
      if(fallback?.items?.length){notices=fallback.items;cached=true;}
      else{
        showSafeError?.(e,{feature:'공지사항 상세 보기',title:'공지사항을 불러오지 못했습니다.',message:'잠시 후 다시 시도해 주세요.'});
        return;
      }
    }
    const overlay=document.createElement('div');
    overlay.className='kinojo-notice-board-overlay';
    const rows=notices.length?notices.map((item)=>{
      const meta=noticeTypeMeta_(item.noticeType||item.notice||'공지');
      return '<article class="kinojo-notice-board-row kinojo-notice-type-'+meta.key+'">'
        +'<div class="kinojo-notice-board-head"><span class="kinojo-notice-board-badge">'+meta.icon+' '+escapeHtml(meta.label)+'</span><span class="kinojo-notice-board-date">'+escapeHtml(item.createdAt||'')+'</span></div>'
        +'<div class="kinojo-notice-board-content">'+escapeHtml(item.content||'')+'</div>'
        +'<div class="kinojo-notice-board-author">'+escapeHtml(normalizeNoticeAuthor_(item.author||'관리자'))+'</div>'
        +'</article>';
    }).join(''):'<div class="kinojo-notice-board-empty">등록된 공지사항이 없습니다.</div>';
    overlay.innerHTML='<section class="kinojo-notice-board-card" role="dialog" aria-modal="true" aria-label="공지사항 상세 보기">'
      +'<button class="kinojo-notice-board-close" type="button" aria-label="닫기">×</button>'
      +'<div class="kinojo-notice-board-kicker">KINOJO NOTICE</div>'
      +'<h3>공지사항</h3>'
      +'<p class="kinojo-notice-board-desc">'+(cached?'서버 연결이 지연되어 마지막으로 확인한 공지를 표시합니다.':'최근 등록된 공지, 알림, 이벤트를 최신순으로 확인합니다.')+'</p>'
      +'<div class="kinojo-notice-board-list">'+rows+'</div>'
      +'</section>';
    const close=()=>overlay.remove();
    overlay.addEventListener('click',(e)=>{if(e.target===overlay)close();});
    overlay.querySelector('.kinojo-notice-board-close')?.addEventListener('click',close);
    document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){document.removeEventListener('keydown',esc);close();}});
    document.body.appendChild(overlay);
  }


  function shortenErrorMessage_(value){
    const text=String(value?.message || value || '알 수 없는 오류가 발생했습니다.');
    if(/<!doctype html|<html[\s>]/i.test(text)) return '요청 처리 중 서버 응답을 해석하지 못했습니다.';
    return text.length>140 ? text.slice(0,140)+'…' : text;
  }
  function buildErrorDetails_(error, context){
    const lines=[];
    lines.push('KINOJO ERROR REPORT');
    lines.push('time: '+new Date().toISOString());
    lines.push('page: '+location.href);
    if(context?.feature) lines.push('feature: '+context.feature);
    if(context?.action) lines.push('action: '+context.action);
    if(context?.payload) lines.push('payload: '+JSON.stringify(context.payload));
    if(error?.status) lines.push('status: '+error.status);
    if(error?.message) lines.push('message: '+error.message);
    if(error?.data) lines.push('data: '+JSON.stringify(error.data).slice(0,2500));
    const raw=String(error?.responseText || error?.raw || error || '');
    if(raw) lines.push('raw: '+raw.slice(0,2500));
    return lines.join('\n');
  }
  function showSafeError(error, context){
    const title=context?.title || '기능이 정상적으로 작동하지 않았습니다.';
    const message=context?.message || shortenErrorMessage_(error);
    const details=buildErrorDetails_(error, context || {});
    const old=document.getElementById('kinojoSafeErrorModal');
    if(old) old.remove();
    const overlay=document.createElement('div');
    overlay.className='kinojo-safe-error-overlay';
    overlay.id='kinojoSafeErrorModal';
    overlay.innerHTML='<section class="kinojo-safe-error-card" role="dialog" aria-modal="true" aria-label="오류 안내">'
      +'<button type="button" class="kinojo-safe-error-close" aria-label="닫기">×</button>'
      +'<div class="kinojo-safe-error-kicker">KINOJO SAFETY</div>'
      +'<h3>'+escapeHtml(title)+'</h3>'
      +'<p>'+escapeHtml(message)+'</p>'
      +'<div class="kinojo-safe-error-actions"><button type="button" class="kinojo-safe-error-copy">진단 내용 복사</button><button type="button" class="kinojo-safe-error-ok">확인</button></div>'
      +'</section>';
    const close=()=>overlay.remove();
    overlay.querySelector('.kinojo-safe-error-close')?.addEventListener('click',close);
    overlay.querySelector('.kinojo-safe-error-ok')?.addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('.kinojo-safe-error-copy')?.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(details); toast('진단 내용이 복사되었습니다.');}
      catch(_e){window.prompt('아래 내용을 복사해 주세요.', details);}
    });
    document.body.appendChild(overlay);
    return {details, close};
  }

  function commonApiUrl(){
    if(window.KinojoApi && typeof window.KinojoApi.getBaseUrl === 'function') return window.KinojoApi.getBaseUrl();
    return (new URLSearchParams(location.search).get('api')) || '';
  }
  function setVisitServerLight(state, label){
    const light=document.querySelector('[data-visit-server-light]');
    if(!light)return;
    light.classList.remove('is-ok','is-delay','is-error','is-checking');
    light.classList.add(state||'is-ok');
    const b=light.querySelector('b');
    if(b)b.textContent=label||'서버 연결 정상';
  }
  function renderCommonVisits(stats){
    const el=document.getElementById('visitCard');
    if(!el)return;
    const today=Number(stats?.todayVisits||0).toLocaleString('ko-KR')+'명';
    const total=Number(stats?.totalVisits||0).toLocaleString('ko-KR')+'회';
    const t=el.querySelector('[data-visit-today]');
    const a=el.querySelector('[data-visit-total]');
    if(t)t.textContent=today;
    if(a)a.textContent=total;
    setVisitServerLight('is-ok','서버 연결 정상');
  }
  async function loadCommonVisits(info){
    const el=document.getElementById('visitCard');
    if(!el)return;
    try{
      const pageKey=info?.key||'home';
      const data=window.KinojoApi
        ? await window.KinojoApi.getAction('hallVisit', { mode:'visit', pageKey })
        : await (await fetch(commonApiUrl()+(commonApiUrl().includes('?')?'&':'?')+new URLSearchParams({action:'hallVisit',mode:'visit',pageKey,t:String(Date.now())}).toString(),{cache:'no-store'})).json();
      if(data?.ok&&data.stats)renderCommonVisits(data.stats);
      const serverTime=data?.serverTime||data?.generatedAt||data?.stats?.serverTime;
      if(serverTime&&['home','meter','schedule'].includes(pageKey))setPageTime({value:serverTime});
    }catch(_err){
      setVisitServerLight('is-error','서버 연결 오류');
      const t=el.querySelector('[data-visit-today]');
      const a=el.querySelector('[data-visit-total]');
      if(t)t.textContent='확인중';
      if(a)a.textContent='확인중';
    }
  }
  function toast(message){
    if(window.KinojoToast && typeof window.KinojoToast.show === 'function') return window.KinojoToast.show(message);
    const el=document.createElement('div');
    el.className='kinojo-common-toast';
    el.textContent=String(message||'');
    document.body.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),220);},2100);
  }
  function bindImageGuards(){
    if(document.documentElement.dataset.kinojoImageGuardBound==='1')return;
    document.documentElement.dataset.kinojoImageGuardBound='1';
    document.addEventListener('contextmenu',e=>{
      const target=e.target;
      if(target&&target.closest&&target.closest('img, picture, svg, canvas, .sanctuary-hero, .hero-bg, .mvp-profile-image, .character-preview-avatar, .reaction-profile-image, .char-card')) e.preventDefault();
    },true);
    document.addEventListener('dragstart',e=>{
      const target=e.target;
      if(target&&target.closest&&target.closest('img, picture, svg, canvas')) e.preventDefault();
    },true);
  }

  function createAdminMenu(info){
    const wrap=document.createElement('div');
    const adminBase=info?.mobile?'/m/':'/';
    const adminConsoleHref=adminBase+'admin/';
    wrap.className='admin-menu-wrap';
    wrap.innerHTML='<button aria-label="관리자 콘솔 새 창 열기" class="admin-menu-btn" id="adminMenuBtn" type="button">관리<span class="kinojo-admin-pending-badge" id="kinojoAdminPendingBadge" hidden>0</span></button>';
    wrap.querySelector('#adminMenuBtn').dataset.adminHref=adminConsoleHref;
    return wrap;
  }
  let sanctuaryAlertRequestSeq=0;
  let commonNotificationSeq=0;
  let commonNotificationTimer=0;
  function commonSessionCredential_(){
    const auth=window.KinojoAuth||{};
    const session=typeof auth.getSession==='function'?auth.getSession():null;
    return String(session?.token||'').trim();
  }
  function clearSanctuaryAlert_(){
    const alert=q('#kinojoSanctuaryAlert');
    if(!alert)return;
    alert.hidden=true;
    alert.className='kinojo-sanctuary-alert';
    alert.removeAttribute('href');
  }
  function sanctuaryAlertHref_(info,item){
    const base=info?.mobile?'/m/':'/';
    const params=new URLSearchParams();
    if(item?.sanctuaryCode)params.set('id',String(item.sanctuaryCode));
    if(item?.targetDate)params.set('date',String(item.targetDate));
    if(item?.id)params.set('schedule',String(item.id));
    return base+'sanctuary-schedule/'+(params.toString()?'?'+params.toString():'');
  }
  function renderSanctuaryAlert_(data,info){
    const alert=q('#kinojoSanctuaryAlert');
    if(!alert)return;
    if(!data||data.ok===false||data.visible!==true||!data.item){clearSanctuaryAlert_();return;}
    const item=data.item||{};
    const teamNo=item.user?.teamNo;
    const time=item.startTime||'시간 조율 중';
    const meta=[item.dateLabel||item.targetDate,time,teamNo?teamNo+'팀':''].filter(Boolean).join(' · ');
    alert.className='kinojo-sanctuary-alert tone-'+escapeHtml(data.tone||'confirmed');
    alert.href=sanctuaryAlertHref_(info,item);
    alert.hidden=false;
    alert.innerHTML='<span class="kinojo-sanctuary-alert-badge">'+escapeHtml(data.label||'성역 일정')+'</span>'
      +'<strong>'+escapeHtml(item.title||item.sanctuaryShortName||item.sanctuaryName||'성역 일정')+'</strong>'
      +'<small>'+escapeHtml(meta)+'</small>';
  }
  async function loadSanctuaryAlert_(info,retry){
    if(!window.KinojoAuth){
      if((retry||0)<20)setTimeout(()=>loadSanctuaryAlert_(info,(retry||0)+1),120);
      return;
    }
    const credential=commonSessionCredential_();
    if(!credential){clearSanctuaryAlert_();return;}
    if(!window.KinojoApi?.getAction||!window.KinojoSupabase?.webAction){
      if((retry||0)<20)setTimeout(()=>loadSanctuaryAlert_(info,(retry||0)+1),120);
      return;
    }
    const seq=++sanctuaryAlertRequestSeq;
    try{
      const data=await window.KinojoApi.getAction('mySanctuaryTopbar',{});
      if(seq!==sanctuaryAlertRequestSeq)return;
      renderSanctuaryAlert_(data,info);
    }catch(_err){
      if(seq===sanctuaryAlertRequestSeq)clearSanctuaryAlert_();
    }
  }
  function renderCommonNotificationToast_(summary,info){
    const latest=summary?.latestSupportRequest;
    if(!latest?.id)return;
    const storageKey='kinojo_support_notice_seen_v316';
    let seen='';try{seen=sessionStorage.getItem(storageKey)||'';}catch(_err){}
    if(seen===String(latest.id))return;
    try{sessionStorage.setItem(storageKey,String(latest.id));}catch(_err){}
    let host=document.getElementById('kinojoRequestToastHost');
    if(!host){host=document.createElement('div');host.id='kinojoRequestToastHost';host.className='kinojo-request-toast-host';document.body.appendChild(host);}
    const item=document.createElement('button');item.type='button';item.className='kinojo-request-toast';
    item.innerHTML='<span class="kinojo-request-toast-icon">!</span><span><strong>새 포스 지원 요청</strong><small>'+escapeHtml(latest.characterName||'캐릭터')+' · '+escapeHtml(String(latest.partyNo||''))+'파티 '+escapeHtml(String(latest.slotNo||''))+'번</small></span><i aria-hidden="true">›</i>';
    item.addEventListener('click',()=>{location.href=(info?.mobile?'/m/admin/':'/admin/')+'#sanctuary/requests'});
    host.appendChild(item);requestAnimationFrame(()=>item.classList.add('show'));setTimeout(()=>{item.classList.remove('show');setTimeout(()=>item.remove(),260)},7000);
  }
  async function loadCommonNotificationSummary_(info,{notify=true}={}){
    const credential=commonSessionCredential_();const badge=q('#kinojoAdminPendingBadge');
    if(!credential||!window.KinojoApi?.getAction){if(badge)badge.hidden=true;return;}
    const seq=++commonNotificationSeq;
    try{
      const summary=await window.KinojoApi.getAction('notificationSummary',{});if(seq!==commonNotificationSeq)return;
      const total=Math.max(0,Number(summary?.totalCount||0));if(badge){badge.textContent=total>99?'99+':String(total);badge.hidden=total<1;}
      if(notify&&summary?.supportRequestCount>0)renderCommonNotificationToast_(summary,info);
    }catch(_err){if(seq===commonNotificationSeq&&badge)badge.hidden=true;}
  }
  function scheduleCommonNotifications_(info){
    if(commonNotificationTimer)clearInterval(commonNotificationTimer);
    setTimeout(()=>loadCommonNotificationSummary_(info,{notify:true}),420);
    commonNotificationTimer=setInterval(()=>{if(document.visibilityState==='visible')loadCommonNotificationSummary_(info,{notify:true})},30000);
  }
  function pageTimeId(info){
    if(info.key==='sanctuary')return 'syncChip';
    if(info.key==='hall')return 'topbarUpdateTime';
    return 'topbarUpdateTime';
  }

  const PAGE_TIME_LABELS={home:'접속',hall:'최종 조회',ranking:'최종 조회',meter:'접속',sanctuary:'동기화',schedule:'조회',arcana:'콘텐츠'};
  function formatPageTime_(value){
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const part=n=>String(n).padStart(2,'0');
    const hour=date.getHours();
    return part(date.getFullYear()%100)+'/'+part(date.getMonth()+1)+'/'+part(date.getDate())+'-'+(hour<12?'오전':'오후')+'-'+part(hour%12||12)+':'+part(date.getMinutes())+':'+part(date.getSeconds());
  }
  function setPageTime(detail){
    const info=pageInfo();
    const value=detail?.value||detail?.updatedAt||detail?.serverTime||detail;
    const text=formatPageTime_(value);
    if(!text)return false;
    const target=document.getElementById(pageTimeId(info));
    if(!target)return false;
    target.textContent=(detail?.label||PAGE_TIME_LABELS[info.key]||'업데이트')+' · '+text;
    target.dataset.serverTime=String(value);
    return true;
  }
  async function loadDocumentServerTime_(info){
    const target=document.getElementById(pageTimeId(info));
    if(!target||target.dataset.serverTime)return;
    try{
      const response=await fetch(location.href,{method:'HEAD',cache:'no-store'});
      const value=info.key==='arcana'?(response.headers.get('last-modified')||response.headers.get('date')):response.headers.get('date');
      if(!target.dataset.serverTime&&value)setPageTime({value});
    }catch(_err){}
  }

  function syncAuthRequiredUi_(){
    const loggedIn=!!window.KinojoAuth?.getSession?.();
    document.querySelectorAll('[data-kinojo-auth-required]').forEach(element=>{
      element.hidden=!loggedIn;
      element.setAttribute('aria-hidden',loggedIn?'false':'true');
    });
    if(!loggedIn){resetMyInfoCharacters_();resetMyInfoProfileUi_();closeMyInfoPanel();closeMyInfoModal();}
    else setTimeout(()=>loadMyInfoCharacters_().catch(()=>{}),0);
  }

  function makeTopbar(rescued,info){
    const bar=document.createElement('section');
    const adminConsoleHref=(info&&info.mobile)?'/m/admin/':'/admin/';
    bar.className='kinojo-topbar';
    bar.setAttribute('aria-label','KINOJO INFO 공통 상단 메뉴');
    const timeText=(PAGE_TIME_LABELS[info.key]||'업데이트')+' 시간 확인 중';
    const base=info.mobile?'/m/':'/';
    const navItems=[
      {key:'home',label:'HOME',href:base},
      {key:'hall',label:'명예의 전당',href:base+'hof/'},
      {key:'ranking',label:'레기온 순위',href:base+'ranking/'},
      {key:'meter',label:'미터기',href:base+'meter/'},
      {key:'sanctuary',label:'성역',href:base+'sanctuary/',sanctuaryMenu:true},
      {key:'schedule',label:'성역 스케줄',href:base+'sanctuary-schedule/',authRequired:true},
      {key:'arcana',label:'아르카나',href:base+'arcana/'}
    ];
    const navHtml=navItems.map(item=>{
      const active=item.key===info.key;
      const href=active?'./':item.href;
      if(item.sanctuaryMenu){
        const sanctuaryBase=info.mobile?'/m/sanctuary/':'/sanctuary/';
        return '<span class="kinojo-top-sanctuary-wrap"><button class="kinojo-top-nav-link kinojo-top-sanctuary-toggle'+(active?' active':'')+'" id="kinojoTopSanctuaryToggle" type="button" aria-expanded="false" aria-haspopup="menu"'+(active?' aria-current="page"':'')+'>성역 <i aria-hidden="true">▾</i></button><span class="kinojo-top-sanctuary-menu" id="kinojoTopSanctuaryMenu" role="menu" aria-hidden="true" data-sanctuary-master-nav data-sanctuary-base="'+sanctuaryBase+'"><a href="'+sanctuaryBase+'">성역 목록 불러오는 중</a></span></span>';
      }
      return '<a class="kinojo-top-nav-link'+(active?' active':'')+(item.adminOnly?' kinojo-admin-only-link':'')+'" href="'+href+'"'+(active?' aria-current="page"':'')+(item.authRequired?' data-kinojo-auth-required="true"':'')+'>'+item.label+'</a>';
    }).join('');
    bar.innerHTML=`<div class="kinojo-topbar-shell">
      <div class="kinojo-top-left">
        <button class="kinojo-menu-toggle" id="drawerToggleBtn" type="button" aria-label="메뉴 열기" aria-expanded="false">
          <svg class="kinojo-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <g class="menu-dots"><circle cx="12" cy="6" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="12" cy="18" r="1.9"></circle></g>
            <g class="menu-lines"><path d="M5 7.5H19"></path><path d="M5 12H19"></path><path d="M5 16.5H19"></path></g>
          </svg>
        </button>
        <span class="kinojo-top-page"><strong>${info.label}</strong><small id="${pageTimeId(info)}">${timeText}</small></span>
      </div>
      <nav class="kinojo-top-nav" id="kinojoTopNav" aria-label="KINOJO 주요 메뉴">${navHtml}</nav>
      <div class="kinojo-top-center kinojo-auth-status" id="kinojoUserStatus">
        <button class="kinojo-login-btn" id="kinojoLoginBtn" type="button">로그인</button>
        <span class="kinojo-auth-label" id="kinojoAuthLabel">비회원 · 열람만 가능</span>
        <button class="kinojo-logout-btn kinojo-my-info-btn" id="kinojoMyInfoBtn" type="button" data-kinojo-auth-required="true" aria-controls="kinojoMyInfoPanel" aria-expanded="false" hidden>내 정보</button>
        <button class="kinojo-logout-btn" id="kinojoLogoutBtn" type="button" style="display:none">로그아웃</button>
      </div>
      <div class="kinojo-top-tools" id="kinojoTopTools"></div>
      <div class="kinojo-top-visitor-row" id="kinojoTopVisitorRow">
        <a class="kinojo-sanctuary-alert" id="kinojoSanctuaryAlert" hidden></a>
      </div></div>`;
    const tools=q('#kinojoTopTools',bar);
    const auth=q('#kinojoUserStatus',bar);
    const admin=rescued.admin||createAdminMenu(info);
    const visit=rescued.visit||createVisitCard();
    const visitorRow=q('#kinojoTopVisitorRow',bar);
    const adminBtn=admin.querySelector('#adminMenuBtn');
    if(adminBtn){adminBtn.textContent='관리';adminBtn.setAttribute('aria-label','관리자 페이지 새 창 열기');adminBtn.dataset.adminHref=adminConsoleHref;}
    admin.style.display='none';
    if(auth)auth.appendChild(admin);
    if(visitorRow)visitorRow.appendChild(visit);
    document.body.insertBefore(bar,document.body.firstChild);
    const sanctuaryToggle=q('#kinojoTopSanctuaryToggle',bar);
    const sanctuaryMenu=q('#kinojoTopSanctuaryMenu',bar);
    const closeSanctuaryMenu=()=>{
      if(!sanctuaryToggle||!sanctuaryMenu)return;
      sanctuaryToggle.setAttribute('aria-expanded','false');
      sanctuaryMenu.setAttribute('aria-hidden','true');
      sanctuaryMenu.classList.remove('is-open');
    };
    sanctuaryToggle?.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const open=sanctuaryMenu?.classList.toggle('is-open')===true;
      sanctuaryToggle.setAttribute('aria-expanded',open?'true':'false');
      sanctuaryMenu?.setAttribute('aria-hidden',open?'false':'true');
    });
    sanctuaryMenu?.addEventListener('click',event=>{if(event.target.closest('a'))closeSanctuaryMenu();});
    document.addEventListener('click',event=>{if(!event.target.closest('.kinojo-top-sanctuary-wrap'))closeSanctuaryMenu();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSanctuaryMenu();});
    setTimeout(()=>loadSanctuaryAlert_(info,0),220);
    scheduleCommonNotifications_(info);
    window.addEventListener('kinojo:auth-changed',()=>{syncAuthRequiredUi_();setTimeout(()=>loadSanctuaryAlert_(info,0),20);scheduleCommonNotifications_(info);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadCommonNotificationSummary_(info,{notify:true})});
    const notice=createNoticeStrip(info);
    document.body.appendChild(notice);
    setTimeout(loadCommonNotices,0);
    setTimeout(()=>loadCommonVisits(info),40);
    setTimeout(()=>loadDocumentServerTime_(info),1200);
  }
  function ensureMyInfoStyles(){
    const existing=document.querySelector('link[data-kinojo-my-info-styles]');
    if(existing)return;
    let guard=document.querySelector('style[data-kinojo-my-info-critical]');
    if(!guard){
      guard=document.createElement('style');
      guard.dataset.kinojoMyInfoCritical='true';
      guard.textContent='.kinojo-my-info-layer,.kinojo-my-info-modal{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
      document.head.appendChild(guard);
    }
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/ui/kinojo-my-info.css?cache=2026082601';
    link.dataset.kinojoMyInfoStyles='true';
    link.addEventListener('load',()=>guard?.remove(),{once:true});
    document.head.appendChild(link);
  }
  function makeMyInfoPanel(){
    ensureMyInfoStyles();
    const layer=document.createElement('section');
    layer.className='kinojo-my-info-layer';
    layer.id='kinojoMyInfoLayer';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML=`
      <aside class="kinojo-my-info-panel" id="kinojoMyInfoPanel" role="dialog" aria-modal="true" aria-labelledby="kinojoMyInfoTitle" tabindex="-1">
        <div class="kinojo-panel-head">
          <strong class="kinojo-panel-title" id="kinojoMyInfoTitle">내 정보</strong>
          <button class="kinojo-common-close kinojo-panel-close" id="kinojoMyInfoCloseBtn" type="button" aria-label="내 정보 닫기">×</button>
        </div>
        <div class="kinojo-panel-body kinojo-my-info-body" id="kinojoMyInfoPanelBody">
          <button class="kinojo-my-info-menu-btn" id="kinojoMyInfoMenuBtn" type="button" aria-haspopup="dialog" aria-controls="kinojoMyInfoModal">
            <span>내 정보</span><small>이미지 관리</small>
          </button>
          <section class="kinojo-my-info-characters" aria-labelledby="kinojoMyCharactersTitle">
            <div class="kinojo-my-info-section-title" id="kinojoMyCharactersTitle">내 캐릭터</div>
            <div class="kinojo-my-info-character-list" id="kinojoMyInfoCharacterList" aria-live="polite" aria-atomic="true"><div class="kinojo-my-info-character-status" role="status">캐릭터 불러오는 중</div></div>
          </section>
        </div>
      </aside>`;
    document.body.appendChild(layer);
  }
  const kinojoMyCharactersState={token:'',data:null,promise:null,retryTimer:0};
  const KINOJO_MY_INFO_PANEL_WIDTH=Object.freeze({min:352,max:420,fixed:228});
  const kinojoMyInfoPanelWidthState={key:'',width:KINOJO_MY_INFO_PANEL_WIDTH.min,layout:'inline',context:null};
  const kinojoMyInfoFocusState={panelReturn:null,modalReturn:null,requestConfirmReturn:null};
  const KINOJO_MY_INFO_FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function myInfoFocusable_(root){
    if(!(root instanceof Element))return [];
    return Array.from(root.querySelectorAll(KINOJO_MY_INFO_FOCUSABLE)).filter(element=>{
      const style=getComputedStyle(element);
      return !element.hidden&&element.getAttribute('aria-hidden')!=='true'&&style.display!=='none'&&style.visibility!=='hidden'&&element.getClientRects().length>0;
    });
  }
  function focusMyInfoElement_(element){
    if(!(element instanceof HTMLElement)||!element.isConnected)return;
    requestAnimationFrame(()=>{try{element.focus({preventScroll:true});}catch(_error){element.focus();}});
  }
  function trapMyInfoFocus_(event,root){
    if(event.defaultPrevented||event.key!=='Tab'||!(root instanceof Element))return;
    const focusable=myInfoFocusable_(root);
    if(!focusable.length){event.preventDefault();focusMyInfoElement_(root);return;}
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    const active=document.activeElement;
    if(event.shiftKey&&(active===first||!root.contains(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(active===last||!root.contains(active))){event.preventDefault();first.focus();}
  }
  function myInfoSessionToken_(){
    const token=String(window.KinojoAuth?.getSession?.()?.token||'').trim();
    return /^kws_[A-Za-z0-9_-]{40,80}$/.test(token)?token:'';
  }
  function setMyInfoCharacterStatus_(message,code=''){
    const host=q('#kinojoMyInfoCharacterList');
    if(!host)return;
    host.dataset.state=code||'status';
    host.innerHTML='<div class="kinojo-my-info-character-status" role="status">'+escapeHtml(message||'캐릭터 정보를 확인 중입니다.')+'</div>';
  }
  function resetMyInfoCharacters_(){
    if(kinojoMyCharactersState.retryTimer)clearTimeout(kinojoMyCharactersState.retryTimer);
    kinojoMyCharactersState.token='';
    kinojoMyCharactersState.data=null;
    kinojoMyCharactersState.promise=null;
    kinojoMyCharactersState.retryTimer=0;
    syncMyInfoPanelWidth_([]);
    setMyInfoCharacterStatus_('캐릭터 불러오는 중','idle');
  }
  function myInfoStatNumber_(value){
    const number=Number(value);
    return Number.isFinite(number)&&number>0?Math.round(number).toLocaleString('ko-KR'):'-';
  }
  function fallbackMyInfoCharacterNameWidth_(value){
    return Array.from(String(value||'')).reduce((width,character)=>{
      const code=character.codePointAt(0)||0;
      if((code>=0x1100&&code<=0x11ff)||(code>=0x2e80&&code<=0x9fff)||(code>=0xac00&&code<=0xd7af))return width+12;
      if(/\s/u.test(character))return width+4;
      return width+(/[A-Z0-9]/u.test(character)?7.5:7);
    },0);
  }
  function syncMyInfoPanelWidth_(characters){
    const names=(Array.isArray(characters)?characters:[])
      .map(row=>String(row?.characterName||'').trim())
      .filter(Boolean);
    const key=names.join('\u001f');
    const panel=q('#kinojoMyInfoPanel');
    if(!panel)return KINOJO_MY_INFO_PANEL_WIDTH.min;
    if(kinojoMyInfoPanelWidthState.key===key){
      panel.style.setProperty('--kinojo-my-info-panel-width',kinojoMyInfoPanelWidthState.width+'px');
      panel.dataset.panelLayout=kinojoMyInfoPanelWidthState.layout;
      return kinojoMyInfoPanelWidthState.width;
    }
    let context=kinojoMyInfoPanelWidthState.context;
    if(!context){
      try{context=document.createElement('canvas').getContext('2d');}catch(_error){context=null;}
      kinojoMyInfoPanelWidthState.context=context;
    }
    if(context)context.font='normal 950 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const longest=names.reduce((width,name)=>Math.max(width,context?context.measureText(name).width:fallbackMyInfoCharacterNameWidth_(name)),0);
    const measured=Math.ceil(KINOJO_MY_INFO_PANEL_WIDTH.fixed+longest);
    const width=Math.min(KINOJO_MY_INFO_PANEL_WIDTH.max,Math.max(KINOJO_MY_INFO_PANEL_WIDTH.min,measured));
    const layout=measured>KINOJO_MY_INFO_PANEL_WIDTH.max?'stacked':'inline';
    kinojoMyInfoPanelWidthState.key=key;
    kinojoMyInfoPanelWidthState.width=width;
    kinojoMyInfoPanelWidthState.layout=layout;
    panel.style.setProperty('--kinojo-my-info-panel-width',width+'px');
    panel.dataset.panelWidth=String(width);
    panel.dataset.panelWidthSource=names.length?'character-name':'default';
    panel.dataset.panelLayout=layout;
    if(layout==='inline'){
      const clipped=Array.from(panel.querySelectorAll('.kinojo-my-info-character-name')).some(element=>element.scrollWidth>element.clientWidth+1);
      if(clipped){kinojoMyInfoPanelWidthState.layout='stacked';panel.dataset.panelLayout='stacked';}
    }
    return width;
  }
  function renderMyInfoCharacters_(data){
    const host=q('#kinojoMyInfoCharacterList');
    if(!host)return;
    if(!data||data.ok!==true){
      syncMyInfoPanelWidth_([]);
      setMyInfoCharacterStatus_('캐릭터 정보를 불러오지 못했습니다.','error');
      return;
    }
    if(data.ownerResolved!==true){
      syncMyInfoPanelWidth_([]);
      setMyInfoCharacterStatus_('등록된 본캐 연결 정보를 확인할 수 없습니다.',String(data.code||'OWNER_NOT_RESOLVED'));
      return;
    }
    const characters=Array.isArray(data.characters)?data.characters.filter(row=>Number(row?.characterId||0)>0):[];
    if(!characters.length){
      syncMyInfoPanelWidth_([]);
      setMyInfoCharacterStatus_('연결된 캐릭터가 없습니다.','empty');
      return;
    }
    host.dataset.state='ready';
    host.innerHTML=characters.map(row=>{
      const characterId=Number(row.characterId||0);
      const serverId=Number(row.serverId||0);
      const characterName=String(row.characterName||'').trim();
      const isMain=row.isMain===true;
      const kind=isMain?'본캐':'부캐';
      const classIcon=classIconFor_(row.className);
      const itemLevel=myInfoStatNumber_(row.displayItemLevel);
      const combatPower=myInfoStatNumber_(row.displayCombatPower);
      const statBasis=String(row.displayStatBasis||data.displayStatBasis||'').trim();
      const statLabel=(statBasis?statBasis+' 기준 · ':'')+'아이템 레벨 '+itemLevel+' · 전투력 '+combatPower;
      return '<article class="kinojo-my-info-character-row '+(isMain?'is-main':'is-alt')+'" role="button" tabindex="0" data-character-id="'+characterId+'" data-server-id="'+(Number.isFinite(serverId)?serverId:'')+'" data-character-name="'+escapeHtml(characterName)+'" aria-label="'+escapeHtml(characterName+' · '+kind+' · '+statLabel+' · 상세 정보 보기')+'" title="캐릭터 상세 정보 보기">'
        +(classIcon?'<img class="kinojo-my-info-character-icon" src="'+escapeHtml(classIcon)+'" alt="" aria-hidden="true">':'<span class="kinojo-my-info-character-icon is-empty" aria-hidden="true"></span>')
        +'<span class="kinojo-my-info-character-identity"><span class="kinojo-my-info-character-kind">'+kind+'</span><strong class="kinojo-my-info-character-name">'+escapeHtml(characterName||'이름 없음')+'</strong></span>'
        +'<span class="kinojo-my-info-character-stats" title="'+escapeHtml(statLabel)+'">'
          +'<span class="kinojo-my-info-character-stat is-il"><i aria-hidden="true">IL</i><b>'+itemLevel+'</b></span>'
          +'<span class="kinojo-my-info-character-stat-sep" aria-hidden="true"></span>'
          +'<span class="kinojo-my-info-character-stat is-power"><i aria-hidden="true">✦</i><b>'+combatPower+'</b></span>'
        +'</span>'
        +'</article>';
    }).join('');
    syncMyInfoPanelWidth_(characters);
  }
  async function loadMyInfoCharacters_(force=false){
    const token=myInfoSessionToken_();
    if(!token){resetMyInfoCharacters_();return null;}
    if(!force&&kinojoMyCharactersState.token===token&&kinojoMyCharactersState.data){
      renderMyInfoCharacters_(kinojoMyCharactersState.data);
      return kinojoMyCharactersState.data;
    }
    if(kinojoMyCharactersState.token!==token){
      if(kinojoMyCharactersState.retryTimer)clearTimeout(kinojoMyCharactersState.retryTimer);
      kinojoMyCharactersState.token=token;
      kinojoMyCharactersState.data=null;
      kinojoMyCharactersState.promise=null;
      kinojoMyCharactersState.retryTimer=0;
    }
    if(kinojoMyCharactersState.promise)return kinojoMyCharactersState.promise;
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      setMyInfoCharacterStatus_('서버 연결을 준비하는 중입니다.','waiting');
      if(kinojoMyCharactersState.retryTimer)clearTimeout(kinojoMyCharactersState.retryTimer);
      kinojoMyCharactersState.retryTimer=setTimeout(()=>{
        kinojoMyCharactersState.retryTimer=0;
        if(myInfoSessionToken_()===token)loadMyInfoCharacters_(force).catch(()=>{});
      },180);
      return null;
    }
    setMyInfoCharacterStatus_('캐릭터 불러오는 중','loading');
    kinojoMyCharactersState.promise=(async()=>{
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'characters',sessionToken:token});
      if(myInfoSessionToken_()!==token)return null;
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'CHARACTER_LIST_FAILED');
      kinojoMyCharactersState.data=data;
      renderMyInfoCharacters_(data);
      return data;
    })().catch(error=>{
      if(myInfoSessionToken_()===token){
        kinojoMyCharactersState.data=null;
        setMyInfoCharacterStatus_('캐릭터 정보를 불러오지 못했습니다.',String(error?.message||'error').slice(0,80));
      }
      return null;
    }).finally(()=>{
      if(kinojoMyCharactersState.token===token)kinojoMyCharactersState.promise=null;
    });
    return kinojoMyCharactersState.promise;
  }

  let kinojoCharacterDetailLoaderPromise=null;
  function ensureCharacterDetailStyle_(href,key){
    if(document.querySelector('link[data-kinojo-character-detail-style="'+key+'"],link[href*="'+href.split('/').pop().split('?')[0]+'"]'))return Promise.resolve(true);
    return new Promise((resolve,reject)=>{
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href=href;
      link.dataset.kinojoCharacterDetailStyle=key;
      link.addEventListener('load',()=>resolve(true),{once:true});
      link.addEventListener('error',()=>reject(new Error('CHARACTER_DETAIL_STYLE_LOAD_FAILED:'+key)),{once:true});
      document.head.appendChild(link);
    });
  }
  function ensureCharacterDetailScript_(src,key,ready){
    if(typeof ready==='function'&&ready())return Promise.resolve(true);
    const file=src.split('/').pop().split('?')[0];
    const existing=Array.from(document.scripts).find(script=>String(script.src||'').includes('/ui/'+file));
    if(existing){
      if(typeof ready!=='function')return Promise.resolve(true);
      return new Promise((resolve,reject)=>{
        if(typeof ready==='function'&&ready())return resolve(true);
        let settled=false;
        const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);if(typeof ready!=='function'||ready())resolve(true);else reject(new Error('CHARACTER_DETAIL_SCRIPT_NOT_READY:'+key));};
        const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error('CHARACTER_DETAIL_SCRIPT_LOAD_FAILED:'+key));};
        const timer=setTimeout(finish,1200);
        existing.addEventListener('load',finish,{once:true});
        existing.addEventListener('error',fail,{once:true});
      });
    }
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;
      script.async=false;
      script.dataset.kinojoCharacterDetailScript=key;
      script.addEventListener('load',()=>{
        if(typeof ready==='function'&&!ready())return reject(new Error('CHARACTER_DETAIL_SCRIPT_NOT_READY:'+key));
        resolve(true);
      },{once:true});
      script.addEventListener('error',()=>reject(new Error('CHARACTER_DETAIL_SCRIPT_LOAD_FAILED:'+key)),{once:true});
      document.head.appendChild(script);
    });
  }
  function ensureCharacterDetailModal_(){
    if(window.KinojoCharacterReaction?.open)return Promise.resolve(true);
    if(kinojoCharacterDetailLoaderPromise)return kinojoCharacterDetailLoaderPromise;
    kinojoCharacterDetailLoaderPromise=(async()=>{
      await Promise.all([
        ensureCharacterDetailStyle_('/ui/kinojo-character-reaction.css?cache=2026081003','reaction'),
        ensureCharacterDetailStyle_('/ui/kinojo-character-detail-refresh.css?cache=2026081003','detail-refresh'),
        ensureCharacterDetailStyle_('/ui/kinojo-character-skill.css?cache=2026081001','skill'),
        ensureCharacterDetailStyle_('/ui/kinojo-character-daevanion.css?cache=2026081002','daevanion')
      ]);
      await ensureCharacterDetailScript_('/ui/kinojo-character-reaction.js?cache=2026081801','reaction',()=>!!window.KinojoCharacterReaction?.open);
      await ensureCharacterDetailScript_('/ui/kinojo-character-detail-refresh.js?cache=2026081003','detail-refresh');
      await ensureCharacterDetailScript_('/ui/kinojo-character-skill-bridge.js?cache=2026081001','skill');
      await ensureCharacterDetailScript_('/ui/kinojo-character-daevanion-bridge.js?cache=2026081002','daevanion');
      if(!window.KinojoCharacterReaction?.open)throw new Error('CHARACTER_DETAIL_MODAL_UNAVAILABLE');
      return true;
    })().catch(error=>{kinojoCharacterDetailLoaderPromise=null;throw error;});
    return kinojoCharacterDetailLoaderPromise;
  }
  function myInfoCharacterRowData_(row){
    const characterId=Number(row?.dataset?.characterId||0);
    const characters=Array.isArray(kinojoMyCharactersState.data?.characters)?kinojoMyCharactersState.data.characters:[];
    return characters.find(item=>Number(item?.characterId||0)===characterId)||null;
  }
  async function openMyInfoCharacterDetail_(row){
    if(!row||!window.KinojoAuth?.getSession?.())return false;
    let item=myInfoCharacterRowData_(row);
    if(!item){
      await loadMyInfoCharacters_(true);
      item=myInfoCharacterRowData_(row);
    }
    if(!item)return false;
    closeMyInfoPanel();
    try{
      await ensureCharacterDetailModal_();
      const ownerName=item.isMain===true?String(item.characterName||''):String(kinojoMyCharactersState.data?.owner?.mainCharacterName||'');
      const classIcon=classIconFor_(item.className);
      window.KinojoCharacterReaction.open({
        source:'hall',
        context:'my-info',
        target:{
          name:String(item.characterName||''),
          owner:ownerName,
          className:String(item.className||''),
          server:String(item.serverName||''),
          serverId:item.serverId||'',
          pvePower:item.displayCombatPower??'',
          pvpPower:item.displayItemLevel??'',
          profileImageUrl:String(item.officialProfileImageUrl||''),
          classIconUrl:classIcon,
          detailUrl:String(item.detailUrl||'')
        }
      });
      return true;
    }catch(error){
      console.warn('KINOJO My Info character detail open failed:',error);
      toast('캐릭터 상세 정보를 불러오지 못했습니다.');
      return false;
    }
  }
  const KINOJO_PROFILE_IMAGE_MAX_BYTES=5*1024*1024;
  const KINOJO_PROFILE_IMAGE_MIME_TYPES=new Set(['image/jpeg','image/png','image/webp']);
  const kinojoMyProfileUiState={token:'',selectedCharacterId:0,bootstrapByCharacter:Object.create(null),requestId:0,batchRequestId:0,batchPromise:null,batchData:null,imagePreloader:null,imagePreloaderBatch:null,imagePreloaderToken:'',imageBackgroundPromise:null,openRequestId:0,file:null,editedOutput:null,previewUrl:'',uploading:false};
  const KINOJO_REFERENCE_IMAGE_SLOTS=['FRONT','BACK','UPPER_BODY'];
  const KINOJO_REFERENCE_GUIDE_ASSETS={FRONT:'/assets/images/my-info/guides/front-2x3.png',BACK:'/assets/images/my-info/guides/back-2x3.png',UPPER_BODY:'/assets/images/my-info/guides/upper-body-4x5.png'};
  const KINOJO_IMAGE_REQUEST_STYLES={SHONEN_MANGA:'소년만화 스타일',ROMANCE_MANGA:'순정만화 스타일',ANIMATION:'애니메이션 스타일',REALISTIC:'실사풍 스타일',CUSTOM:'직접 요청'};
  const kinojoMyReferencePickerState={characterId:0,activeSlot:'',filesBySlot:Object.create(null),outputsBySlot:Object.create(null),previewUrlsBySlot:Object.create(null),stateByCharacter:Object.create(null),requestId:0,uploadingSlot:'',submitting:false,resume:null,lastSubmission:null,requestStateByCharacter:Object.create(null),requestStateId:0};
  let kinojoMyImageToolsPromise=null;
  function ensureMyInfoImageStyle_(href,key){
    if(document.querySelector('link[data-kinojo-my-info-tool-style="'+key+'"],link[href*="'+href.split('/').pop().split('?')[0]+'"]'))return Promise.resolve(true);
    return new Promise((resolve,reject)=>{
      const link=document.createElement('link');
      link.rel='stylesheet';link.href=href;link.dataset.kinojoMyInfoToolStyle=key;
      link.addEventListener('load',()=>resolve(true),{once:true});
      link.addEventListener('error',()=>reject(new Error('MY_INFO_IMAGE_STYLE_LOAD_FAILED:'+key)),{once:true});
      document.head.appendChild(link);
    });
  }
  function ensureMyInfoImageScript_(src,key,ready){
    if(ready())return Promise.resolve(true);
    const existing=Array.from(document.scripts).find(script=>String(script.src||'').includes('/ui/'+src.split('/').pop().split('?')[0]));
    if(existing)return new Promise((resolve,reject)=>{
      const done=()=>ready()?resolve(true):reject(new Error('MY_INFO_IMAGE_SCRIPT_NOT_READY:'+key));
      existing.addEventListener('load',done,{once:true});
      existing.addEventListener('error',()=>reject(new Error('MY_INFO_IMAGE_SCRIPT_LOAD_FAILED:'+key)),{once:true});
      setTimeout(done,1200);
    });
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=src;script.async=false;script.dataset.kinojoMyInfoToolScript=key;
      script.addEventListener('load',()=>ready()?resolve(true):reject(new Error('MY_INFO_IMAGE_SCRIPT_NOT_READY:'+key)),{once:true});
      script.addEventListener('error',()=>reject(new Error('MY_INFO_IMAGE_SCRIPT_LOAD_FAILED:'+key)),{once:true});
      document.head.appendChild(script);
    });
  }
  function ensureMyInfoImageTools_(){
    if(window.KinojoMyInfoImageContract&&window.KinojoRangeControl&&window.KinojoMyInfoImageEditor&&window.KinojoMyInfoImageUpload&&window.KinojoMyInfoImageRequest&&window.KinojoMyInfoBatchBootstrap&&window.KinojoMyInfoImagePreloader)return Promise.resolve(true);
    if(kinojoMyImageToolsPromise)return kinojoMyImageToolsPromise;
    kinojoMyImageToolsPromise=(async()=>{
      await ensureMyInfoImageStyle_('/ui/kinojo-components.css?cache=2026082101','components');
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-image-contract.js?cache=2026082304','contract',()=>!!window.KinojoMyInfoImageContract);
      await ensureMyInfoImageScript_('/ui/kinojo-range-control.js?cache=2026082101','range',()=>!!window.KinojoRangeControl);
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-image-editor.js?cache=2026082103','editor',()=>!!window.KinojoMyInfoImageEditor);
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-image-upload.js?cache=2026082101','upload',()=>!!window.KinojoMyInfoImageUpload);
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-image-request.js?cache=2026082601','image-request',()=>!!window.KinojoMyInfoImageRequest);
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-batch-bootstrap.js?cache=2026082101','batch-bootstrap',()=>!!window.KinojoMyInfoBatchBootstrap);
      await ensureMyInfoImageScript_('/ui/kinojo-my-info-image-preloader.js?cache=2026082101','image-preloader',()=>!!window.KinojoMyInfoImagePreloader);
      return true;
    })().catch(error=>{kinojoMyImageToolsPromise=null;throw error;});
    return kinojoMyImageToolsPromise;
  }
  function setMyInfoReferenceStatus_(message,state='info'){
    const host=q('#kinojoMyInfoReferenceStatus');
    if(!host)return;
    host.dataset.state=state;
    host.textContent=message||'';
  }
  function myInfoSelectedRequestResults_(){
    return KINOJO_REFERENCE_IMAGE_SLOTS.map(slot=>kinojoMyReferencePickerState.outputsBySlot[slot]).filter(Boolean);
  }
  function invalidateMyInfoImageRequestResume_(){
    kinojoMyReferencePickerState.resume=null;
  }
  function setMyInfoImageRequestStatus_(message,state='info'){
    const host=q('#kinojoMyInfoRequestStatus');
    if(!host)return;
    host.dataset.state=state;
    host.textContent=message||'';
  }
  function myInfoImageRequestStyleLabel_(code){
    return code?KINOJO_IMAGE_REQUEST_STYLES[String(code)]||String(code):'스타일 지정 없음';
  }
  function myInfoImageRequestDate_(value){
    const date=new Date(String(value||''));
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date):'-';
  }
  function renderMyInfoImageRequest_(){
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const ready=Number.isInteger(characterId)&&characterId>0&&!!myInfoSessionToken_()&&kinojoMyReferencePickerState.characterId===characterId;
    const selectedCount=myInfoSelectedRequestResults_().length;
    const busy=kinojoMyReferencePickerState.submitting===true;
    const style=q('input[name="kinojoMyInfoRequestStyle"]:checked')?.value||'';
    const note=q('#kinojoMyInfoRequestNote');
    const counter=q('#kinojoMyInfoRequestNoteCount');
    const submit=q('#kinojoMyInfoRequestSubmitBtn');
    const summary=q('#kinojoMyInfoRequestSelectionSummary');
    if(summary)summary.textContent='선택 '+selectedCount+'/3';
    if(counter)counter.textContent=String((note?.value||'').length)+'/300';
    document.querySelectorAll('input[name="kinojoMyInfoRequestStyle"]').forEach(input=>{input.disabled=!ready||busy;});
    if(note){note.disabled=!ready||busy;note.setAttribute('aria-required',style==='CUSTOM'?'true':'false');}
    if(submit){
      submit.disabled=!ready||selectedCount<1||busy;
      submit.textContent=busy?'전송 중...':kinojoMyReferencePickerState.resume?'전송 다시 시도':'이미지 제작 요청 보내기';
    }
    const resultHost=q('#kinojoMyInfoRequestResult');
    if(!resultHost)return;
    const local=kinojoMyReferencePickerState.lastSubmission;
    const remote=kinojoMyReferencePickerState.requestStateByCharacter[characterId];
    const request=Number(local?.characterId)===characterId?local.request:(Array.isArray(remote?.requests)?remote.requests[0]:null);
    if(!request){resultHost.hidden=true;resultHost.innerHTML='';return;}
    const status=String(request.status||'');
    const slots=Array.isArray(request.slots)?request.slots.join(' · '):'';
    resultHost.hidden=false;
    resultHost.innerHTML='<strong>'+(status==='SUBMITTED'?'제작 요청 접수 완료':'전송 준비 상태')+'</strong><span>'+escapeHtml(myInfoImageRequestStyleLabel_(request.styleCode))+' · '+escapeHtml(slots||'이미지 확인 중')+'</span><small>이미지 보관 '+escapeHtml(myInfoImageRequestDate_(request.imageExpiresAt))+'까지 · 요청 #'+escapeHtml(String(request.requestId||''))+'</small>';
  }
  function renderMyInfoReferencePicker_(){
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const ready=Number.isInteger(characterId)&&characterId>0&&!!myInfoSessionToken_()&&kinojoMyReferencePickerState.characterId===characterId;
    const serverState=kinojoMyReferencePickerState.stateByCharacter[characterId]||null;
    const references=Array.isArray(serverState?.references)?serverState.references:[];
    const section=q('#kinojoMyInfoReferenceSection');
    const head=q('#kinojoMyInfoReferenceHeadMeta');
    if(section)section.setAttribute('aria-disabled',ready?'false':'true');
    const selectedCount=myInfoSelectedRequestResults_().length;
    if(head)head.textContent=ready?'선택 '+selectedCount+'/3 · 비공개 · 최대 7일 보관':'캐릭터 선택 후 슬롯 선택';
    document.querySelectorAll('#kinojoMyInfoReferenceGrid [data-reference-slot]').forEach(card=>{
      const slot=String(card.dataset.referenceSlot||'');
      const file=kinojoMyReferencePickerState.filesBySlot[slot]||null;
      const active=references.find(item=>item?.slot===slot&&item?.active===true)||null;
      const selected=kinojoMyReferencePickerState.activeSlot===slot;
      const busy=!!kinojoMyReferencePickerState.uploadingSlot||kinojoMyReferencePickerState.submitting===true;
      card.setAttribute('aria-disabled',(!ready||busy)?'true':'false');
      card.classList.toggle('is-selected',selected||!!file);
      card.classList.toggle('is-registered',!!active);
      card.classList.toggle('is-pending',!!file);
      const visual=card.querySelector('[data-reference-visual]')||card;
      let preview=card.querySelector('[data-reference-preview]');
      const guide=card.querySelector('[data-reference-guide]');
      const previewUrl=String(kinojoMyReferencePickerState.previewUrlsBySlot[slot]||'');
      if(previewUrl){
        if(!preview){
          preview=document.createElement('img');
          preview.setAttribute('data-reference-preview','');
          preview.className='kinojo-my-info-reference-preview-image';
          visual.appendChild(preview);
        }
        preview.src=previewUrl;
        preview.alt=slot+' 참고 이미지 로컬 미리보기';
        preview.hidden=false;
        if(guide)guide.hidden=true;
      }else{
        if(preview){preview.removeAttribute('src');preview.hidden=true;}
        if(guide)guide.hidden=false;
      }
      const status=card.querySelector('[data-reference-file-status]');
      if(status){
        if(file)status.textContent='WEBP · '+myInfoProfileFileSize_(file.size)+' · 제작 요청 대기';
        else if(active){
          const expiry=String(active.expiresAt||'');
          const remaining=Math.max(0,Math.ceil((new Date(expiry).getTime()-Date.now())/86400000));
          status.textContent='등록됨 · '+(remaining>0?'약 '+remaining+'일 남음':'만료 처리 중');
        }else status.textContent='등록된 이미지 없음';
      }
      const select=card.querySelector('[data-reference-select-slot]');
      const cancel=card.querySelector('[data-reference-cancel-slot]');
      const remove=card.querySelector('[data-reference-delete-slot]');
      if(select){select.disabled=!ready||busy;select.textContent=file?'다시 선택':'이미지 선택';}
      if(cancel){cancel.hidden=!file;cancel.disabled=busy;}
      if(remove){remove.hidden=!active||!!file;remove.disabled=busy;}
    });
    renderMyInfoImageRequest_();
  }
  function resetMyInfoReferencePicker_(characterId=0){
    const id=Number(characterId||0);
    kinojoMyReferencePickerState.characterId=Number.isInteger(id)&&id>0?id:0;
    kinojoMyReferencePickerState.activeSlot='';
    Object.values(kinojoMyReferencePickerState.previewUrlsBySlot||{}).forEach(url=>{
      if(url){try{URL.revokeObjectURL(url);}catch(_err){}}
    });
    kinojoMyReferencePickerState.filesBySlot=Object.create(null);
    kinojoMyReferencePickerState.outputsBySlot=Object.create(null);
    kinojoMyReferencePickerState.previewUrlsBySlot=Object.create(null);
    kinojoMyReferencePickerState.uploadingSlot='';
    kinojoMyReferencePickerState.submitting=false;
    kinojoMyReferencePickerState.resume=null;
    kinojoMyReferencePickerState.lastSubmission=null;
    closeMyInfoStyleConfirm_(false);
    document.querySelectorAll('input[name="kinojoMyInfoRequestStyle"]').forEach(input=>{input.checked=false;input.disabled=!kinojoMyReferencePickerState.characterId;});
    const requestNote=q('#kinojoMyInfoRequestNote');
    if(requestNote){requestNote.value='';requestNote.removeAttribute('aria-invalid');}
    const input=q('#kinojoMyInfoReferenceFileInput');
    if(input)input.value='';
    clearMyInfoReferenceDragState_();
    renderMyInfoReferencePicker_();
    if(kinojoMyReferencePickerState.characterId>0){
      const row=myInfoProfileCharacters_().find(item=>Number(item?.characterId||0)===kinojoMyReferencePickerState.characterId);
      setMyInfoReferenceStatus_((row?.characterName?String(row.characterName)+' · ':'')+'참고 이미지 상태를 확인하는 중입니다.','loading');
      setMyInfoImageRequestStatus_('참고 이미지 1~3장을 선택한 뒤 스타일과 요청 내용을 확인해 주세요.','info');
    }else{
      setMyInfoReferenceStatus_('캐릭터를 선택하면 슬롯별 이미지를 고를 수 있습니다.','info');
      setMyInfoImageRequestStatus_('참고 이미지를 선택하면 제작 요청을 보낼 수 있습니다.','info');
    }
  }
  function syncMyInfoReferenceCharacter_(characterId){
    const id=Number(characterId||0);
    if(!Number.isInteger(id)||id<=0){resetMyInfoReferencePicker_(0);return;}
    if(kinojoMyReferencePickerState.characterId!==id){resetMyInfoReferencePicker_(id);return;}
    renderMyInfoReferencePicker_();
  }
  async function loadMyInfoReferenceState_(characterId,force=false){
    const token=myInfoSessionToken_();
    const id=Number(characterId||0);
    if(!token||!Number.isInteger(id)||id<=0)return null;
    if(!force&&kinojoMyReferencePickerState.stateByCharacter[id]){
      const cached=kinojoMyReferencePickerState.stateByCharacter[id];
      renderMyInfoReferencePicker_();
      return cached;
    }
    const client=window.KinojoSupabaseClientCore;
    const requestId=++kinojoMyReferencePickerState.requestId;
    setMyInfoReferenceStatus_('비공개 참고 이미지 등록 상태를 확인하는 중입니다.','loading');
    try{
      await ensureMyInfoImageTools_();
      const data=await window.KinojoMyInfoImageUpload.referenceState({client,sessionToken:token,characterId:id});
      if(requestId!==kinojoMyReferencePickerState.requestId||myInfoSessionToken_()!==token||Number(kinojoMyProfileUiState.selectedCharacterId)!==id)return null;
      kinojoMyReferencePickerState.stateByCharacter[id]=data;
      renderMyInfoReferencePicker_();
      const count=data.references.filter(item=>item?.active===true).length;
      setMyInfoReferenceStatus_(count?count+'개 슬롯이 비공개 등록되어 있습니다. 슬롯을 눌러 교체하거나 삭제할 수 있습니다.':'등록된 참고 이미지가 없습니다. 슬롯을 눌러 촬영 이미지를 편집해 주세요.','ready');
      return data;
    }catch(error){
      if(requestId===kinojoMyReferencePickerState.requestId&&myInfoSessionToken_()===token){
        delete kinojoMyReferencePickerState.stateByCharacter[id];
        renderMyInfoReferencePicker_();
        setMyInfoReferenceStatus_('참고 이미지 등록 상태를 불러오지 못했습니다. 다시 시도해 주세요.','error');
      }
      console.warn('KINOJO My Info reference state failed:',error);
      return null;
    }
  }
  function selectMyInfoReferenceSlot_(slot){
    const key=String(slot||'').trim();
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(key)||!Number.isInteger(characterId)||characterId<=0||kinojoMyReferencePickerState.characterId!==characterId)return false;
    const input=q('#kinojoMyInfoReferenceFileInput');
    if(!input)return false;
    kinojoMyReferencePickerState.activeSlot=key;
    input.value='';
    setMyInfoReferenceStatus_(key+' 슬롯에 넣을 이미지 파일을 선택해 주세요.','info');
    input.click();
    return true;
  }
  async function handleMyInfoReferenceFile_(file){
    const slot=String(kinojoMyReferencePickerState.activeSlot||'');
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot)||kinojoMyReferencePickerState.characterId!==characterId)return false;
    if(!file){
      setMyInfoReferenceStatus_(slot+' 이미지 선택을 취소했습니다.','info');
      return false;
    }
    const mime=String(file.type||'').trim().toLowerCase();
    if(!KINOJO_PROFILE_IMAGE_MIME_TYPES.has(mime)){
      setMyInfoReferenceStatus_(slot+' · JPEG, PNG, WebP 이미지만 선택할 수 있습니다.','error');
      return false;
    }
    if(!Number.isFinite(file.size)||file.size<1||file.size>KINOJO_PROFILE_IMAGE_MAX_BYTES){
      setMyInfoReferenceStatus_(slot+' · 참고 이미지는 5MB 이하만 선택할 수 있습니다.','error');
      return false;
    }
    try{
      setMyInfoReferenceStatus_(slot+' 편집기를 준비하는 중입니다.','loading');
      await ensureMyInfoImageTools_();
      await window.KinojoMyInfoImageEditor.open({
        slot,file,
        onConfirm(result){
          const edited=window.KinojoMyInfoImageUpload.validateEditedOutput(result,window.KinojoMyInfoImageContract);
          const oldUrl=String(kinojoMyReferencePickerState.previewUrlsBySlot[slot]||'');
          if(oldUrl){try{URL.revokeObjectURL(oldUrl);}catch(_err){}}
          const previewUrl=URL.createObjectURL(edited.blob);
          kinojoMyReferencePickerState.filesBySlot[slot]=result.file||edited.blob;
          kinojoMyReferencePickerState.outputsBySlot[slot]=result;
          kinojoMyReferencePickerState.previewUrlsBySlot[slot]=previewUrl;
          kinojoMyReferencePickerState.activeSlot=slot;
          invalidateMyInfoImageRequestResume_();
          renderMyInfoReferencePicker_();
          setMyInfoReferenceStatus_(slot+' · WebP '+edited.definition.outputWidth+'×'+edited.definition.outputHeight+' · '+myInfoProfileFileSize_(edited.sizeBytes)+' 편집 결과를 로컬에 준비했습니다.','preview');
          setMyInfoImageRequestStatus_('참고 이미지 '+myInfoSelectedRequestResults_().length+'장을 선택했습니다. 스타일과 추가 요청을 확인해 주세요.','info');
        },
        onClose(detail){
          if(detail?.reason!=='confirm'&&!kinojoMyReferencePickerState.outputsBySlot[slot])setMyInfoReferenceStatus_(slot+' 이미지 편집을 취소했습니다. 원본은 저장되거나 업로드되지 않았습니다.','info');
        },
        onError(error){console.warn('KINOJO My Info reference editor failed:',error);}
      });
    }catch(error){
      setMyInfoReferenceStatus_(slot+' 이미지 편집기를 열지 못했습니다. 다른 이미지를 선택해 주세요.','error');
      console.warn('KINOJO My Info reference file failed:',error);
      return false;
    }
    return true;
  }
  function clearMyInfoReferencePreview_(slotValue,message=''){
    const slot=String(slotValue||kinojoMyReferencePickerState.activeSlot||'');
    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot))return false;
    const url=String(kinojoMyReferencePickerState.previewUrlsBySlot[slot]||'');
    if(url){try{URL.revokeObjectURL(url);}catch(_err){}}
    delete kinojoMyReferencePickerState.previewUrlsBySlot[slot];
    delete kinojoMyReferencePickerState.filesBySlot[slot];
    delete kinojoMyReferencePickerState.outputsBySlot[slot];
    invalidateMyInfoImageRequestResume_();
    const input=q('#kinojoMyInfoReferenceFileInput');
    if(input)input.value='';
    renderMyInfoReferencePicker_();
    if(message)setMyInfoReferenceStatus_(message,'info');
    setMyInfoImageRequestStatus_(myInfoSelectedRequestResults_().length?'참고 이미지 '+myInfoSelectedRequestResults_().length+'장을 선택했습니다.':'참고 이미지를 최소 1장 선택해 주세요.','info');
    return true;
  }
  function openMyInfoStyleConfirm_(){
    const layer=q('#kinojoMyInfoStyleConfirm');
    if(!layer||kinojoMyReferencePickerState.submitting)return false;
    kinojoMyInfoFocusState.requestConfirmReturn=document.activeElement instanceof HTMLElement?document.activeElement:q('#kinojoMyInfoRequestSubmitBtn');
    layer.hidden=false;
    layer.setAttribute('aria-hidden','false');
    focusMyInfoElement_(q('#kinojoMyInfoStyleConfirmChooseBtn')||q('.kinojo-my-info-request-confirm__dialog',layer));
    return true;
  }
  function closeMyInfoStyleConfirm_(restoreFocus=true){
    const layer=q('#kinojoMyInfoStyleConfirm');
    const wasOpen=!!layer&&!layer.hidden;
    const returnFocus=kinojoMyInfoFocusState.requestConfirmReturn;
    if(layer){layer.hidden=true;layer.setAttribute('aria-hidden','true');}
    kinojoMyInfoFocusState.requestConfirmReturn=null;
    if(wasOpen&&restoreFocus)focusMyInfoElement_(returnFocus||q('#kinojoMyInfoRequestSubmitBtn'));
    return wasOpen;
  }
  async function loadMyInfoImageRequestState_(characterId,force=false){
    const token=myInfoSessionToken_();
    const id=Number(characterId||0);
    if(!token||!Number.isInteger(id)||id<=0)return null;
    if(!force&&kinojoMyReferencePickerState.requestStateByCharacter[id])return kinojoMyReferencePickerState.requestStateByCharacter[id];
    const requestId=++kinojoMyReferencePickerState.requestStateId;
    try{
      await ensureMyInfoImageTools_();
      const state=await window.KinojoMyInfoImageRequest.state({client:window.KinojoSupabaseClientCore,sessionToken:token,characterId:id});
      if(requestId!==kinojoMyReferencePickerState.requestStateId||myInfoSessionToken_()!==token||Number(kinojoMyProfileUiState.selectedCharacterId)!==id)return null;
      kinojoMyReferencePickerState.requestStateByCharacter[id]=state;
      renderMyInfoImageRequest_();
      return state;
    }catch(error){
      console.warn('KINOJO My Info image request state failed:',error);
      return null;
    }
  }
  function setMyInfoImageRequestSubmitting_(value){
    kinojoMyReferencePickerState.submitting=value===true;
    renderMyInfoProfileCharacterButtons_();
    renderMyInfoReferencePicker_();
    const profile=kinojoMyProfileUiState.bootstrapByCharacter[Number(kinojoMyProfileUiState.selectedCharacterId||0)]||null;
    renderMyInfoProfileCurrent_(profile);
    ['#kinojoMyInfoProfileUploadBtn','#kinojoMyInfoProfileCancelBtn','#kinojoMyInfoProfileRetryBtn'].forEach(selector=>{const button=q(selector);if(button&&!button.hidden)button.disabled=value===true;});
    q('#kinojoMyInfoModal')?.classList.toggle('is-request-submitting',value===true);
  }
  async function submitMyInfoImageRequest_(options={}){
    if(kinojoMyReferencePickerState.submitting)return false;
    const results=myInfoSelectedRequestResults_();
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const sessionToken=myInfoSessionToken_();
    if(!results.length){
      setMyInfoImageRequestStatus_('참고 이미지를 최소 1장 선택해 주세요.','error');
      focusMyInfoElement_(q('[data-reference-select-slot="FRONT"]'));
      return false;
    }
    const styleCode=q('input[name="kinojoMyInfoRequestStyle"]:checked')?.value||null;
    const note=q('#kinojoMyInfoRequestNote');
    const requestNote=String(note?.value||'').trim();
    if(styleCode==='CUSTOM'&&!requestNote){
      setMyInfoImageRequestStatus_('직접 요청을 선택한 경우 원하는 스타일을 입력해 주세요.','error');
      note?.setAttribute('aria-invalid','true');
      focusMyInfoElement_(note);
      return false;
    }
    if(!styleCode&&options.allowNoStyle!==true){
      openMyInfoStyleConfirm_();
      return false;
    }
    closeMyInfoStyleConfirm_(false);
    if(note)note.removeAttribute('aria-invalid');
    setMyInfoImageRequestSubmitting_(true);
    setMyInfoImageRequestStatus_('제작 요청을 안전하게 준비하는 중입니다.','loading');
    try{
      await ensureMyInfoImageTools_();
      const submitted=await window.KinojoMyInfoImageRequest.submit({
        client:window.KinojoSupabaseClientCore,sessionToken,characterId,styleCode,requestNote,results,
        contract:window.KinojoMyInfoImageContract,uploadApi:window.KinojoMyInfoImageUpload,resume:kinojoMyReferencePickerState.resume,
        onProgress(progress){
          if(progress?.resume)kinojoMyReferencePickerState.resume=progress.resume;
          if(progress?.stage==='uploading'||progress?.stage==='uploaded')setMyInfoImageRequestStatus_('참고 이미지 '+Number(progress.completed||0)+'/'+Number(progress.total||results.length)+' 전송 중입니다.','loading');
          else if(progress?.stage==='finalizing')setMyInfoImageRequestStatus_('이미지 전송을 마쳤습니다. 제작 요청을 최종 확인하는 중입니다.','loading');
        }
      });
      kinojoMyReferencePickerState.lastSubmission={characterId,request:submitted.request};
      kinojoMyReferencePickerState.requestStateByCharacter[characterId]={ok:true,characterId,requestCount:1,requests:[submitted.request]};
      KINOJO_REFERENCE_IMAGE_SLOTS.forEach(slot=>{
        const url=String(kinojoMyReferencePickerState.previewUrlsBySlot[slot]||'');
        if(url){try{URL.revokeObjectURL(url);}catch(_error){}}
      });
      kinojoMyReferencePickerState.filesBySlot=Object.create(null);
      kinojoMyReferencePickerState.outputsBySlot=Object.create(null);
      kinojoMyReferencePickerState.previewUrlsBySlot=Object.create(null);
      kinojoMyReferencePickerState.resume=null;
      document.querySelectorAll('input[name="kinojoMyInfoRequestStyle"]').forEach(input=>{input.checked=false;});
      if(note){note.value='';note.removeAttribute('aria-invalid');}
      delete kinojoMyReferencePickerState.stateByCharacter[characterId];
      await loadMyInfoReferenceState_(characterId,true).catch(()=>null);
      setMyInfoImageRequestStatus_('제작 요청이 접수되었습니다. 이미지는 최대 7일 동안 비공개로 보관됩니다.','ready');
      renderMyInfoReferencePicker_();
      return true;
    }catch(error){
      if(error?.resume)kinojoMyReferencePickerState.resume=error.resume;
      const completed=Array.isArray(kinojoMyReferencePickerState.resume?.uploadedSlots)?kinojoMyReferencePickerState.resume.uploadedSlots.length:0;
      setMyInfoImageRequestStatus_(completed?'일부 이미지('+completed+'/'+results.length+') 전송 후 멈췄습니다. 전송 다시 시도를 눌러 이어서 보내 주세요.':'제작 요청 전송에 실패했습니다. 같은 요청으로 다시 시도할 수 있습니다.','error');
      console.warn('KINOJO My Info image request submit failed:',error);
      return false;
    }finally{
      setMyInfoImageRequestSubmitting_(false);
    }
  }
  async function deleteMyInfoReference_(slotValue){
    const slot=String(slotValue||kinojoMyReferencePickerState.activeSlot||'').trim();
    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot))return false;
    kinojoMyReferencePickerState.activeSlot=slot;
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const token=myInfoSessionToken_();
    if(kinojoMyReferencePickerState.uploadingSlot||kinojoMyReferencePickerState.submitting||!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot)||!token||!Number.isInteger(characterId)||characterId<=0)return false;
    if(!window.confirm(slot+' 비공개 참고 이미지를 삭제할까요? 삭제한 파일은 복구할 수 없습니다.'))return false;
    kinojoMyReferencePickerState.uploadingSlot=slot;
    renderMyInfoReferencePicker_();
    try{
      setMyInfoReferenceStatus_(slot+' 등록 이미지와 메타데이터를 삭제하는 중입니다.','loading');
      await ensureMyInfoImageTools_();
      await window.KinojoMyInfoImageUpload.deleteReference({client:window.KinojoSupabaseClientCore,sessionToken:token,characterId,slot,contract:window.KinojoMyInfoImageContract});
      clearMyInfoReferencePreview_(slot);
      delete kinojoMyReferencePickerState.stateByCharacter[characterId];
      await loadMyInfoReferenceState_(characterId,true);
      setMyInfoReferenceStatus_(slot+' 참고 이미지와 등록 메타데이터를 삭제했습니다.','ready');
      return true;
    }catch(error){
      delete kinojoMyReferencePickerState.stateByCharacter[characterId];
      await loadMyInfoReferenceState_(characterId,true).catch(()=>null);
      setMyInfoReferenceStatus_(slot+' 삭제 결과를 확인하지 못했습니다. 현재 등록 상태를 다시 확인했습니다.','error');
      console.warn('KINOJO My Info reference delete failed:',error);
      return false;
    }finally{
      kinojoMyReferencePickerState.uploadingSlot='';
      renderMyInfoReferencePicker_();
    }
  }
  function clearMyInfoReferenceDragState_(except=null){
    document.querySelectorAll('#kinojoMyInfoReferenceGrid [data-reference-slot].is-drag-over').forEach(button=>{
      if(button!==except)button.classList.remove('is-drag-over');
    });
  }
  function handleMyInfoReferenceDrag_(event){
    if(!(event?.target instanceof Element))return false;
    const button=event.target.closest('#kinojoMyInfoReferenceGrid [data-reference-slot]');
    if(!button||button.getAttribute('aria-disabled')==='true')return false;
    const slot=String(button.dataset.referenceSlot||'').trim();
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot)||kinojoMyReferencePickerState.characterId!==characterId)return false;
    if(event.type==='dragleave'){
      const next=event.relatedTarget;
      if(next instanceof Node&&button.contains(next))return true;
      button.classList.remove('is-drag-over');
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    if(event.type==='dragenter'||event.type==='dragover'){
      clearMyInfoReferenceDragState_(button);
      button.classList.add('is-drag-over');
      if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
      setMyInfoReferenceStatus_(slot+' 슬롯에 이미지를 놓아 주세요.','info');
      return true;
    }
    if(event.type==='drop'){
      clearMyInfoReferenceDragState_();
      kinojoMyReferencePickerState.activeSlot=slot;
      const file=event.dataTransfer?.files?.[0]||null;
      if(!file){
        setMyInfoReferenceStatus_(slot+' 슬롯에 놓인 파일을 확인하지 못했습니다.','info');
        return false;
      }
      handleMyInfoReferenceFile_(file).catch(()=>{});
      return true;
    }
    return false;
  }
  function myInfoProfileFileSize_(bytes){
    const value=Number(bytes||0);
    if(!Number.isFinite(value)||value<=0)return '0 B';
    if(value>=1024*1024)return (value/(1024*1024)).toFixed(value>=10*1024*1024?0:1)+' MB';
    if(value>=1024)return Math.round(value/1024)+' KB';
    return Math.round(value)+' B';
  }
  function setMyInfoProfileStatus_(message,state='info'){
    const host=q('#kinojoMyInfoProfileStatus');
    if(!host)return;
    host.dataset.state=state;
    host.textContent=message||'';
  }
  function clearMyInfoProfilePreview_(message=''){
    if(kinojoMyProfileUiState.previewUrl){
      try{URL.revokeObjectURL(kinojoMyProfileUiState.previewUrl);}catch(_err){}
    }
    kinojoMyProfileUiState.previewUrl='';
    kinojoMyProfileUiState.file=null;
    kinojoMyProfileUiState.editedOutput=null;
    const input=q('#kinojoMyInfoProfileFileInput');
    if(input)input.value='';
    const candidate=q('#kinojoMyInfoProfileCandidate');
    const image=q('#kinojoMyInfoProfileCandidateImage');
    const name=q('#kinojoMyInfoProfileCandidateName');
    const meta=q('#kinojoMyInfoProfileCandidateMeta');
    if(image){image.removeAttribute('src');image.hidden=true;}
    if(name)name.textContent='선택한 이미지';
    if(meta)meta.textContent='';
    if(candidate)candidate.hidden=true;
    const cancel=q('#kinojoMyInfoProfileCancelBtn');
    if(cancel){cancel.hidden=true;cancel.disabled=false;}
    const upload=q('#kinojoMyInfoProfileUploadBtn');
    if(upload){upload.hidden=true;upload.disabled=false;upload.textContent='업로드';}
    if(message)setMyInfoProfileStatus_(message,'info');
  }
  function resetMyInfoProfileUi_(){
    clearMyInfoProfilePreview_();
    kinojoMyProfileUiState.imagePreloader?.reset?.();
    kinojoMyProfileUiState.token='';
    kinojoMyProfileUiState.selectedCharacterId=0;
    kinojoMyProfileUiState.bootstrapByCharacter=Object.create(null);
    kinojoMyProfileUiState.uploading=false;
    kinojoMyProfileUiState.requestId+=1;
    kinojoMyProfileUiState.batchRequestId+=1;
    kinojoMyProfileUiState.batchPromise=null;
    kinojoMyProfileUiState.batchData=null;
    kinojoMyProfileUiState.imagePreloader=null;
    kinojoMyProfileUiState.imagePreloaderBatch=null;
    kinojoMyProfileUiState.imagePreloaderToken='';
    kinojoMyProfileUiState.imageBackgroundPromise=null;
    kinojoMyReferencePickerState.stateByCharacter=Object.create(null);
    kinojoMyReferencePickerState.requestId+=1;
    kinojoMyReferencePickerState.requestStateByCharacter=Object.create(null);
    kinojoMyReferencePickerState.requestStateId+=1;
    const picker=q('#kinojoMyInfoProfileCharacters');
    if(picker)picker.innerHTML='<span class="kinojo-my-info-profile-empty">캐릭터 정보를 불러오는 중입니다.</span>';
    renderMyInfoProfileCurrent_(null);
    resetMyInfoReferencePicker_(0);
  }
  function myInfoProfileCharacters_(){
    return Array.isArray(kinojoMyCharactersState.data?.characters)
      ? kinojoMyCharactersState.data.characters.filter(row=>Number(row?.characterId||0)>0)
      : [];
  }
  function updateMyInfoProfileCharacterOverflow_(){
    const host=q('#kinojoMyInfoProfileCharacters');
    const pane=host?.closest?.('.kinojo-my-info-profile-character-pane');
    if(!host||!pane)return;
    const overflow=host.scrollHeight>host.clientHeight+2;
    const maxScroll=Math.max(0,host.scrollHeight-host.clientHeight);
    pane.classList.toggle('is-overflowing',overflow);
    pane.classList.toggle('is-at-start',!overflow||host.scrollTop<=2);
    pane.classList.toggle('is-at-end',!overflow||host.scrollTop>=maxScroll-2);
  }
  function renderMyInfoProfileCharacterButtons_(){
    const host=q('#kinojoMyInfoProfileCharacters');
    if(!host)return;
    const characters=myInfoProfileCharacters_();
    if(!characters.length){
      host.innerHTML='<span class="kinojo-my-info-profile-empty">연결된 캐릭터가 없습니다.</span>';
      requestAnimationFrame(updateMyInfoProfileCharacterOverflow_);
      return;
    }
    const selected=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    host.innerHTML=characters.map(row=>{
      const id=Number(row.characterId||0);
      const icon=classIconFor_(row.className);
      const imageState=kinojoMyProfileUiState.imagePreloader?.getState?.(id)||null;
      const state=String(imageState?.status||'idle');
      const stateClass=state==='loading'?' is-image-loading':state==='error'?' is-image-error':state==='loaded'||state==='empty'?' is-image-ready':'';
      const stateLabel=state==='loading'?' · 이미지 준비 중':state==='error'?' · 이미지 재시도 필요':'';
      return '<button class="kinojo-my-info-profile-character-btn '+(id===selected?'is-selected':'')+stateClass+'" type="button" data-profile-character-id="'+id+'" data-image-load-state="'+escapeHtml(state)+'" aria-pressed="'+(id===selected?'true':'false')+'" '+(kinojoMyReferencePickerState.submitting?'disabled':'')+'>'
        +(icon?'<img src="'+escapeHtml(icon)+'" alt="" aria-hidden="true">':'<span class="is-empty" aria-hidden="true"></span>')
        +'<span><b>'+escapeHtml(String(row.characterName||'이름 없음'))+'</b><small>'+(row.isMain===true?'본캐':'부캐')+stateLabel+'</small></span>'
        +'</button>';
    }).join('');
    requestAnimationFrame(updateMyInfoProfileCharacterOverflow_);
  }
  function myInfoProfileImageState_(characterId){
    return kinojoMyProfileUiState.imagePreloader?.getState?.(Number(characterId||0))||null;
  }
  function renderMyInfoProfileRetry_(state){
    const retry=q('#kinojoMyInfoProfileRetryBtn');
    const failed=state?.status==='error';
    if(!retry)return;
    retry.hidden=!failed;
    retry.disabled=!failed||kinojoMyProfileUiState.uploading;
  }
  function renderMyInfoProfileCurrent_(data){
    const image=q('#kinojoMyInfoProfileCurrentImage');
    const placeholder=q('#kinojoMyInfoProfileCurrentPlaceholder');
    const source=q('#kinojoMyInfoProfileCurrentSource');
    const meta=q('#kinojoMyInfoProfileCurrentMeta');
    const select=q('#kinojoMyInfoProfileSelectBtn');
    const reset=q('#kinojoMyInfoProfileResetBtn');
    const profile=data?.ok===true?data.profile:null;
    const character=data?.ok===true?data.character:null;
    const imageState=myInfoProfileImageState_(data?.characterId||character?.characterId);
    const preloaderConnected=!!kinojoMyProfileUiState.imagePreloader;
    const url=preloaderConnected
      ? String(imageState?.url||'').trim()
      : String(profile?.effectiveProfileImageUrl||character?.officialProfileImageUrl||'').trim();
    const displayReady=!preloaderConnected||!url||imageState?.status==='loaded'||imageState?.status==='empty';
    if(image){
      if(url&&displayReady){image.src=url;image.alt=(character?.characterName||'캐릭터')+' 현재 프로필 이미지';image.hidden=false;}
      else{image.removeAttribute('src');image.alt='';image.hidden=true;}
    }
    if(placeholder){
      placeholder.hidden=!!url&&displayReady;
      if(imageState?.status==='loading'||imageState?.status==='idle')placeholder.textContent='이미지 준비 중';
      else if(imageState?.status==='error')placeholder.textContent='이미지 로드 실패';
      else placeholder.textContent='현재 이미지';
    }
    renderMyInfoProfileRetry_(imageState);
    if(source){
      source.textContent=data?.ok===true?(profile?.effectiveSource==='USER_OVERRIDE'?'사용자 이미지':'공식 이미지'):'현재 이미지 확인 중';
      source.dataset.source=data?.ok===true?String(profile?.effectiveSource||'OFFICIAL'):'LOADING';
    }
    if(meta){
      if(data?.ok===true){
        const kind=data.isMain===true?'본캐':'부캐';
        meta.textContent=String(character?.characterName||'')+' · '+kind+(profile?.hasOverride===true?' · 사용자 이미지 적용 중':'');
      }else meta.textContent='Server에서 현재 적용 이미지를 확인합니다.';
    }
    if(select){
      const blocked=data?.ok!==true;
      select.disabled=blocked||kinojoMyProfileUiState.uploading||kinojoMyReferencePickerState.submitting;
      select.textContent=profile?.hasOverride===true?'교체 이미지 선택':'이미지 선택';
      select.title=profile?.hasOverride===true?'새 이미지를 선택하면 기존 사용자 이미지를 안전하게 교체합니다.':'';
    }
    if(reset){
      const canReset=data?.ok===true&&profile?.hasOverride===true;
      reset.hidden=!canReset;
      reset.disabled=!canReset||kinojoMyProfileUiState.uploading||kinojoMyReferencePickerState.submitting;
      reset.textContent=kinojoMyProfileUiState.uploading?'처리 중...':'공식 이미지로 복원';
      reset.title=canReset?'사용자 Override만 제거하고 현재 공식 프로필 이미지로 돌아갑니다.':'';
    }
  }
  function renderMyInfoProfileStatusForData_(data){
    const imageState=myInfoProfileImageState_(data?.characterId||data?.character?.characterId);
    renderMyInfoProfileRetry_(imageState);
    if(imageState?.status==='loading'||imageState?.status==='idle'){
      setMyInfoProfileStatus_('선택한 캐릭터의 실제 프로필 이미지를 준비하는 중입니다.','loading');
      return;
    }
    if(imageState?.status==='error'){
      setMyInfoProfileStatus_('이 캐릭터의 프로필 이미지를 준비하지 못했습니다. 다시 시도해 주세요.','error');
      return;
    }
    if(data?.ok===true&&data.profile?.hasOverride===true)setMyInfoProfileStatus_('현재 사용자 이미지가 적용 중입니다. 교체하거나 공식 이미지로 복원할 수 있습니다.','ready');
    else if(data?.ok===true)setMyInfoProfileStatus_('JPEG · PNG · WebP / 5MB 이하 이미지를 선택해 미리볼 수 있습니다.','ready');
    else setMyInfoProfileStatus_('현재 프로필 이미지 상태를 확인하지 못했습니다.','error');
  }
  function syncMyInfoImagePreloader_(batch,token){
    if(!batch||!window.KinojoMyInfoImagePreloader?.create)return null;
    if(kinojoMyProfileUiState.imagePreloader&&kinojoMyProfileUiState.imagePreloaderBatch===batch&&kinojoMyProfileUiState.imagePreloaderToken===token)return kinojoMyProfileUiState.imagePreloader;
    kinojoMyProfileUiState.imagePreloader?.reset?.();
    const loader=window.KinojoMyInfoImagePreloader.create({
      onStateChange(state){
        renderMyInfoProfileCharacterButtons_();
        if(Number(kinojoMyProfileUiState.selectedCharacterId)!==Number(state?.characterId)||kinojoMyProfileUiState.uploading||kinojoMyProfileUiState.editedOutput)return;
        const data=kinojoMyProfileUiState.bootstrapByCharacter[Number(state.characterId)]||null;
        renderMyInfoProfileCurrent_(data);
        renderMyInfoProfileStatusForData_(data);
      }
    });
    kinojoMyProfileUiState.imagePreloader=loader;
    kinojoMyProfileUiState.imagePreloaderBatch=batch;
    kinojoMyProfileUiState.imagePreloaderToken=token;
    loader.configure({characters:batch.characters?.characters,profileByCharacter:batch.profileByCharacter});
    return loader;
  }
  async function refreshMyInfoProfileImage_(characterId,data){
    const loader=kinojoMyProfileUiState.imagePreloader;
    if(!loader)return null;
    loader.update(characterId,data);
    try{return await loader.retry(characterId);}catch(_error){return null;}
  }
  async function loadMyInfoProfileBootstrap_(characterId,force=false){
    const token=myInfoSessionToken_();
    const id=Number(characterId||0);
    if(!token||!Number.isInteger(id)||id<=0)return null;
    if(kinojoMyProfileUiState.token!==token){
      resetMyInfoProfileUi_();
      kinojoMyProfileUiState.token=token;
      kinojoMyProfileUiState.selectedCharacterId=id;
    }
    if(!force&&kinojoMyProfileUiState.bootstrapByCharacter[id]){
      const cached=kinojoMyProfileUiState.bootstrapByCharacter[id];
      renderMyInfoProfileCurrent_(cached);
      return cached;
    }
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      renderMyInfoProfileCurrent_(null);
      setMyInfoProfileStatus_('서버 연결을 준비하는 중입니다.','loading');
      return null;
    }
    const requestId=++kinojoMyProfileUiState.requestId;
    renderMyInfoProfileCurrent_(null);
    setMyInfoProfileStatus_('현재 프로필 이미지를 확인하는 중입니다.','loading');
    try{
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'profile-bootstrap',sessionToken:token,characterId:id});
      if(requestId!==kinojoMyProfileUiState.requestId||myInfoSessionToken_()!==token||Number(kinojoMyProfileUiState.selectedCharacterId)!==id)return null;
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'PROFILE_BOOTSTRAP_FAILED');
      kinojoMyProfileUiState.bootstrapByCharacter[id]=data;
      await refreshMyInfoProfileImage_(id,data);
      renderMyInfoProfileCurrent_(data);
      renderMyInfoProfileStatusForData_(data);
      return data;
    }catch(error){
      if(requestId===kinojoMyProfileUiState.requestId&&myInfoSessionToken_()===token){
        renderMyInfoProfileCurrent_(null);
        setMyInfoProfileStatus_('현재 프로필 이미지를 불러오지 못했습니다.','error');
      }
      console.warn('KINOJO My Info profile bootstrap failed:',error);
      return null;
    }
  }
  function renderMyInfoBatchSelectedState_(){
    const id=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const profile=kinojoMyProfileUiState.bootstrapByCharacter[id]||null;
    const reference=kinojoMyReferencePickerState.stateByCharacter[id]||null;
    renderMyInfoProfileCurrent_(profile);
    renderMyInfoProfileStatusForData_(profile);
    renderMyInfoReferencePicker_();
    if(reference?.ok===true){
      const count=reference.references.filter(item=>item?.active===true).length;
      setMyInfoReferenceStatus_(count?count+'개 슬롯이 비공개 등록되어 있습니다. 슬롯을 눌러 교체하거나 삭제할 수 있습니다.':'등록된 참고 이미지가 없습니다. 슬롯을 눌러 촬영 이미지를 편집해 주세요.','ready');
    }else setMyInfoReferenceStatus_('참고 이미지 등록 상태를 확인하지 못했습니다.','error');
    return profile;
  }
  async function loadMyInfoBatchBootstrap_(force=false){
    const token=myInfoSessionToken_();
    if(!token){resetMyInfoProfileUi_();return null;}
    if(kinojoMyProfileUiState.token!==token){
      resetMyInfoProfileUi_();
      kinojoMyProfileUiState.token=token;
    }
    if(!force&&kinojoMyProfileUiState.batchData)return kinojoMyProfileUiState.batchData;
    if(kinojoMyProfileUiState.batchPromise)return kinojoMyProfileUiState.batchPromise;
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      setMyInfoProfileStatus_('서버 연결을 준비하는 중입니다.','loading');
      setMyInfoReferenceStatus_('서버 연결을 준비하는 중입니다.','loading');
      return null;
    }
    const requestId=++kinojoMyProfileUiState.batchRequestId;
    setMyInfoProfileStatus_('모든 캐릭터의 프로필 상태를 한 번에 확인하는 중입니다.','loading');
    setMyInfoReferenceStatus_('모든 캐릭터의 참고 이미지 상태를 한 번에 확인하는 중입니다.','loading');
    kinojoMyProfileUiState.batchPromise=(async()=>{
      await ensureMyInfoImageTools_();
      const batch=await window.KinojoMyInfoBatchBootstrap.load({client,sessionToken:token});
      if(requestId!==kinojoMyProfileUiState.batchRequestId||myInfoSessionToken_()!==token)return null;
      kinojoMyCharactersState.token=token;
      kinojoMyCharactersState.data=batch.characters;
      kinojoMyCharactersState.promise=null;
      kinojoMyProfileUiState.bootstrapByCharacter=batch.profileByCharacter;
      kinojoMyReferencePickerState.stateByCharacter=batch.referenceByCharacter;
      kinojoMyProfileUiState.batchData=batch;
      syncMyInfoImagePreloader_(batch,token);
      renderMyInfoCharacters_(batch.characters);
      return batch;
    })().catch(error=>{
      if(requestId===kinojoMyProfileUiState.batchRequestId&&myInfoSessionToken_()===token){
        kinojoMyProfileUiState.batchData=null;
        setMyInfoProfileStatus_('캐릭터 이미지 상태를 한 번에 불러오지 못했습니다.','error');
        setMyInfoReferenceStatus_('캐릭터 이미지 상태를 한 번에 불러오지 못했습니다.','error');
      }
      console.warn('KINOJO My Info batch bootstrap failed:',error);
      return null;
    }).finally(()=>{
      if(kinojoMyProfileUiState.token===token)kinojoMyProfileUiState.batchPromise=null;
    });
    return kinojoMyProfileUiState.batchPromise;
  }
  async function prepareMyInfoProfileModal_(){
    const token=myInfoSessionToken_();
    if(!token){resetMyInfoProfileUi_();return null;}
    const batch=await loadMyInfoBatchBootstrap_();
    const data=batch?.characters||null;
    if(!batch||!data||data.ok!==true){
      renderMyInfoProfileCharacterButtons_();
      setMyInfoProfileStatus_('캐릭터 이미지 상태를 불러오지 못했습니다.','error');
      return null;
    }
    const characters=myInfoProfileCharacters_();
    if(!characters.length){
      kinojoMyProfileUiState.token=token;
      kinojoMyProfileUiState.selectedCharacterId=0;
      renderMyInfoProfileCharacterButtons_();
      renderMyInfoProfileCurrent_(null);
      resetMyInfoReferencePicker_(0);
      setMyInfoProfileStatus_('연결된 캐릭터가 없습니다.','error');
      return null;
    }
    if(kinojoMyProfileUiState.token!==token){
      resetMyInfoProfileUi_();
      kinojoMyProfileUiState.token=token;
    }
    const current=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const selected=characters.find(row=>Number(row.characterId)===current)||characters.find(row=>row.isMain===true)||characters[0];
    kinojoMyProfileUiState.selectedCharacterId=Number(selected.characterId);
    syncMyInfoReferenceCharacter_(selected.characterId);
    renderMyInfoProfileCharacterButtons_();
    renderMyInfoBatchSelectedState_();
    const loader=syncMyInfoImagePreloader_(batch,token);
    if(loader){
      await loader.prepareInitial(selected.characterId);
      if(myInfoSessionToken_()!==token||Number(kinojoMyProfileUiState.selectedCharacterId)!==Number(selected.characterId))return null;
      renderMyInfoProfileCharacterButtons_();
      renderMyInfoBatchSelectedState_();
    }
    return kinojoMyProfileUiState.bootstrapByCharacter[Number(selected.characterId)]||null;
  }
  function selectMyInfoProfileCharacter_(characterId){
    if(kinojoMyReferencePickerState.submitting)return;
    const id=Number(characterId||0);
    if(!myInfoProfileCharacters_().some(row=>Number(row.characterId)===id))return;
    kinojoMyProfileUiState.selectedCharacterId=id;
    clearMyInfoProfilePreview_();
    syncMyInfoReferenceCharacter_(id);
    renderMyInfoProfileCharacterButtons_();
    renderMyInfoBatchSelectedState_();
    loadMyInfoImageRequestState_(id).catch(()=>null);
    const imageState=myInfoProfileImageState_(id);
    if(imageState?.status==='idle'){
      kinojoMyProfileUiState.imagePreloader.request(id).catch(()=>{});
    }
  }
  async function retryMyInfoProfileImage_(){
    const id=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const loader=kinojoMyProfileUiState.imagePreloader;
    if(kinojoMyProfileUiState.uploading||!loader||!Number.isInteger(id)||id<=0)return false;
    const retry=q('#kinojoMyInfoProfileRetryBtn');
    if(retry)retry.disabled=true;
    setMyInfoProfileStatus_('이 캐릭터의 프로필 이미지를 다시 준비하는 중입니다.','loading');
    try{
      await loader.retry(id);
      const data=kinojoMyProfileUiState.bootstrapByCharacter[id]||null;
      renderMyInfoProfileCurrent_(data);
      renderMyInfoProfileStatusForData_(data);
      return true;
    }catch(error){
      renderMyInfoProfileCurrent_(kinojoMyProfileUiState.bootstrapByCharacter[id]||null);
      setMyInfoProfileStatus_('프로필 이미지를 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.','error');
      console.warn('KINOJO My Info profile image retry failed:',error);
      return false;
    }finally{
      renderMyInfoProfileRetry_(myInfoProfileImageState_(id));
    }
  }
  async function handleMyInfoProfileFile_(file){
    if(!file){clearMyInfoProfilePreview_('이미지 선택이 취소되었습니다.');return false;}
    const mime=String(file.type||'').trim().toLowerCase();
    if(!KINOJO_PROFILE_IMAGE_MIME_TYPES.has(mime)){
      clearMyInfoProfilePreview_();
      setMyInfoProfileStatus_('JPEG, PNG, WebP 이미지만 선택할 수 있습니다.','error');
      return false;
    }
    if(!Number.isFinite(file.size)||file.size<1||file.size>KINOJO_PROFILE_IMAGE_MAX_BYTES){
      clearMyInfoProfilePreview_();
      setMyInfoProfileStatus_('이미지는 5MB 이하만 선택할 수 있습니다.','error');
      return false;
    }
    try{
      setMyInfoProfileStatus_('프로필 이미지 편집기를 준비하는 중입니다.','loading');
      await ensureMyInfoImageTools_();
      await window.KinojoMyInfoImageEditor.open({
        slot:'PROFILE',file,
        onConfirm(result){
          const edited=window.KinojoMyInfoImageUpload.validateEditedOutput(result,window.KinojoMyInfoImageContract);
          clearMyInfoProfilePreview_();
          const url=URL.createObjectURL(edited.blob);
          kinojoMyProfileUiState.file=result.file||edited.blob;
          kinojoMyProfileUiState.editedOutput=result;
          kinojoMyProfileUiState.previewUrl=url;
          const candidate=q('#kinojoMyInfoProfileCandidate');
          const image=q('#kinojoMyInfoProfileCandidateImage');
          const name=q('#kinojoMyInfoProfileCandidateName');
          const meta=q('#kinojoMyInfoProfileCandidateMeta');
          if(image){image.src=url;image.alt='편집한 프로필 이미지 미리보기';image.hidden=false;}
          if(name)name.textContent=result.filename||'kinojo-profile.webp';
          if(meta)meta.textContent='WEBP · '+edited.definition.outputWidth+'×'+edited.definition.outputHeight+' · '+myInfoProfileFileSize_(edited.sizeBytes);
          if(candidate)candidate.hidden=false;
          const cancel=q('#kinojoMyInfoProfileCancelBtn');
          if(cancel){cancel.hidden=false;cancel.disabled=false;}
          const upload=q('#kinojoMyInfoProfileUploadBtn');
          const current=kinojoMyProfileUiState.bootstrapByCharacter[Number(kinojoMyProfileUiState.selectedCharacterId||0)]||null;
          const replacing=current?.profile?.hasOverride===true;
          if(upload){upload.hidden=false;upload.disabled=false;upload.textContent=replacing?'교체':'업로드';}
          setMyInfoProfileStatus_(replacing?'512×512 WebP 편집 결과만 기존 이미지와 안전하게 교체할 수 있습니다.':'512×512 WebP 편집 결과만 업로드됩니다. 원본은 전송되지 않습니다.','preview');
        },
        onClose(detail){
          if(detail?.reason!=='confirm'&&!kinojoMyProfileUiState.editedOutput)setMyInfoProfileStatus_('프로필 이미지 편집을 취소했습니다. 원본은 저장되거나 업로드되지 않았습니다.','info');
        },
        onError(error){console.warn('KINOJO My Info profile editor failed:',error);}
      });
    }catch(error){
      clearMyInfoProfilePreview_();
      setMyInfoProfileStatus_('프로필 이미지 편집기를 열지 못했습니다. 다른 이미지를 선택해 주세요.','error');
      console.warn('KINOJO My Info profile file failed:',error);
      return false;
    }
    return true;
  }
  function setMyInfoProfileUploading_(value){
    const uploading=value===true;
    kinojoMyProfileUiState.uploading=uploading;
    const upload=q('#kinojoMyInfoProfileUploadBtn');
    if(upload){
      const current=kinojoMyProfileUiState.bootstrapByCharacter[Number(kinojoMyProfileUiState.selectedCharacterId||0)]||null;
      const replacing=current?.profile?.hasOverride===true;
      upload.disabled=uploading;
      upload.textContent=uploading?(replacing?'교체 중...':'업로드 중...'):(replacing?'교체':'업로드');
    }
    const cancel=q('#kinojoMyInfoProfileCancelBtn');
    if(cancel)cancel.disabled=uploading;
    const select=q('#kinojoMyInfoProfileSelectBtn');
    if(select)select.disabled=uploading||select.disabled;
    const reset=q('#kinojoMyInfoProfileResetBtn');
    if(reset)reset.disabled=uploading||reset.disabled;
    const retry=q('#kinojoMyInfoProfileRetryBtn');
    if(retry&&!retry.hidden)retry.disabled=uploading;
    document.querySelectorAll('#kinojoMyInfoProfileCharacters [data-profile-character-id]').forEach(button=>{button.disabled=uploading;});
    if(!uploading){
      renderMyInfoProfileCharacterButtons_();
      const id=Number(kinojoMyProfileUiState.selectedCharacterId||0);
      renderMyInfoProfileCurrent_(kinojoMyProfileUiState.bootstrapByCharacter[id]||null);
    }
  }
  async function uploadMyInfoProfile_(){
    if(kinojoMyProfileUiState.uploading)return false;
    const token=myInfoSessionToken_();
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const result=kinojoMyProfileUiState.editedOutput;
    if(!token||!Number.isInteger(characterId)||characterId<=0||!result){
      setMyInfoProfileStatus_('편집을 완료한 이미지를 먼저 준비해 주세요.','error');
      return false;
    }
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      setMyInfoProfileStatus_('서버 연결을 준비하는 중입니다.','error');
      return false;
    }
    setMyInfoProfileUploading_(true);
    try{
      setMyInfoProfileStatus_('512×512 WebP 편집 결과를 검증하고 안전하게 업로드하는 중입니다.','loading');
      await ensureMyInfoImageTools_();
      const uploaded=await window.KinojoMyInfoImageUpload.uploadEdited({client,sessionToken:token,characterId,contract:window.KinojoMyInfoImageContract,result});
      const completed=uploaded.response;
      const replacing=uploaded.replacing===true;
      kinojoMyProfileUiState.bootstrapByCharacter[characterId]=completed;
      clearMyInfoProfilePreview_();
      await refreshMyInfoProfileImage_(characterId,completed);
      renderMyInfoProfileCurrent_(completed);
      if(myInfoProfileImageState_(characterId)?.status==='error'){
        setMyInfoProfileStatus_('프로필 이미지는 적용됐지만 화면 준비에 실패했습니다. 다시 시도해 주세요.','error');
      }else if(replacing&&completed.replacement?.cleanupRequired===true){
        setMyInfoProfileStatus_('새 프로필 이미지로 교체되었습니다. 이전 이미지 정리는 서버에서 계속 처리합니다.','info');
      }else{
        setMyInfoProfileStatus_(replacing?'프로필 이미지가 안전하게 교체되었습니다.':'프로필 이미지가 적용되었습니다.','ready');
      }
      return true;
    }catch(error){
      const code=String(error?.code||error?.data?.code||error?.message||'');
      if(code.includes('PROFILE_OVERRIDE_EXISTS')||code.includes('PROFILE_OVERRIDE_NOT_FOUND')){
        delete kinojoMyProfileUiState.bootstrapByCharacter[characterId];
        const latestState=await loadMyInfoProfileBootstrap_(characterId,true).catch(()=>null);
        clearMyInfoProfilePreview_();
        if(latestState)renderMyInfoProfileCurrent_(latestState);
        setMyInfoProfileStatus_('다른 작업에서 프로필 상태가 변경되었습니다. 현재 상태를 다시 확인했으니 이미지를 다시 선택해 주세요.','info');
      }else{
        setMyInfoProfileStatus_('이미지 업로드 또는 교체에 실패했습니다. 현재 적용 이미지는 유지됩니다. 다시 시도해 주세요.','error');
      }
      console.warn('KINOJO My Info profile upload failed:',error);
      return false;
    }finally{
      setMyInfoProfileUploading_(false);
    }
  }
  async function resetMyInfoProfileOfficial_(){
    if(kinojoMyProfileUiState.uploading)return false;
    const token=myInfoSessionToken_();
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    if(!token||!Number.isInteger(characterId)||characterId<=0){
      setMyInfoProfileStatus_('복원할 캐릭터를 확인하지 못했습니다.','error');
      return false;
    }
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      setMyInfoProfileStatus_('서버 연결을 준비하는 중입니다.','error');
      return false;
    }
    const current=kinojoMyProfileUiState.bootstrapByCharacter[characterId]||await loadMyInfoProfileBootstrap_(characterId,true);
    if(!current||current.ok!==true)return false;
    if(current.profile?.hasOverride!==true){
      renderMyInfoProfileCurrent_(current);
      setMyInfoProfileStatus_('이미 현재 공식 프로필 이미지가 적용 중입니다.','ready');
      return true;
    }
    if(!window.confirm('사용자 프로필 이미지를 제거하고 현재 공식 이미지로 복원할까요?'))return false;
    clearMyInfoProfilePreview_();
    setMyInfoProfileUploading_(true);
    try{
      setMyInfoProfileStatus_('현재 프로필 상태를 다시 확인하는 중입니다.','loading');
      const latest=await loadMyInfoProfileBootstrap_(characterId,true);
      if(!latest||latest.ok!==true)throw new Error('PROFILE_BOOTSTRAP_FAILED');
      if(latest.profile?.hasOverride!==true){
        kinojoMyProfileUiState.bootstrapByCharacter[characterId]=latest;
        renderMyInfoProfileCurrent_(latest);
        setMyInfoProfileStatus_('이미 현재 공식 프로필 이미지가 적용 중입니다.','ready');
        return true;
      }
      setMyInfoProfileStatus_('사용자 이미지를 해제하고 공식 이미지로 복원하는 중입니다.','loading');
      const result=await client.invokeEdgeFunction('kinojo-member-profile',{
        action:'profile-reset-official',sessionToken:token,characterId
      });
      if(!result||result.ok!==true||result.profile?.hasOverride===true||String(result.profile?.effectiveSource||'')!=='OFFICIAL')throw new Error('PROFILE_RESET_INVALID');
      kinojoMyProfileUiState.bootstrapByCharacter[characterId]=result;
      await refreshMyInfoProfileImage_(characterId,result);
      renderMyInfoProfileCurrent_(result);
      if(myInfoProfileImageState_(characterId)?.status==='error')setMyInfoProfileStatus_('공식 이미지로 복원됐지만 화면 준비에 실패했습니다. 다시 시도해 주세요.','error');
      else if(result.reset?.cleanupRequired===true)setMyInfoProfileStatus_('공식 프로필 이미지로 복원되었습니다. 이전 사용자 이미지 파일 정리는 서버에서 계속 처리합니다.','info');
      else if(result.reset?.alreadyOfficial===true)setMyInfoProfileStatus_('이미 현재 공식 프로필 이미지가 적용 중입니다.','ready');
      else setMyInfoProfileStatus_('공식 프로필 이미지로 복원되었습니다.','ready');
      return true;
    }catch(error){
      delete kinojoMyProfileUiState.bootstrapByCharacter[characterId];
      const latestState=await loadMyInfoProfileBootstrap_(characterId,true).catch(()=>null);
      if(latestState)renderMyInfoProfileCurrent_(latestState);
      setMyInfoProfileStatus_('공식 이미지 복원에 실패했습니다. 현재 적용 상태를 다시 확인했습니다.','error');
      console.warn('KINOJO My Info profile reset failed:',error);
      return false;
    }finally{setMyInfoProfileUploading_(false);}
  }
  function makeMyInfoModal(){
    const modal=document.createElement('section');
    modal.className='kinojo-my-info-modal';
    modal.id='kinojoMyInfoModal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="kinojo-my-info-modal-backdrop" data-kinojo-my-info-modal-close></div>
      <div class="kinojo-my-info-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="kinojoMyInfoModalTitle" aria-describedby="kinojoMyInfoModalSummary" tabindex="-1">
        <button class="kinojo-my-info-modal-close" type="button" aria-label="내 정보 닫기" data-kinojo-my-info-modal-close>×</button>
        <div class="kinojo-my-info-manager">
          <header class="kinojo-my-info-manager-head">
            <span class="kinojo-my-info-manager-badge">MY INFO</span>
            <div class="kinojo-my-info-manager-headline"><strong id="kinojoMyInfoModalTitle">내 정보</strong><p id="kinojoMyInfoModalSummary">내 캐릭터의 프로필 이미지와 관리자 확인용 참고 이미지를 관리합니다.</p></div>
          </header>
          <section class="kinojo-my-info-profile-section" aria-labelledby="kinojoMyInfoProfileTitle">
            <div class="kinojo-my-info-manager-section-head">
              <div><strong id="kinojoMyInfoProfileTitle">프로필 이미지</strong><span>캐릭터별 개별 설정</span></div>
              <small>원본 JPEG · PNG · WebP / 결과 512×512 WebP</small>
            </div>
            <div class="kinojo-my-info-profile-layout">
              <div class="kinojo-my-info-profile-character-pane is-at-start is-at-end">
                <div class="kinojo-my-info-profile-characters" id="kinojoMyInfoProfileCharacters" aria-label="프로필 이미지를 관리할 캐릭터"><span class="kinojo-my-info-profile-empty">캐릭터 정보를 불러오는 중입니다.</span></div>
              </div>
              <div class="kinojo-my-info-profile-current-pane">
                <div class="kinojo-my-info-profile-actions">
                  <input id="kinojoMyInfoProfileFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
                  <button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoProfileSelectBtn" type="button" disabled>이미지 선택</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileResetBtn" type="button" hidden>공식 이미지로 복원</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileRetryBtn" type="button" hidden>이미지 다시 시도</button>
                  <button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoProfileUploadBtn" type="button" hidden>업로드</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileCancelBtn" type="button" hidden>선택 취소</button>
                </div>
                <div class="kinojo-my-info-profile-images">
                  <article class="kinojo-my-info-profile-card is-current">
                    <div class="kinojo-my-info-profile-image-frame"><img id="kinojoMyInfoProfileCurrentImage" alt="" hidden><span id="kinojoMyInfoProfileCurrentPlaceholder">현재 이미지</span></div>
                    <div class="kinojo-my-info-profile-card-copy"><small>현재 적용</small><strong id="kinojoMyInfoProfileCurrentSource">현재 이미지 확인 중</strong><span id="kinojoMyInfoProfileCurrentMeta">Server에서 현재 적용 이미지를 확인합니다.</span></div>
                  </article>
                  <article class="kinojo-my-info-profile-card is-candidate" id="kinojoMyInfoProfileCandidate" hidden>
                    <div class="kinojo-my-info-profile-image-frame"><img id="kinojoMyInfoProfileCandidateImage" alt="" hidden></div>
                    <div class="kinojo-my-info-profile-card-copy"><small>선택 미리보기</small><strong id="kinojoMyInfoProfileCandidateName">선택한 이미지</strong><span id="kinojoMyInfoProfileCandidateMeta"></span></div>
                  </article>
                </div>
                <div class="kinojo-my-info-profile-status" id="kinojoMyInfoProfileStatus" data-state="loading" role="status" aria-live="polite" aria-atomic="true">현재 프로필 이미지를 확인하는 중입니다.</div>
              </div>
            </div>
          </section>
          <section class="kinojo-my-info-reference-preview" id="kinojoMyInfoReferenceSection" aria-labelledby="kinojoMyInfoReferenceTitle" aria-disabled="true">
            <div class="kinojo-my-info-manager-section-head">
              <div><strong id="kinojoMyInfoReferenceTitle">참고 이미지</strong><span>관리자 확인용 비공개 자료</span></div>
              <small id="kinojoMyInfoReferenceHeadMeta">캐릭터 선택 후 슬롯 선택</small>
            </div>
            <input id="kinojoMyInfoReferenceFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <div class="kinojo-my-info-reference-preview-grid" id="kinojoMyInfoReferenceGrid" role="group" aria-labelledby="kinojoMyInfoReferenceTitle">
              ${KINOJO_REFERENCE_IMAGE_SLOTS.map(slot=>{const label=slot==='FRONT'?'정면':slot==='BACK'?'후면':'얼굴이 잘 보이는 상반신';return `<article class="kinojo-my-info-reference-slot" data-reference-slot="${slot}" aria-disabled="true"><div class="kinojo-my-info-reference-visual" data-reference-visual><img class="kinojo-my-info-reference-guide" data-reference-guide src="${KINOJO_REFERENCE_GUIDE_ASSETS[slot]}" alt="${label} 촬영 가이드"></div><div class="kinojo-my-info-reference-slot-copy"><b>${slot}</b><span>${label}</span><small data-reference-file-status>등록된 이미지 없음</small></div><div class="kinojo-my-info-reference-slot-actions"><button class="kinojo-my-info-action-btn" data-reference-select-slot="${slot}" type="button" disabled>이미지 선택</button><button class="kinojo-my-info-action-btn" data-reference-cancel-slot="${slot}" type="button" hidden>편집 취소</button><button class="kinojo-my-info-action-btn is-danger" data-reference-delete-slot="${slot}" type="button" hidden>등록 삭제</button></div></article>`;}).join('')}
            </div>
            <div class="kinojo-my-info-reference-status" id="kinojoMyInfoReferenceStatus" data-state="info" role="status" aria-live="polite" aria-atomic="true">캐릭터를 선택하면 슬롯별 이미지를 고를 수 있습니다.</div>
            <section class="kinojo-my-info-request" aria-labelledby="kinojoMyInfoRequestTitle">
              <div class="kinojo-my-info-request-head"><div><strong id="kinojoMyInfoRequestTitle">이미지 제작 요청</strong><span>선택한 참고 이미지를 한 번에 전송합니다.</span></div><b id="kinojoMyInfoRequestSelectionSummary">선택 0/3</b></div>
              <fieldset class="kinojo-my-info-request-styles">
                <legend>원하는 이미지 스타일 <small>선택 사항</small></legend>
                <div class="kinojo-my-info-request-style-grid">
                  ${Object.entries(KINOJO_IMAGE_REQUEST_STYLES).map(([code,label])=>`<label class="kinojo-my-info-request-style"><input type="radio" name="kinojoMyInfoRequestStyle" value="${code}" disabled><span><b>${label}</b><small>${code==='CUSTOM'?'아래 요청 내용에 직접 작성':'관리자 제작 기준으로 전달'}</small></span></label>`).join('')}
                </div>
              </fieldset>
              <label class="kinojo-my-info-request-note" for="kinojoMyInfoRequestNote"><span><b>추가 요청</b><small id="kinojoMyInfoRequestNoteCount">0/300</small></span><textarea id="kinojoMyInfoRequestNote" maxlength="300" rows="3" placeholder="원하는 분위기, 색감, 의상 표현 등을 적어 주세요." disabled></textarea></label>
              <div class="kinojo-my-info-request-submit-row"><p>정면·후면·상반신 중 1장만 선택해도 요청할 수 있습니다.</p><button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoRequestSubmitBtn" type="button" disabled>이미지 제작 요청 보내기</button></div>
              <div class="kinojo-my-info-request-status" id="kinojoMyInfoRequestStatus" data-state="info" role="status" aria-live="polite" aria-atomic="true">참고 이미지를 선택하면 제작 요청을 보낼 수 있습니다.</div>
              <div class="kinojo-my-info-request-result" id="kinojoMyInfoRequestResult" hidden></div>
            </section>
          </section>
        </div>
      </div>
      <div class="kinojo-my-info-request-confirm" id="kinojoMyInfoStyleConfirm" aria-hidden="true" hidden>
        <div class="kinojo-my-info-request-confirm__backdrop" data-request-confirm-cancel></div>
        <div class="kinojo-my-info-request-confirm__dialog" role="alertdialog" aria-modal="true" aria-labelledby="kinojoMyInfoStyleConfirmTitle" aria-describedby="kinojoMyInfoStyleConfirmDescription" tabindex="-1">
          <small>스타일 미선택</small><strong id="kinojoMyInfoStyleConfirmTitle">요청 스타일을 정하지 않고 이미지만 업로드하시겠습니까?</strong>
          <p id="kinojoMyInfoStyleConfirmDescription">스타일을 고르지 않아도 접수할 수 있으며, 관리자가 참고 이미지와 추가 요청을 기준으로 제작합니다.</p>
          <div><button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoStyleConfirmChooseBtn" type="button">돌아가서 스타일 선택</button><button class="kinojo-my-info-action-btn" id="kinojoMyInfoStyleConfirmSubmitBtn" type="button">스타일 없이 업로드</button></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  async function openMyInfoModal(){
    const modal=q('#kinojoMyInfoModal');
    if(!modal||!window.KinojoAuth?.getSession?.())return;
    if(!modal.classList.contains('open'))kinojoMyInfoFocusState.modalReturn=q('#kinojoMyInfoBtn')||(document.activeElement instanceof HTMLElement?document.activeElement:null);
    const token=myInfoSessionToken_();
    const requestId=++kinojoMyProfileUiState.openRequestId;
    await prepareMyInfoProfileModal_().catch(()=>null);
    if(requestId!==kinojoMyProfileUiState.openRequestId||!token||myInfoSessionToken_()!==token||!window.KinojoAuth?.getSession?.())return;
    closeMyInfoPanel(false);
    const show=()=>{
      if(!window.KinojoAuth?.getSession?.())return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      document.body.classList.add('kinojo-my-info-modal-open');
      const dialog=q('.kinojo-my-info-modal-dialog',modal);
      if(dialog)dialog.scrollTop=0;
      focusMyInfoElement_(q('.kinojo-my-info-modal-close',modal)||dialog);
    };
    show();
    loadMyInfoImageRequestState_(kinojoMyProfileUiState.selectedCharacterId).catch(()=>null);
    const loader=kinojoMyProfileUiState.imagePreloader;
    if(loader){
      kinojoMyProfileUiState.imageBackgroundPromise=loader.startBackground()
        .catch(()=>null)
        .finally(()=>{kinojoMyProfileUiState.imageBackgroundPromise=null;});
    }
  }
  function closeMyInfoModal(restoreFocus=true){
    if(kinojoMyReferencePickerState.submitting){
      setMyInfoImageRequestStatus_('이미지 전송이 끝날 때까지 잠시 기다려 주세요.','loading');
      return false;
    }
    const modal=q('#kinojoMyInfoModal');
    const wasOpen=!!modal?.classList.contains('open');
    const returnFocus=kinojoMyInfoFocusState.modalReturn;
    if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');}
    closeMyInfoStyleConfirm_(false);
    window.KinojoMyInfoImageEditor?.close?.('parent-close');
    clearMyInfoProfilePreview_();
    resetMyInfoReferencePicker_(kinojoMyProfileUiState.selectedCharacterId);
    kinojoMyProfileUiState.openRequestId+=1;
    document.body.classList.remove('kinojo-my-info-modal-open');
    kinojoMyInfoFocusState.modalReturn=null;
    if(wasOpen&&restoreFocus)focusMyInfoElement_(returnFocus||q('#kinojoMyInfoBtn'));
  }
  function openMyInfoPanel(){
    const layer=q('#kinojoMyInfoLayer');
    const btn=q('#kinojoMyInfoBtn');
    if(!layer||!window.KinojoAuth?.getSession?.())return;
    if(!layer.classList.contains('open'))kinojoMyInfoFocusState.panelReturn=document.activeElement instanceof HTMLElement?document.activeElement:btn;
    closeSideDrawer();
    layer.classList.add('open');
    layer.setAttribute('aria-hidden','false');
    document.body.classList.add('kinojo-my-info-open');
    if(btn)btn.setAttribute('aria-expanded','true');
    focusMyInfoElement_(q('#kinojoMyInfoCloseBtn')||q('#kinojoMyInfoPanel'));
    loadMyInfoCharacters_().catch(()=>{});
  }
  function closeMyInfoPanel(restoreFocus=true){
    const layer=q('#kinojoMyInfoLayer');
    const btn=q('#kinojoMyInfoBtn');
    const wasOpen=!!layer?.classList.contains('open');
    const returnFocus=kinojoMyInfoFocusState.panelReturn;
    if(layer){layer.classList.remove('open');layer.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-my-info-open');
    if(btn)btn.setAttribute('aria-expanded','false');
    kinojoMyInfoFocusState.panelReturn=null;
    if(wasOpen&&restoreFocus)focusMyInfoElement_(returnFocus||btn);
  }

  function toggleAdminMenu(){
    const btn=q('#adminMenuBtn');
    const href=btn?.dataset?.adminHref||'/admin/';
    window.open(href,'_blank','noopener');
  }
  function closeAdminMenuCommon(){}
  function bindCommonAdmin(info){
    q('#adminMenuBtn')?.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      const href=e.currentTarget?.dataset?.adminHref||(info?.mobile?'/m/admin/':'/admin/');
      window.open(href,'_blank','noopener');
    });
  }
  function makeDrawer(info){
    const isHall=info.key==='hall';
    const isRanking=info.key==='ranking';
    const isMeter=info.key==='meter';
    const isSanctuary=info.key==='sanctuary';
    const isSchedule=info.key==='schedule';
    const isArcana=info.key==='arcana';
    const base=info.mobile?'/m/':'/';
    const home=base;
    const hallHref=isHall?'./':base+'hof/';
    const rankingHref=isRanking?'./':base+'ranking/';
    const meterHref=isMeter?'./':base+'meter/';
    const sanctuaryPrefix=isSanctuary?'./':base+'sanctuary/';
    const scheduleHref=isSchedule?'./':base+'sanctuary-schedule/';
    const arcanaHref=isArcana?'./':base+'arcana/';
    const drawer=document.createElement('section');
    drawer.className='kinojo-common-drawer';
    drawer.id='sideDrawer';
    drawer.setAttribute('aria-hidden','true');
    drawer.innerHTML=`
      <div class="kinojo-drawer-panel" role="dialog" aria-modal="false" aria-labelledby="drawerTitle">
        <div class="kinojo-drawer-head">
          <a id="drawerTitle" class="kinojo-drawer-title" href="/">KINOJO INFO</a>
          <button class="kinojo-common-close kinojo-drawer-close" id="drawerCloseBtn" type="button" aria-label="메뉴 닫기">×</button>
        </div>
        <nav class="kinojo-drawer-nav" aria-label="KINOJO INFO 메뉴">
          <div class="kinojo-drawer-category">바로가기</div>
          <a href="${hallHref}" ${isHall?'class="active" aria-disabled="true"':''}>명예의 전당</a>
          <a href="${rankingHref}" ${isRanking?'class="active" aria-disabled="true"':''}>레기온 순위</a>
          <a href="https://aion2.plaync.com/ko-kr/index?redirect=false" target="_blank" rel="noopener">아이온2 공식으로 이동</a>
          <a href="https://aion2.plaync.com/ko-kr/board/notice/list" target="_blank" rel="noopener">아이온2 공지로 이동</a>
          <div class="kinojo-drawer-divider"></div>
          <div class="kinojo-drawer-category">성역</div>
          <div class="kinojo-drawer-sanctuary-list" data-sanctuary-master-nav data-sanctuary-base="${sanctuaryPrefix}">
            <a href="${sanctuaryPrefix}">성역 목록 불러오는 중</a>
          </div>
          <a href="${scheduleHref}" data-kinojo-auth-required="true" ${isSchedule?'class="active" aria-disabled="true"':''}>성역 스케줄</a>
          <div class="kinojo-drawer-divider"></div>
          <div class="kinojo-drawer-category">도구</div>
          <a href="${arcanaHref}" ${isArcana?'class="active" aria-disabled="true"':''}>ARCANA 스킬 시뮬레이터</a>
          <a href="${meterHref}" ${isMeter?'class="active" aria-disabled="true"':''}>KINOJO METER</a>
          <div class="kinojo-drawer-divider"></div>
          <div class="kinojo-drawer-category">안내</div>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="about" data-drawer="about">사이트 소개</button>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="terms" data-drawer="terms">이용약관</button>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="privacy" data-drawer="privacy">개인정보처리방침</button>
          <div class="kinojo-drawer-divider"></div>
          <button class="kinojo-drawer-action" id="drawerSuggestBtn" type="button" data-page-panel="contact" data-drawer="contact">아이디어 제안 및 건의</button>
        </nav>
      </div>
      <aside class="kinojo-side-panel" id="drawerPagePanel" aria-hidden="true">
        <div class="kinojo-panel-head">
          <strong class="kinojo-panel-title" id="drawerPageTitle">사이트 안내</strong>
          <button class="kinojo-common-close kinojo-panel-close" id="drawerPageCloseBtn" type="button" aria-label="닫기">×</button>
        </div>
        <div class="kinojo-panel-body" id="drawerPageBody"></div>
      </aside>`;
    document.body.appendChild(drawer);
  }
  function measureDrawerTextWidth_(element){
    if(!element||element.hidden)return 0;
    try{
      const range=document.createRange();
      range.selectNodeContents(element);
      const width=range.getBoundingClientRect().width;
      range.detach?.();
      return width;
    }catch(_error){return 0;}
  }
  function syncDrawerWidth_(){
    const panel=q('.kinojo-drawer-panel');
    if(!panel)return;
    const textNodes=panel.querySelectorAll('.kinojo-drawer-title,.kinojo-drawer-category,.kinojo-drawer-nav a,.kinojo-drawer-link,.kinojo-drawer-action');
    const widest=Array.from(textNodes).reduce((max,element)=>Math.max(max,measureDrawerTextWidth_(element)),0);
    const titleWidth=measureDrawerTextWidth_(q('.kinojo-drawer-title',panel));
    const available=Math.max(0,window.innerWidth-16);
    const minimum=Math.min(238,available);
    const natural=Math.max(minimum,Math.ceil(widest+40),Math.ceil(titleWidth+78));
    const width=Math.min(330,available,natural);
    if(width>0)document.documentElement.style.setProperty('--kinojo-drawer-width',width+'px');
  }
  function openSideDrawer(){
    const drawer=q('#sideDrawer');const btn=q('#drawerToggleBtn');
    if(!drawer)return;
    closeMyInfoPanel();
    syncDrawerWidth_();
    drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');
    document.body.classList.add('kinojo-drawer-open','drawer-open');
    if(btn)btn.setAttribute('aria-expanded','true');
  }
  function closeSideDrawer(){
    const drawer=q('#sideDrawer');const btn=q('#drawerToggleBtn');
    const panel=q('#drawerPagePanel');
    if(drawer){drawer.classList.remove('open','standalone-open');drawer.setAttribute('aria-hidden','true');}
    if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-drawer-open','drawer-open','kinojo-standalone-panel-open');
    if(btn)btn.setAttribute('aria-expanded','false');
  }
  function setGuideContent(type){
    const data=DOCS[type]||DOCS.about;
    const title=q('#drawerPageTitle');const body=q('#drawerPageBody');
    if(title)title.textContent=data.title;
    if(body)body.innerHTML=data.html;
  }
  function openDrawerPagePanel(type){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');
    if(!drawer||!panel)return;
    drawer.classList.remove('standalone-open');
    setGuideContent(type);
    if(!drawer.classList.contains('open'))openSideDrawer();
    panel.classList.add('open','from-menu');
    panel.classList.remove('standalone');
    panel.setAttribute('aria-hidden','false');
  }
  function openStandalonePagePanel(type){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');const btn=q('#drawerToggleBtn');
    if(!drawer||!panel)return;
    setGuideContent(type);
    drawer.classList.add('standalone-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','false');
    document.body.classList.remove('kinojo-drawer-open','drawer-open');
    document.body.classList.add('kinojo-standalone-panel-open');
    if(btn)btn.setAttribute('aria-expanded','false');
    panel.classList.add('open','standalone');
    panel.classList.remove('from-menu');
    panel.setAttribute('aria-hidden','false');
  }
  function closeDrawerPagePanel(){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');
    if(panel){panel.classList.remove('open','standalone','from-menu');panel.setAttribute('aria-hidden','true');}
    if(drawer){drawer.classList.remove('standalone-open');if(!drawer.classList.contains('open'))drawer.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-standalone-panel-open');
  }
  let kinojoSafeAreaObserver=null;
  let kinojoSafeAreaFrame=0;
  function measureSafeAreas(){
    cancelAnimationFrame(kinojoSafeAreaFrame);
    kinojoSafeAreaFrame=requestAnimationFrame(()=>{
      const root=document.documentElement;
      const topbar=q('.kinojo-topbar');
      const notice=q('.kinojo-notice-strip');
      const topRect=topbar?.getBoundingClientRect?.();
      const noticeRect=notice?.getBoundingClientRect?.();
      const topVisible=!!(topbar&&topRect&&topRect.height>0&&getComputedStyle(topbar).display!=='none');
      const noticeVisible=!!(notice&&noticeRect&&noticeRect.height>0&&getComputedStyle(notice).display!=='none');
      const safeTop=topVisible?Math.max(0,Math.ceil(topRect.bottom)+8):8;
      const safeBottom=noticeVisible?Math.max(0,Math.ceil(window.innerHeight-noticeRect.top)+8):8;
      root.style.setProperty('--kinojo-safe-top',safeTop+'px');
      root.style.setProperty('--kinojo-safe-bottom',safeBottom+'px');
      root.style.setProperty('--kinojo-topbar-actual-height',Math.max(0,Math.ceil(topRect?.height||0))+'px');
      root.style.setProperty('--kinojo-notice-actual-height',Math.max(0,Math.ceil(noticeRect?.height||0))+'px');
      window.dispatchEvent(new CustomEvent('kinojo:safe-area-changed',{detail:{top:safeTop,bottom:safeBottom}}));
    });
  }
  function bindSafeAreas(){
    const targets=[q('.kinojo-topbar'),q('.kinojo-notice-strip')].filter(Boolean);
    if('ResizeObserver' in window){
      kinojoSafeAreaObserver?.disconnect?.();
      kinojoSafeAreaObserver=new ResizeObserver(measureSafeAreas);
      targets.forEach(target=>kinojoSafeAreaObserver.observe(target));
    }
    window.addEventListener('resize',measureSafeAreas,{passive:true});
    window.addEventListener('orientationchange',measureSafeAreas,{passive:true});
    measureSafeAreas();
    setTimeout(measureSafeAreas,80);
    setTimeout(measureSafeAreas,500);
  }
  function canScrollY(element,delta){
    if(!(element instanceof Element))return false;
    const style=getComputedStyle(element);
    if(!/(auto|scroll)/.test(style.overflowY)||element.scrollHeight<=element.clientHeight+1)return false;
    return delta<0?element.scrollTop>1:element.scrollTop+element.clientHeight<element.scrollHeight-1;
  }
  function bindModalScrollChain(){
    const modalSelector='[role="dialog"],[aria-modal="true"],.kinojo-character-reaction-modal,.kinojo-safe-overlay,.kinojo-login-modal,.kinojo-notice-board-overlay,.kinojo-safe-error-overlay,.meter-consent-modal,.sanctuary-editor-overlay,.kinojo-event-notice-overlay,.admin-panel-modal,.kinojo-my-info-modal';
    document.addEventListener('wheel',event=>{
      if(event.defaultPrevented||event.ctrlKey||!event.deltaY||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
      const origin=event.target instanceof Element?event.target:event.target?.parentElement;
      const modal=origin?.closest?.(modalSelector);if(!origin||!modal)return;
      const scrollables=[];let node=origin;
      while(node instanceof Element){
        const style=getComputedStyle(node);
        if(/(auto|scroll)/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)scrollables.push(node);
        if(node===modal)break;
        node=node.parentElement;
      }
      if(scrollables.length<2)return;
      const inner=scrollables[0];
      if(canScrollY(inner,event.deltaY))return;
      const outer=scrollables.slice(1).find(element=>canScrollY(element,event.deltaY));
      if(!outer)return;
      event.preventDefault();
      outer.scrollTop+=event.deltaY;
    },{capture:true,passive:false});
  }
  function replayMyInfoClickAnimation_(element){
    if(!(element instanceof HTMLElement))return;
    element.classList.remove('is-clicked');
    void element.offsetWidth;
    element.classList.add('is-clicked');
    window.setTimeout(()=>element.classList.remove('is-clicked'),220);
  }
  function bind(){
    q('#kinojoMyInfoBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();replayMyInfoClickAnimation_(e.currentTarget);openMyInfoPanel();});
    q('#kinojoMyInfoMenuBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();replayMyInfoClickAnimation_(e.currentTarget);openMyInfoModal().catch(()=>{});});
    q('#kinojoMyInfoModal')?.addEventListener('click',e=>{
      if(!(e.target instanceof Element))return;
      if(e.target.closest('[data-request-confirm-cancel],#kinojoMyInfoStyleConfirmChooseBtn')){e.preventDefault();e.stopPropagation();closeMyInfoStyleConfirm_();return;}
      if(e.target.closest('#kinojoMyInfoStyleConfirmSubmitBtn')){e.preventDefault();e.stopPropagation();submitMyInfoImageRequest_({allowNoStyle:true}).catch(()=>{});return;}
      if(e.target.closest('[data-kinojo-my-info-modal-close]')){e.preventDefault();e.stopPropagation();closeMyInfoModal();return;}
      const characterButton=e.target.closest('[data-profile-character-id]');
      if(characterButton){e.preventDefault();e.stopPropagation();selectMyInfoProfileCharacter_(characterButton.dataset.profileCharacterId);return;}
      const referenceSelect=e.target.closest('[data-reference-select-slot]');
      if(referenceSelect){e.preventDefault();e.stopPropagation();selectMyInfoReferenceSlot_(referenceSelect.dataset.referenceSelectSlot);return;}
      const referenceCancel=e.target.closest('[data-reference-cancel-slot]');
      if(referenceCancel){e.preventDefault();e.stopPropagation();clearMyInfoReferencePreview_(referenceCancel.dataset.referenceCancelSlot,'편집 결과를 취소했습니다. 원본은 저장되거나 업로드되지 않았습니다.');return;}
      const referenceDelete=e.target.closest('[data-reference-delete-slot]');
      if(referenceDelete){e.preventDefault();e.stopPropagation();deleteMyInfoReference_(referenceDelete.dataset.referenceDeleteSlot).catch(()=>{});return;}
      if(e.target.closest('#kinojoMyInfoRequestSubmitBtn')){e.preventDefault();e.stopPropagation();submitMyInfoImageRequest_().catch(()=>{});return;}
      if(e.target.closest('#kinojoMyInfoProfileSelectBtn')){e.preventDefault();e.stopPropagation();q('#kinojoMyInfoProfileFileInput')?.click();return;}
      if(e.target.closest('#kinojoMyInfoProfileResetBtn')){e.preventDefault();e.stopPropagation();resetMyInfoProfileOfficial_().catch(()=>{});return;}
      if(e.target.closest('#kinojoMyInfoProfileRetryBtn')){e.preventDefault();e.stopPropagation();retryMyInfoProfileImage_().catch(()=>{});return;}
      if(e.target.closest('#kinojoMyInfoProfileUploadBtn')){e.preventDefault();e.stopPropagation();uploadMyInfoProfile_().catch(()=>{});return;}
      if(e.target.closest('#kinojoMyInfoProfileCancelBtn')){e.preventDefault();e.stopPropagation();clearMyInfoProfilePreview_('선택한 이미지를 취소했습니다.');}
    });
    q('#kinojoMyInfoPanel')?.addEventListener('keydown',e=>trapMyInfoFocus_(e,e.currentTarget));
    q('.kinojo-my-info-modal-dialog',q('#kinojoMyInfoModal'))?.addEventListener('keydown',e=>trapMyInfoFocus_(e,e.currentTarget));
    q('.kinojo-my-info-request-confirm__dialog',q('#kinojoMyInfoModal'))?.addEventListener('keydown',e=>trapMyInfoFocus_(e,e.currentTarget));
    q('#kinojoMyInfoProfileFileInput')?.addEventListener('change',e=>{handleMyInfoProfileFile_(e.target?.files?.[0]||null).catch(()=>{});});
    q('#kinojoMyInfoReferenceFileInput')?.addEventListener('change',e=>{handleMyInfoReferenceFile_(e.target?.files?.[0]||null).catch(()=>{});});
    q('#kinojoMyInfoModal')?.addEventListener('change',e=>{
      if(!(e.target instanceof HTMLInputElement)||e.target.name!=='kinojoMyInfoRequestStyle')return;
      invalidateMyInfoImageRequestResume_();
      q('#kinojoMyInfoRequestNote')?.removeAttribute('aria-invalid');
      setMyInfoImageRequestStatus_('선택한 스타일과 참고 이미지를 확인한 뒤 요청을 보내 주세요.','info');
      renderMyInfoImageRequest_();
    });
    q('#kinojoMyInfoRequestNote')?.addEventListener('input',e=>{
      invalidateMyInfoImageRequestResume_();
      e.currentTarget.removeAttribute('aria-invalid');
      renderMyInfoImageRequest_();
    });
    const profileCharacters=q('#kinojoMyInfoProfileCharacters');
    profileCharacters?.addEventListener('scroll',updateMyInfoProfileCharacterOverflow_,{passive:true});
    window.addEventListener('resize',updateMyInfoProfileCharacterOverflow_,{passive:true});
    const referenceGrid=q('#kinojoMyInfoReferenceGrid');
    ['dragenter','dragover','dragleave','drop'].forEach(type=>referenceGrid?.addEventListener(type,event=>{try{handleMyInfoReferenceDrag_(event);}catch(error){console.warn('KINOJO My Info reference drag failed:',error);}}));
    q('#kinojoMyInfoCloseBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeMyInfoPanel();});
    q('#kinojoMyInfoLayer')?.addEventListener('click',e=>{if(e.target.id==='kinojoMyInfoLayer')closeMyInfoPanel();});
    q('#kinojoMyInfoCharacterList')?.addEventListener('click',e=>{
      const row=e.target instanceof Element?e.target.closest('.kinojo-my-info-character-row'):null;
      if(!row)return;
      e.preventDefault();e.stopPropagation();
      openMyInfoCharacterDetail_(row);
    });
    q('#kinojoMyInfoCharacterList')?.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const row=e.target instanceof Element?e.target.closest('.kinojo-my-info-character-row'):null;
      if(!row)return;
      e.preventDefault();e.stopPropagation();
      openMyInfoCharacterDetail_(row);
    });
    q('#drawerToggleBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openSideDrawer();});
    q('#drawerCloseBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeSideDrawer();});
    q('#drawerPageCloseBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeDrawerPagePanel();});
    q('#sideDrawer')?.addEventListener('click',e=>{if(e.target.id==='sideDrawer')closeSideDrawer();});
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-page-panel],[data-drawer]');
      if(!btn)return;
      const type=btn.dataset.pagePanel||btn.dataset.drawer;
      if(!type)return;
      e.preventDefault();e.stopPropagation();
      const fromFooter=btn.dataset.guideMode==='standalone'||!!btn.closest('.common-footer');
      if(type==='contact'&&typeof window.openSuggestionPanel==='function'&&!fromFooter){
        window.openSuggestionPanel();
        return;
      }
      if(fromFooter)openStandalonePagePanel(type);
      else openDrawerPagePanel(type);
    },true);
    document.querySelectorAll('.common-footer').forEach(footer=>{
      footer.classList.add('kinojo-common-footer-bound');
      footer.querySelectorAll('a[href*="about.html"],a[href*="terms.html"],a[href*="privacy.html"],a[href*="contact.html"]').forEach(a=>{
        const href=a.getAttribute('href')||'';
        let type=href.includes('terms')?'terms':href.includes('privacy')?'privacy':href.includes('contact')?'contact':'about';
        a.setAttribute('href','#');a.dataset.pagePanel=type;a.dataset.guideMode='standalone';
      });
    });
    document.addEventListener('keydown',e=>{if(e.defaultPrevented)return;if(e.key==='Escape'){const requestConfirm=q('#kinojoMyInfoStyleConfirm');if(requestConfirm&&!requestConfirm.hidden)return closeMyInfoStyleConfirm_();const myInfoModal=q('#kinojoMyInfoModal');if(myInfoModal?.classList.contains('open'))return closeMyInfoModal();const myInfo=q('#kinojoMyInfoLayer');if(myInfo?.classList.contains('open'))return closeMyInfoPanel();const p=q('#drawerPagePanel');if(p?.classList.contains('open'))return closeDrawerPagePanel();const d=q('#sideDrawer');if(d?.classList.contains('open'))return closeSideDrawer();}});
  }
  function loadSanctuaryMasterRenderer(){
    if(document.querySelector('script[data-kinojo-sanctuary-master-loader]')) return;
    const script=document.createElement('script');
    script.src='/ui/kinojo-sanctuary-master.js?cache=2026081222';
    script.async=true;
    script.dataset.kinojoSanctuaryMasterLoader='true';
    document.head.appendChild(script);
  }
  const rescued=removeLegacy();
  const info=pageInfo();
  document.body.classList.add('kinojo-page-' + info.key);
  if(info.mobile) document.body.classList.add('kinojo-page-mobile');
  document.body.dataset.kinojoPage = info.key;
  window.addEventListener('kinojo:page-time',event=>setPageTime(event.detail||{}));
  document.addEventListener('visibilitychange',()=>{
    if(info.key==='admin')return;
    kinojoNoticeState.paused=document.hidden;
    if(document.hidden)clearNoticeTimer_();
    else{
      scheduleNextNotice_();
      if(kinojoNoticeState.lastFailureAt||!kinojoNoticeState.items.length)loadCommonNotices();
    }
  });
  const retryCommonNoticesIfNeeded_=()=>{
    if(info.key==='admin'||document.hidden)return;
    if(kinojoNoticeState.lastFailureAt||!kinojoNoticeState.items.length)loadCommonNotices();
  };
  window.addEventListener('focus',retryCommonNoticesIfNeeded_);
  window.addEventListener('pageshow',retryCommonNoticesIfNeeded_);
  window.addEventListener('online',()=>{if(info.key!=='admin')loadCommonNotices({force:true});});
  if(info.key==='admin'){
    bindModalScrollChain();
    bindImageGuards();
    window.KinojoCommonUI={toast,showSafeError,reportError:showSafeError,setPageTime};
    window.KinojoSafeError={show:showSafeError,report:showSafeError};
    return;
  }
  makeTopbar(rescued,info);
  makeDrawer(info);
  makeMyInfoPanel();
  makeMyInfoModal();
  syncDrawerWidth_();
  window.addEventListener('resize',syncDrawerWidth_,{passive:true});
  window.addEventListener('orientationchange',syncDrawerWidth_,{passive:true});
  window.addEventListener('kinojo:sanctuary-master-rendered',syncDrawerWidth_);
  setTimeout(syncDrawerWidth_,300);
  setTimeout(syncDrawerWidth_,1200);
  syncAuthRequiredUi_();
  setTimeout(syncAuthRequiredUi_,120);
  setTimeout(syncAuthRequiredUi_,600);
  bindSafeAreas();
  bindModalScrollChain();
  bind();
  bindCommonAdmin(info);
  bindImageGuards();
  loadSanctuaryMasterRenderer();
  window.KinojoCommonUI={toast,showSafeError,reportError:showSafeError,setPageTime,classIconFor:classIconFor_,openSideDrawer,closeSideDrawer,openDrawerPagePanel,openStandalonePagePanel,closeDrawerPagePanel,openMyInfoPanel,closeMyInfoPanel,openMyInfoModal,closeMyInfoModal,toggleAdminMenu,closeAdminMenuCommon,reloadNotices:loadCommonNotices,reloadSanctuaryAlert:()=>{const result=loadSanctuaryAlert_(info,0);setTimeout(measureSafeAreas,50);return result;},syncAuthRequiredUi:syncAuthRequiredUi_,renderVisits:renderCommonVisits,loadVisits:loadCommonVisits};
  window.KinojoSafeError={show:showSafeError,report:showSafeError};
  window.openAdminDropdown=toggleAdminMenu;
  window.closeAdminMenu=closeAdminMenuCommon;
  window.openSideDrawer=openSideDrawer;
  window.closeSideDrawer=closeSideDrawer;
  window.openDrawerPagePanel=openDrawerPagePanel;
  window.closeDrawerPagePanel=closeDrawerPagePanel;
  window.openStandalonePagePanel=openStandalonePagePanel;
  window.openMyInfoPanel=openMyInfoPanel;
  window.closeMyInfoPanel=closeMyInfoPanel;
})();
