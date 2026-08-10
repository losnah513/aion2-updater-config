/* KINOJO common UI v20260810.04 */
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
  let kinojoNoticeState = { items: [], index: 0, timer: null, paused: false };

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
  async function fetchNotices_(limit){
    return window.KinojoApi
      ? await window.KinojoApi.getAction('notices', { limit:limit })
      : await (await fetch(commonApiUrl()+(commonApiUrl().includes('?')?'&':'?')+'action=notices&limit='+encodeURIComponent(limit)+'&t='+Date.now(),{cache:'no-store'})).json();
  }
  async function loadCommonNotices(){
    const list=document.getElementById('kinojoNoticeList');
    if(!list)return;
    clearNoticeTimer_();
    try{
      const data=await fetchNotices_(5);
      const notices=(data&&data.ok&&Array.isArray(data.notices))?data.notices.slice(0,5):[];
      if(!notices.length){list.innerHTML='<span class="kinojo-notice-empty">등록된 공지가 없습니다.</span>';return;}
      kinojoNoticeState.items=notices;
      kinojoNoticeState.index=0;
      list.innerHTML=renderNoticeItemHtml_(notices[0]);
      startNoticeRotation_();
    }catch(_e){
      list.innerHTML='<span class="kinojo-notice-empty">공지사항을 불러오지 못했습니다.</span>';
    }
  }
  async function showNoticeBoardModal(){
    let notices=[];
    try{
      const data=await fetchNotices_(50);
      notices=(data&&data.ok&&Array.isArray(data.notices))?data.notices:[];
    }catch(e){
      showSafeError?.(e,{feature:'공지사항 상세 보기',title:'공지사항을 불러오지 못했습니다.',message:'잠시 후 다시 시도해 주세요.'});
      return;
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
      +'<p class="kinojo-notice-board-desc">최근 등록된 공지, 알림, 이벤트를 최신순으로 확인합니다.</p>'
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
    wrap.innerHTML='<button aria-label="관리자 콘솔 새 창 열기" class="admin-menu-btn" id="adminMenuBtn" type="button">관리</button>';
    wrap.querySelector('#adminMenuBtn').dataset.adminHref=adminConsoleHref;
    return wrap;
  }
  let sanctuaryAlertRequestSeq=0;
  function commonPassKey_(){
    const auth=window.KinojoAuth||{};
    const account=typeof auth.getAccount==='function'?auth.getAccount():null;
    const session=typeof auth.getSession==='function'?auth.getSession():null;
    return String(account?.passKey||account?.passCode||session?.passKey||session?.passCode||'').trim();
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
    const passKey=commonPassKey_();
    if(!passKey){clearSanctuaryAlert_();return;}
    if(!window.KinojoApi?.getAction||!window.KinojoSupabase?.webAction){
      if((retry||0)<20)setTimeout(()=>loadSanctuaryAlert_(info,(retry||0)+1),120);
      return;
    }
    const seq=++sanctuaryAlertRequestSeq;
    try{
      const data=await window.KinojoApi.getAction('mySanctuaryTopbar',{passKey});
      if(seq!==sanctuaryAlertRequestSeq)return;
      renderSanctuaryAlert_(data,info);
    }catch(_err){
      if(seq===sanctuaryAlertRequestSeq)clearSanctuaryAlert_();
    }
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
            <g class="menu-dots"><circle cx="6" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="18" cy="12" r="1.9"></circle></g>
            <g class="menu-lines"><path d="M5 7.5H19"></path><path d="M5 12H19"></path><path d="M5 16.5H19"></path></g>
          </svg>
        </button>
        <span class="kinojo-top-page"><strong>${info.label}</strong><small id="${pageTimeId(info)}">${timeText}</small></span>
      </div>
      <nav class="kinojo-top-nav" id="kinojoTopNav" aria-label="KINOJO 주요 메뉴">${navHtml}</nav>
      <div class="kinojo-top-center kinojo-auth-status" id="kinojoUserStatus">
        <button class="kinojo-login-btn" id="kinojoLoginBtn" type="button">로그인</button>
        <span class="kinojo-auth-label" id="kinojoAuthLabel">비회원 · 열람만 가능</span>
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
    window.addEventListener('kinojo:auth-changed',()=>{syncAuthRequiredUi_();setTimeout(()=>loadSanctuaryAlert_(info,0),20);});
    const notice=createNoticeStrip(info);
    document.body.appendChild(notice);
    setTimeout(loadCommonNotices,0);
    setTimeout(()=>loadCommonVisits(info),40);
    setTimeout(()=>loadDocumentServerTime_(info),1200);
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
  function openSideDrawer(){
    const drawer=q('#sideDrawer');const btn=q('#drawerToggleBtn');
    if(!drawer)return;
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
    const modalSelector='[role="dialog"],[aria-modal="true"],.kinojo-character-reaction-modal,.kinojo-safe-overlay,.kinojo-login-modal,.kinojo-notice-board-overlay,.kinojo-safe-error-overlay,.meter-consent-modal,.sanctuary-editor-overlay,.kinojo-event-notice-overlay,.admin-panel-modal';
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
  function bind(){
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
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=q('#drawerPagePanel');if(p?.classList.contains('open'))return closeDrawerPagePanel();const d=q('#sideDrawer');if(d?.classList.contains('open'))return closeSideDrawer();}});
  }
  function loadSanctuaryMasterRenderer(){
    if(document.querySelector('script[data-kinojo-sanctuary-master-loader]')) return;
    const script=document.createElement('script');
    script.src='/ui/kinojo-sanctuary-master.js?cache=2026071517';
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
    if(document.hidden)clearNoticeTimer_();else scheduleNextNotice_();
  });
  if(info.key==='admin'){
    bindModalScrollChain();
    bindImageGuards();
    window.KinojoCommonUI={toast,showSafeError,reportError:showSafeError,setPageTime};
    window.KinojoSafeError={show:showSafeError,report:showSafeError};
    return;
  }
  makeTopbar(rescued,info);
  makeDrawer(info);
  syncAuthRequiredUi_();
  setTimeout(syncAuthRequiredUi_,120);
  setTimeout(syncAuthRequiredUi_,600);
  bindSafeAreas();
  bindModalScrollChain();
  bind();
  bindCommonAdmin(info);
  bindImageGuards();
  loadSanctuaryMasterRenderer();
  window.KinojoCommonUI={toast,showSafeError,reportError:showSafeError,setPageTime,openSideDrawer,closeSideDrawer,openDrawerPagePanel,openStandalonePagePanel,closeDrawerPagePanel,toggleAdminMenu,closeAdminMenuCommon,reloadNotices:loadCommonNotices,reloadSanctuaryAlert:()=>{const result=loadSanctuaryAlert_(info,0);setTimeout(measureSafeAreas,50);return result;},syncAuthRequiredUi:syncAuthRequiredUi_,renderVisits:renderCommonVisits,loadVisits:loadCommonVisits};
  window.KinojoSafeError={show:showSafeError,report:showSafeError};
  window.openAdminDropdown=toggleAdminMenu;
  window.closeAdminMenu=closeAdminMenuCommon;
  window.openSideDrawer=openSideDrawer;
  window.closeSideDrawer=closeSideDrawer;
  window.openDrawerPagePanel=openDrawerPagePanel;
  window.closeDrawerPagePanel=closeDrawerPagePanel;
  window.openStandalonePagePanel=openStandalonePagePanel;
})();
