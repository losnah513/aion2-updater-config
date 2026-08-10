/*
 * KINOJO Character Manual Detail Refresh
 * 역할: 공통 캐릭터 모달의 수동 전체 상세 갱신, 진행도, 저장 장비·데바니온 상세 표시.
 * 규칙: 공식 API 직접 호출·분류·계산은 금지하고 character-detail-refresh Server 응답만 사용한다.
 */
(function(){
  'use strict';

  const API_VERSION = '305.1';
  const POLL_MS = 1800;
  const state = {
    currentKey:'',
    identity:null,
    status:null,
    pollTimer:null,
    tickTimer:null,
    statusLoading:false,
    starting:false,
    mobileEquipmentView:'list',
    mobileEquipmentScrollTop:{weaponArmor:0,accessory:0}
  };

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function safeUrl(value){
    const raw=String(value||'').trim();
    if(!raw) return '';
    if(raw.startsWith('//')) return 'https:'+raw;
    if(raw.startsWith('/') || /^https:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw.replace(/"/g,'%22');
    return '';
  }

  function number(value){
    const n=Number(value);return Number.isFinite(n)?n:0;
  }

  function invoke(action,payload){
    const core=window.KinojoSupabaseClientCore;
    if(!core || typeof core.invokeEdgeFunction!=='function') return Promise.reject(new Error('상세 갱신 Server 연결 모듈을 불러오지 못했습니다.'));
    return core.invokeEdgeFunction('character-detail-refresh',Object.assign({},payload||{}, {
      action:String(action||'status'),clientVersion:'KINOJO_WEB_DETAIL_'+API_VERSION
    }));
  }

  function identityFromHref(href){
    const raw=String(href||'').trim();
    if(!raw) return {serverId:'',characterId:''};
    try{
      const url=new URL(raw,location.origin);
      const parts=url.pathname.split('/').filter(Boolean);
      const index=parts.findIndex(part=>part.toLowerCase()==='characters');
      return {
        serverId:index>=0 ? String(parts[index+1]||'') : '',
        characterId:index>=0 ? decodeURIComponent(String(parts[index+2]||'')) : ''
      };
    }catch(_err){ return {serverId:'',characterId:''}; }
  }

  function modalIdentity(){
    const modal=document.getElementById('kinojoCharacterReactionModal');
    if(!modal || !modal.classList.contains('open')) return null;
    const link=document.getElementById('kinojoCharacterReactionDetail');
    const parsed=identityFromHref(link && link.getAttribute('href'));
    const characterName=String(document.getElementById('kinojoCharacterReactionTitle')?.textContent||'').trim();
    if(!parsed.serverId || !characterName) return null;
    return {serverId:parsed.serverId,characterId:parsed.characterId,characterName};
  }

  function identityKey(identity){
    const item=identity||{};
    return [item.serverId,item.characterId||item.characterName].join('|');
  }

  function isActive(job){
    return !!job && ['queued','running','waiting'].includes(String(job.status||''));
  }

  function formatDate(value){
    if(!value) return '';
    const date=new Date(value);if(Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function formatRemaining(seconds){
    const total=Math.max(0,Math.ceil(number(seconds)));
    const min=Math.floor(total/60),sec=total%60;
    return min+':'+String(sec).padStart(2,'0');
  }


  function detailErrorCode(error){
    const values=[error?.code,error?.data?.code,error?.details?.code,error?.body?.code,error?.response?.code];
    for(const value of values){
      const code=String(value||'').trim();
      if(code) return code;
    }
    const message=String(error?.message||error||'');
    const match=message.match(/\b(EQUIPMENT_DETAIL_NOT_STORED|DAEVANION_DETAIL_NOT_STORED)\b/);
    if(match) return match[1];
    if(/저장된 장비 상세정보가 없습니다|장비 상세정보.*갱신을 먼저/.test(message)) return 'EQUIPMENT_DETAIL_NOT_STORED';
    if(/저장된 데바니온 상세정보가 없습니다|데바니온 상세정보.*갱신을 먼저/.test(message)) return 'DAEVANION_DETAIL_NOT_STORED';
    return '';
  }

  function detailStateContext(){
    const job=state.status?.job||null;
    return {
      job,
      active:isActive(job),
      failed:number(job?.progress?.overall?.failed),
      remaining:cooldownRemaining(job)
    };
  }

  function detailStateMarkup(kind,error){
    const isEquipment=kind==='equipment';
    const label=isEquipment?'장비':'데바니온';
    const ctx=detailStateContext();
    const code=detailErrorCode(error);
    const missing=code===(isEquipment?'EQUIPMENT_DETAIL_NOT_STORED':'DAEVANION_DETAIL_NOT_STORED');
    if(!missing){
      return '<div class="kinojo-detail-state is-error"><i aria-hidden="true">!</i><strong>'+label+' 상세 조회 실패</strong><span>'+esc(error?.message||error||'잠시 뒤 다시 선택해 주세요.')+'</span></div>';
    }
    let tone='is-missing',title=label+' 상세정보 미갱신';
    let message='기본 '+label+' 정보는 저장되어 있지만 옵션·노드 상세는 아직 수집되지 않았습니다.';
    let action='전체 상세 갱신으로 이동';
    if(ctx.active){
      tone='is-running';title='상세 갱신 진행 중';
      message='현재 전체 상세 갱신이 진행 중입니다. 저장이 완료된 뒤 다시 선택해 주세요.';
      action='갱신 진행 상태 보기';
    }else if(ctx.failed>0){
      message='이번 전체 상세 갱신에서 이 항목의 상세정보가 저장되지 않았습니다. 상단 실패 수량을 확인하고 다음 갱신 가능 시 다시 실행해 주세요.';
    }
    return '<div class="kinojo-detail-state '+tone+'"><i aria-hidden="true">'+(ctx.active?'…':'i')+'</i><strong>'+title+'</strong><span>'+message+'</span><button type="button" data-detail-refresh-jump>'+action+'</button></div>';
  }

  function renderDetailState(root,kind,error){
    if(!root) return;
    const code=detailErrorCode(error);
    const missingCodes=['EQUIPMENT_DETAIL_NOT_STORED','DAEVANION_DETAIL_NOT_STORED'];
    root.classList.remove('kinojo-official-item-detail');
    root.dataset.loadedEquipmentKey='';
    if(missingCodes.includes(code)){
      root.dataset.detailStateKind=kind;
      root.dataset.detailStateCode=code;
    }else{
      delete root.dataset.detailStateKind;
      delete root.dataset.detailStateCode;
    }
    const closeButton=root.hasAttribute('data-persistent-detail')?'':'<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button>';
    root.innerHTML=closeButton+detailStateMarkup(kind,error);
  }

  function syncVisibleDetailStates(){
    document.querySelectorAll('[data-detail-state-kind][data-detail-state-code]').forEach(root=>{
      renderDetailState(root,String(root.dataset.detailStateKind||'equipment'),{code:String(root.dataset.detailStateCode||'')});
    });
  }

  function focusDetailRefreshPanel(){
    const panel=ensurePanel();
    if(!panel) return;
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    requestAnimationFrame(()=>{
      const button=document.getElementById('kinojoDetailRefreshBtn');
      try{button?.focus({preventScroll:true});}catch(_err){button?.focus();}
    });
  }

  function ensurePanel(){
    const modal=document.getElementById('kinojoCharacterReactionModal');
    const status=document.getElementById('kinojoCharacterLiveStatus');
    if(!modal || !status) return null;
    const slot=document.getElementById('kinojoCharacterDetailRefreshSlot');
    let panel=document.getElementById('kinojoCharacterDetailRefresh');
    if(panel){
      if(slot && panel.parentElement!==slot) slot.appendChild(panel);
      return panel;
    }
    panel=document.createElement('section');
    panel.id='kinojoCharacterDetailRefresh';
    panel.className='kinojo-character-detail-refresh';
    panel.innerHTML=
      '<header class="kinojo-detail-refresh-head">'+
        '<div><strong>전체 상세 정보</strong><span id="kinojoDetailRefreshMeta">저장 상태 확인 중</span></div>'+
        '<button type="button" id="kinojoDetailRefreshBtn">전체 상세 정보 갱신</button>'+
      '</header>'+
      '<p class="kinojo-detail-refresh-message" id="kinojoDetailRefreshMessage">기본 조회 외 장비 옵션·마석·신석·데바니온 상세를 사용자가 요청할 때만 갱신합니다.</p>'+
      '<div class="kinojo-detail-refresh-progress" id="kinojoDetailRefreshProgress" hidden></div>';
    if(slot) slot.appendChild(panel);
    else status.insertAdjacentElement('afterend',panel);
    panel.querySelector('#kinojoDetailRefreshBtn')?.addEventListener('click',startRefresh);
    return panel;
  }

  const PROGRESS_ROWS=[
    ['weapon','무기'],['armor','방어구'],['accessory','장신구'],['arcana','아르카나'],['daevanion','데바니온']
  ];

  function renderProgress(job){
    const root=document.getElementById('kinojoDetailRefreshProgress');
    if(!root) return;
    const progress=job && job.progress || {};
    const hasTotals=PROGRESS_ROWS.some(([key])=>number(progress[key]?.total)>0);
    root.hidden=!job || (!hasTotals && !isActive(job));
    if(root.hidden){root.innerHTML='';return;}
    root.innerHTML=PROGRESS_ROWS.map(([key,label])=>{
      const row=progress[key]||{};
      const done=number(row.done),failed=number(row.failed),total=number(row.total);
      const processed=Math.min(total,done+failed);
      const percent=total>0?Math.round(processed/total*100):0;
      const suffix=failed>0?' · 실패 '+failed:(total>0&&processed>=total?' · 완료':'');
      return '<article class="'+(String(job.currentCategory||'')===key?'active':'')+'">'+
        '<div><span>'+esc(label)+'</span><strong>'+done+' / '+total+esc(suffix)+'</strong></div>'+
        '<i><b style="width:'+percent+'%"></b></i>'+
      '</article>';
    }).join('');
  }

  function cooldownRemaining(job){
    const until=job && job.cooldownUntil ? new Date(job.cooldownUntil).getTime() : 0;
    return until>Date.now()?Math.ceil((until-Date.now())/1000):0;
  }

  function renderStatus(data){
    state.status=data||null;
    const panel=ensurePanel();if(!panel) return;
    const btn=document.getElementById('kinojoDetailRefreshBtn');
    const meta=document.getElementById('kinojoDetailRefreshMeta');
    const message=document.getElementById('kinojoDetailRefreshMessage');
    const job=data && data.job || null;
    const remaining=cooldownRemaining(job);

    if(!job){
      if(btn){btn.disabled=state.starting;btn.textContent=state.starting?'갱신 요청 중':'전체 상세 정보 갱신';}
      if(meta) meta.textContent=data?.hasStoredDetail?'저장된 일부 상세 정보 있음':'아직 상세 갱신 기록 없음';
      if(message) message.textContent=data?.message||'버튼을 누른 캐릭터만 장비·데바니온 상세를 순차 갱신합니다.';
      renderProgress(null);syncVisibleDetailStates();return;
    }

    if(isActive(job)){
      if(btn){btn.disabled=true;btn.textContent=job.status==='waiting'?'자동 재개 대기':'전체 상세 갱신 중';}
      if(meta) meta.textContent='공식 요청 '+number(job.requestCount)+'회 · 모달을 닫아도 계속 진행';
      if(message) message.textContent=job.currentLabel||'상세정보를 수집하고 있습니다.';
    }else if(remaining>0){
      if(btn){btn.disabled=true;btn.textContent='다시 갱신 '+formatRemaining(remaining)+' 후';}
      if(meta) meta.textContent=(job.completedAt?'마지막 갱신 '+formatDate(job.completedAt):'갱신 종료')+' · 30분 공용 쿨타임';
      if(message){
        const failed=number(job.progress?.overall?.failed);
        message.textContent=job.status==='failed'?(job.lastErrorMessage||'상세정보 갱신에 실패했습니다.'):
          (failed>0?'상세 갱신 완료 · 실패 '+failed+'건은 다음 갱신에서 다시 확인합니다.':'전체 상세정보가 저장되었습니다. 장비를 누르면 옵션·마석·신석을 확인할 수 있습니다.');
      }
    }else{
      if(btn){btn.disabled=state.starting;btn.textContent=state.starting?'갱신 요청 중':'전체 상세 정보 갱신';}
      if(meta) meta.textContent=job.completedAt?'마지막 갱신 '+formatDate(job.completedAt):'다시 갱신 가능';
      if(message) message.textContent=job.status==='failed'?(job.lastErrorMessage||'이전 갱신에 실패했습니다.'):'30분 대기시간이 끝났습니다.';
    }
    renderProgress(job);
    syncVisibleDetailStates();
  }

  function stopPoll(){
    if(state.pollTimer){clearTimeout(state.pollTimer);state.pollTimer=null;}
  }

  function schedulePoll(delay=POLL_MS){
    stopPoll();state.pollTimer=setTimeout(()=>loadStatus(true),delay);
  }

  async function loadStatus(fromPoll){
    if(state.statusLoading || !state.identity) return;
    state.statusLoading=true;
    try{
      const data=await invoke('status',state.identity);
      renderStatus(data);
      if(isActive(data?.job)) schedulePoll(); else stopPoll();
    }catch(error){
      const message=document.getElementById('kinojoDetailRefreshMessage');
      if(message) message.textContent='상세 갱신 상태 확인 실패: '+(error.message||error);
      if(fromPoll) schedulePoll(3500);
    }finally{state.statusLoading=false;}
  }

  async function startRefresh(){
    if(state.starting || !state.identity) return;
    state.starting=true;renderStatus(state.status||{});
    try{
      const data=await invoke('start',state.identity);
      renderStatus(Object.assign({},data,{job:data.job||state.status?.job||null}));
      schedulePoll(650);
    }catch(error){
      const message=document.getElementById('kinojoDetailRefreshMessage');
      if(message) message.textContent='전체 상세 갱신 시작 실패: '+(error.message||error);
    }finally{state.starting=false;}
  }

  function setupOverviewBridge(){
    const api=window.KinojoSupabase;
    if(!api || api.__manualDetailOverviewWrapped || typeof api.getLiveCharacterProfile!=='function') return;
    const original=api.getLiveCharacterProfile.bind(api);
    api.getLiveCharacterProfile=async function(action,extra){
      const base=await original(action,extra);
      if(String(action||'overview')!=='overview') return base;
      try{
        const manual=await invoke('overview',extra||{});
        if(!manual || manual.available!==true) return base;
        return Object.assign({},base,{
          source:manual.source||base.source,
          fetchedAt:manual.detailRefresh?.refreshedAt||base.fetchedAt,
          profile:Object.assign({},base.profile||{},manual.profile||{}),
          baseStats:Array.isArray(manual.baseStats)?manual.baseStats:base.baseStats,
          equipment:Array.isArray(manual.equipment)?manual.equipment:base.equipment,
          arcana:Array.isArray(manual.arcana)?manual.arcana:base.arcana,
          skills:Array.isArray(manual.skills)?manual.skills:base.skills,
          daevanion:Array.isArray(manual.daevanion)?manual.daevanion:base.daevanion,
          petwing:manual.petwing||base.petwing,
          detailSnapshot:manual.detailSnapshot||base.detailSnapshot,
          detailSource:'MANUAL_FULL_DETAIL_REFRESH',
          detailAvailable:true,
          equipmentDetailStored:true,
          detailRefresh:manual.detailRefresh,
          note:'사용자가 요청한 최신 전체 상세 갱신값과 Server 저장 정보를 병합했습니다.'
        });
      }catch(_err){return base;}
    };
    Object.defineProperty(api,'__manualDetailOverviewWrapped',{value:true,configurable:false});
  }

  function isMobileEquipmentViewport(){
    if(typeof window.matchMedia==='function') return window.matchMedia('(max-width: 640px)').matches;
    return number(window.innerWidth)<=640;
  }

  function equipmentPanel(){
    return document.querySelector('[data-kinojo-character-panel="equipment"]');
  }

  function equipmentLayout(){
    return equipmentPanel()?.querySelector('.kinojo-character-equipment-layout')||null;
  }

  function activeEquipmentCategory(){
    const active=equipmentPanel()?.querySelector('[data-equipment-category].active');
    return String(active?.dataset?.equipmentCategory||'weaponArmor');
  }

  function resetMobileEquipmentState(){
    state.mobileEquipmentView='list';
    state.mobileEquipmentScrollTop={weaponArmor:0,accessory:0};
  }

  function resetClosedMobileEquipmentState(){
    resetMobileEquipmentState();
    state.currentKey='';
    state.identity=null;
  }

  function observeModalState(){
    const modal=document.getElementById('kinojoCharacterReactionModal');
    if(!modal || modal.dataset.mobileEquipmentObserver==='ready') return;
    modal.dataset.mobileEquipmentObserver='ready';
    new MutationObserver(()=>{
      if(!modal.classList.contains('open')) resetClosedMobileEquipmentState();
    }).observe(modal,{attributes:true,attributeFilter:['class','aria-hidden']});
  }

  function rememberMobileEquipmentScroll(){
    if(!isMobileEquipmentViewport()) return;
    const list=equipmentPanel()?.querySelector('.kinojo-character-equipment-list');
    if(!list) return;
    state.mobileEquipmentScrollTop[activeEquipmentCategory()]=number(list.scrollTop);
  }

  function ensureMobileEquipmentDetailView(root){
    if(!root) return null;
    const current=root.closest('.kinojo-character-equipment-detail-view');
    if(current) return current;
    const parent=root.parentNode;
    if(!parent) return null;
    const wrapper=document.createElement('section');
    wrapper.className='kinojo-character-equipment-detail-view';
    const back=document.createElement('button');
    back.type='button';
    back.className='kinojo-character-equipment-mobile-back';
    back.dataset.mobileEquipmentBack='';
    back.textContent='← 장비 목록';
    parent.insertBefore(wrapper,root);
    wrapper.append(back,root);
    return wrapper;
  }

  function syncMobileEquipmentView(options){
    const layout=equipmentLayout();
    if(!layout) return;
    const root=document.getElementById('kinojoLiveEquipmentDetail');
    ensureMobileEquipmentDetailView(root);
    const detail=isMobileEquipmentViewport()&&state.mobileEquipmentView==='detail';
    layout.classList.toggle('is-mobile-detail-view',detail);
    layout.dataset.mobileEquipmentView=detail?'detail':'list';
    if(!detail&&options?.restoreScroll){
      requestAnimationFrame(()=>{
        const currentLayout=equipmentLayout();
        const list=currentLayout?.querySelector('.kinojo-character-equipment-list');
        if(list) list.scrollTop=number(state.mobileEquipmentScrollTop[activeEquipmentCategory()]);
        const selected=currentLayout?.querySelector('[data-live-equipment-item].is-selected');
        try{selected?.focus({preventScroll:true});}catch(_err){selected?.focus();}
      });
    }
  }

  function showMobileEquipmentDetail(button){
    if(!isMobileEquipmentViewport()) return;
    const panel=button?.closest?.('[data-kinojo-character-panel]');
    if(panel?.dataset?.kinojoCharacterPanel!=='equipment') return;
    rememberMobileEquipmentScroll();
    state.mobileEquipmentView='detail';
    syncMobileEquipmentView();
    requestAnimationFrame(()=>{
      const detail=equipmentLayout()?.querySelector('.kinojo-character-equipment-detail-pane');
      if(detail) detail.scrollTop=0;
      const back=equipmentLayout()?.querySelector('[data-mobile-equipment-back]');
      try{back?.focus({preventScroll:true});}catch(_err){back?.focus();}
    });
  }

  function showMobileEquipmentList(){
    if(!isMobileEquipmentViewport()) return;
    state.mobileEquipmentView='list';
    syncMobileEquipmentView({restoreScroll:true});
  }

  function syncModal(){
    setupOverviewBridge();
    const identity=modalIdentity();
    if(!identity){
      stopPoll();
      if(state.currentKey) resetClosedMobileEquipmentState();
      return;
    }
    ensurePanel();
    observeModalState();
    const key=identityKey(identity);
    if(key!==state.currentKey){
      stopPoll();resetMobileEquipmentState();state.currentKey=key;state.identity=identity;state.status=null;
      loadStatus(false);
    }
    syncMobileEquipmentView();
  }

  function itemValue(row){
    const min=row?.minValue;
    const value=row?.value;
    const base=min!==undefined&&min!==null&&String(min)!=='' ? String(min)+' ~ '+String(value??'-') : String(value??'-');
    const extra=String(row?.extra??'').trim();
    const hasExtra=extra && !/^\+?0(?:\.0+)?%?$/.test(extra);
    return {base,extra:hasExtra?(extra.startsWith('-')?extra:'+'+extra):''};
  }

  function statRows(rows,exceed){
    return (Array.isArray(rows)?rows:[]).filter(row=>!!row.exceed===!!exceed).map(row=>{
      const value=itemValue(row);
      if(exceed){
        const display=value.extra||value.base;
        return '<div class="kinojo-detail-stat is-exceed"><span>'+esc(row.name||row.id||'-')+'</span><strong>'+esc(display)+'</strong></div>';
      }
      return '<div class="kinojo-detail-stat"><span>'+esc(row.name||row.id||'-')+'</span><strong>'+esc(value.base)+(value.extra?' <em>('+esc(value.extra)+')</em>':'')+'</strong></div>';
    }).join('');
  }

  function equipmentDetailRoot(button){
    const id=String(button?.dataset?.detailRoot||'kinojoLiveEquipmentDetail');
    return document.getElementById(id);
  }

  function markEquipmentSelection(button){
    const panel=button?.closest?.('[data-kinojo-character-panel]');
    panel?.querySelectorAll('[data-live-equipment-item]').forEach(row=>{
      const selected=row===button;
      row.classList.toggle('is-selected',selected);
      row.setAttribute('aria-selected',selected?'true':'false');
    });
  }

  function renderEquipmentDetail(data,button,root){
    if(!root) return;
    const item=data?.item||{};
    const main=Array.isArray(item.mainStats)?item.mainStats:[];
    const sub=Array.isArray(item.subStats)?item.subStats:[];
    const stones=Array.isArray(item.magicStoneStat)?item.magicStoneStat:[];
    const godstones=Array.isArray(item.godStoneStat)?item.godStoneStat:[];
    const sources=Array.isArray(item.sources)?item.sources:[];
    const icon=safeUrl(item.icon||button?.querySelector('img')?.src);
    const classes=Array.isArray(item.classNames)?item.classNames.join(', '):String(item.classNames||'');
    const levelExtra=number(item.levelValue)>0?' <em>(+'+number(item.levelValue)+')</em>':'';
    const info=[
      ['분류',item.categoryName||item.slotLabel||item.slotPosName||'-'],
      ['아이템 레벨',String(item.level??'-')+levelExtra],
      ['종족 제한',item.raceName||'-'],
      ['직업 제한',classes||'-'],
      ['장착 제한 레벨',item.equipLevel??'-']
    ];
    root.hidden=false;
    delete root.dataset.detailStateKind;
    delete root.dataset.detailStateCode;
    root.dataset.loadedEquipmentKey=String(button?.dataset?.equipmentKey||'');
    root.classList.add('kinojo-official-item-detail');
    const closeButton=root.hasAttribute('data-persistent-detail')?'':'<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button>';
    root.innerHTML=
      closeButton+
      '<header class="kinojo-official-item-head">'+(icon?'<img src="'+icon+'" alt="">':'')+
        '<div><span>'+(number(item.exceedLevel)?'<b>'+number(item.exceedLevel)+'</b> ':'')+(number(item.enchantLevel)?'+'+number(item.enchantLevel)+' ':'')+'</span><strong>'+esc(item.name||'선택 장비')+'</strong><small>'+esc(item.gradeName||item.grade||'')+'</small></div>'+
      '</header>'+
      '<section class="kinojo-official-item-section"><h4>아이템 정보</h4><div class="kinojo-official-info-list">'+
        info.map(row=>'<div><span>'+esc(row[0])+'</span><strong>'+row[1]+'</strong></div>').join('')+
      '</div></section>'+
      '<section class="kinojo-official-item-section"><h4>옵션</h4><div class="kinojo-official-stat-list">'+
        statRows(main,false)+statRows(main,true)+
      '</div></section>'+
      (item.soulBindRate!==undefined&&String(item.soulBindRate)!==''?'<section class="kinojo-official-item-section"><div class="kinojo-official-soul"><span>영혼 각인</span><strong>'+esc(item.soulBindRate)+'%</strong></div><div class="kinojo-official-stat-list">'+statRows(sub,false)+'</div></section>':
        (sub.length?'<section class="kinojo-official-item-section"><h4>추가 옵션</h4><div class="kinojo-official-stat-list">'+statRows(sub,false)+'</div></section>':''))+
      (stones.length?'<section class="kinojo-official-item-section"><h4>마석</h4><div class="kinojo-official-stones">'+stones.map(stone=>
        '<div class="grade-'+esc(String(stone.grade||'').toLowerCase())+'">'+(safeUrl(stone.icon)?'<img src="'+safeUrl(stone.icon)+'" alt="">':'')+'<span>'+esc(stone.name||stone.id||'-')+'</span><strong>'+esc(stone.value||'-')+'</strong></div>'
      ).join('')+'</div></section>':'')+
      (godstones.length?'<section class="kinojo-official-item-section"><h4>신석</h4><div class="kinojo-official-godstones">'+godstones.map(stone=>
        '<article>'+(safeUrl(stone.icon)?'<img src="'+safeUrl(stone.icon)+'" alt="">':'')+'<div><strong>'+esc(stone.name||'신석')+'</strong><p>'+esc(stone.desc||'').replace(/\n/g,'<br>')+'</p></div></article>'
      ).join('')+'</div></section>':'')+
      '<section class="kinojo-official-item-section is-muted"><h4>기타 정보</h4><div class="kinojo-official-flags">'+
        [
          ['획득처',sources.join(', ')||'-'],['거래',item.tradable?'가능':'불가'],['창고',item.storable?'가능':'불가'],
          ['강화',item.enchantable?'가능':'불가'],['분해',item.decomposable?'가능':'불가']
        ].map(row=>'<span><b>'+esc(row[0])+'</b>'+esc(row[1])+'</span>').join('')+
      '</div><small>상세 갱신 '+esc(formatDate(data.refreshedAt))+'</small></section>';
  }

  async function loadEquipmentDetail(button){
    const root=equipmentDetailRoot(button);if(!root) return;
    if(!state.identity) state.identity=modalIdentity();
    if(!state.identity) return;
    markEquipmentSelection(button);
    root.hidden=false;
    root.classList.remove('kinojo-official-item-detail');
    delete root.dataset.detailStateKind;
    delete root.dataset.detailStateCode;
    root.dataset.loadedEquipmentKey='';
    root.innerHTML='<div class="kinojo-character-live-loading">저장된 장비 상세 옵션을 불러오는 중입니다.</div>';
    try{
      const data=await invoke('equipmentItem',Object.assign({},state.identity,{itemId:number(button.dataset.itemId),slotPos:number(button.dataset.slotPos)}));
      renderEquipmentDetail(data,button,root);
    }catch(error){
      renderDetailState(root,'equipment',error);
    }
  }

  function renderDaevanionDetail(data){
    const root=document.getElementById('kinojoLiveDaevanionDetail');if(!root) return;
    const board=data?.board||{};
    const nodes=Array.isArray(board.nodeList)?board.nodeList:[];
    const openNodes=nodes.filter(row=>number(row.open)===1);
    const statEffects=Array.isArray(board.openStatEffectList)?board.openStatEffectList:[];
    const skillEffects=Array.isArray(board.openSkillEffectList)?board.openSkillEffectList:[];
    const effects=[...statEffects,...skillEffects].map(row=>row?.desc).filter(Boolean);
    root.hidden=false;
    delete root.dataset.detailStateKind;
    delete root.dataset.detailStateCode;
    root.innerHTML=
      '<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button>'+
      '<div class="kinojo-daevanion-detail-head"><strong>'+esc(board.name||'데바니온 상세')+'</strong><span>활성 노드 '+openNodes.length+' / '+nodes.length+'</span></div>'+
      '<section class="kinojo-daevanion-effects"><h4>활성 누적 효과</h4>'+
        (effects.length?effects.map(value=>'<p>'+esc(value)+'</p>').join(''):'<p>활성 누적 효과가 없습니다.</p>')+
      '</section>'+
      '<section class="kinojo-daevanion-nodes"><h4>활성 노드</h4><div>'+openNodes.slice(0,225).map(node=>
        '<article>'+(safeUrl(node.icon)?'<img src="'+safeUrl(node.icon)+'" alt="">':'')+'<span><b>'+esc(node.name||'-')+'</b><small>'+esc((node.effectList||[]).map(row=>row?.desc).filter(Boolean).join(' · '))+'</small></span></article>'
      ).join('')+'</div></section>'+
      '<small class="kinojo-detail-refreshed-at">상세 갱신 '+esc(formatDate(data.refreshedAt))+'</small>';
  }

  async function loadDaevanionDetail(button){
    const root=document.getElementById('kinojoLiveDaevanionDetail');if(!root||!state.identity) return;
    root.hidden=false;delete root.dataset.detailStateKind;delete root.dataset.detailStateCode;root.innerHTML='<div class="kinojo-character-live-loading">저장된 데바니온 상세를 불러오는 중입니다.</div>';
    try{
      const data=await invoke('daevanionDetail',Object.assign({},state.identity,{boardId:number(button.dataset.boardId)}));
      renderDaevanionDetail(data);
    }catch(error){
      renderDetailState(root,'daevanion',error);
    }
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;if(!target) return;
    const modal=document.getElementById('kinojoCharacterReactionModal');
    if(target.closest('[data-kinojo-character-reaction-close]') && modal?.contains(target)) resetClosedMobileEquipmentState();
    const jump=target.closest('[data-detail-refresh-jump]');
    if(jump && modal?.contains(jump)){
      event.preventDefault();focusDetailRefreshPanel();return;
    }
    const back=target.closest('[data-mobile-equipment-back]');
    if(back && modal?.contains(back)){
      event.preventDefault();showMobileEquipmentList();return;
    }
    const category=target.closest('[data-equipment-category]');
    if(category && modal?.contains(category)){
      rememberMobileEquipmentScroll();
      state.mobileEquipmentView='list';
      requestAnimationFrame(()=>syncMobileEquipmentView({restoreScroll:true}));
    }
    const equipment=target.closest('[data-live-equipment-item]');
    if(equipment && modal?.contains(equipment)){
      event.preventDefault();
      loadEquipmentDetail(equipment);
      if(event.isTrusted) showMobileEquipmentDetail(equipment);
      return;
    }
    const board=target.closest('[data-live-daevanion-board]');
    if(board && document.getElementById('kinojoCharacterReactionModal')?.contains(board)){
      event.preventDefault();loadDaevanionDetail(board);return;
    }
  },true);

  window.addEventListener('resize',()=>requestAnimationFrame(()=>syncMobileEquipmentView()));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && document.getElementById('kinojoCharacterReactionModal')?.classList.contains('open')) resetClosedMobileEquipmentState();
  },true);

  state.tickTimer=setInterval(()=>{
    if(state.status?.job) renderStatus(state.status);
    syncModal();
  },1000);

  const observer=new MutationObserver(()=>requestAnimationFrame(syncModal));
  const start=()=>{
    setupOverviewBridge();syncModal();
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','href']});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
