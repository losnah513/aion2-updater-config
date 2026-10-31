/*
 * KINOJO Hall of Fame event road
 * 역할: 명예의 전당 정적/동적 이벤트와 오버플로 텍스트 마키, 반응 카드 자동 순환을 관리합니다.
 * 주의: 레거시 공사중 팝업(openConstructionNotice)은 제거되었으므로 이 파일에서 되살리지 않습니다.
 */
let hallFamilyRequest=0;
function openHallFamilyRanking(metric,opener){
  if(!['power','alts'].includes(metric))return;
  document.getElementById('hofFamilyRankingDialog')?.close();
  document.getElementById('hofFamilyRankingDialog')?.remove();
  const dialog=document.createElement('dialog');
  dialog.id='hofFamilyRankingDialog';dialog.className='hof-family-dialog';
  dialog.setAttribute('aria-labelledby','hofFamilyRankingTitle');
  const title=metric==='power'?'ALL FOR ONE':'ONE FOR ALL';
  const scope=!!includeAllLegions;
  dialog.innerHTML='<header><div><h2 id="hofFamilyRankingTitle">'+title+' 전체 순위</h2><p>'+(scope?'전체 레기온':'기본 레기온')+' · '+(metric==='power'?'본캐 + 부캐 PVE 합산':'연결된 부캐 수')+'</p></div><button type="button" data-family-close aria-label="전체 순위 닫기">닫기</button></header><div data-family-content></div>';
  document.body.append(dialog);
  let request=0;
  let controller=null;
  const content=dialog.querySelector('[data-family-content]');
  dialog.querySelector('[data-family-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{controller?.abort();if(request===hallFamilyRequest)hallFamilyRequest++;dialog.remove();opener?.focus();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  async function fetchPage(page){
    request=++hallFamilyRequest;
    controller?.abort();
    controller=new AbortController();
    content.setAttribute('aria-busy','true');
    content.innerHTML='<div class="hof-family-loading" role="status"><strong>'+(metric==='power'?'본캐와 부캐 전투력 합산 순위 집계중입니다':'연결된 부캐 수 순위 집계중입니다')+'</strong><progress aria-label="서버 순위 집계 진행 중"></progress><span>1 / 2 · 서버에서 집계하고 있습니다.</span></div>';
    try{
      const result=await window.KinojoSupabase.rpc('kinojo_web_get_hof_family_rankings_v541',{p_metric:metric,p_page:page,p_include_all_legions:scope},{signal:controller.signal,timeoutMs:15000});
      if(request!==hallFamilyRequest||!dialog.open)return;
      if(!result?.ok||result.page!==page||!Array.isArray(result.items)||result.items.length>20)throw Error('INVALID_FAMILY_RANKING');
      const total=Math.max(0,Number(result.total)||0),pages=Math.max(1,Math.ceil(total/20));
      content.innerHTML='<div class="hof-family-complete" role="status"><progress value="1" max="1" aria-label="순위 집계 완료"></progress><span>2 / 2 · 집계 완료 · '+total.toLocaleString('ko-KR')+'명</span></div>'
        +'<p class="hof-family-asof">'+escapeHtml(hofFormatKstDate(result.generatedAt))+' 조회 기준 · 페이지 이동 시 최신 순위로 갱신됩니다.</p>'
        +(result.items.length?'<ol class="hof-family-ranking-list">'+result.items.map(item=>'<li><b>'+Number(item.rank).toLocaleString('ko-KR')+'위</b><div><strong>'+escapeHtml(hofCharName(item))+'</strong><small>['+escapeHtml(hofServerName(item))+'] · 본캐 1명 · 부캐 '+Number(item.altCount||0)+'명</small></div><strong title="'+escapeHtml(metric==='power'?hofPowerFull(item.familyPower):'')+'">'+escapeHtml(metric==='power'?hofPowerShort(item.familyPower):Number(item.altCount||0).toLocaleString('ko-KR')+'명')+'</strong></li>').join('')+'</ol>':'<p class="hof-family-empty">선택한 범위에 집계된 순위가 없습니다.</p>')
        +'<nav aria-label="전체 순위 페이지"><button type="button" data-family-prev '+(page<=1?'disabled':'')+'>이전 20명</button><span>'+page+' / '+pages+'</span><button type="button" data-family-next '+(page>=pages?'disabled':'')+'>다음 20명</button></nav>';
      content.querySelector('[data-family-prev]').onclick=()=>fetchPage(page-1);
      content.querySelector('[data-family-next]').onclick=()=>fetchPage(page+1);
    }catch(error){
      if(request!==hallFamilyRequest||!dialog.open)return;
      content.innerHTML='<div class="hof-family-empty" role="alert"><p>순위를 집계하지 못했습니다. 다시 시도해 주세요.</p><button type="button" data-family-retry>다시 집계</button></div>';
      content.querySelector('[data-family-retry]').onclick=()=>fetchPage(page);
    }finally{if(request===hallFamilyRequest&&dialog.open)content.setAttribute('aria-busy','false');}
  }
  dialog.showModal();fetchPage(1);
}

function bindHallStaticEvents(){
  if(window.__KINOJO_HALL_STATIC_EVENTS_BOUND__)return;
  window.__KINOJO_HALL_STATIC_EVENTS_BOUND__=true;

  const includeSubsToggle=document.getElementById('hofIncludeSubs');
  const includeAllLegionsToggle=document.getElementById('hofIncludeAllLegions');
  const filterStatus=document.getElementById('hofFilterStatus');
  const syncFilterStatus=()=>{
    if(filterStatus)filterStatus.textContent=(includeAllLegions?'전체 레기온':'기본 레기온')+' · '+(includeSubs?'부캐 포함':'본캐만');
  };
  if(includeSubsToggle){
    includeSubsToggle.checked=includeSubs;
    includeSubsToggle.addEventListener('change',()=>{includeSubs=includeSubsToggle.checked;syncFilterStatus();load();});
  }
  if(includeAllLegionsToggle){
    includeAllLegionsToggle.checked=includeAllLegions;
    includeAllLegionsToggle.addEventListener('change',()=>{includeAllLegions=includeAllLegionsToggle.checked;syncFilterStatus();load();});
  }
  syncFilterStatus();

  const footerSuggestBtn=document.getElementById('footerSuggestBtn');
  if(footerSuggestBtn)footerSuggestBtn.addEventListener('click',function(e){
    e.preventDefault();
    openSuggestionPanel();
  });

  const closeBtn=document.getElementById('reactionCloseBtn');
  if(closeBtn)closeBtn.addEventListener('click',function(e){
    e.preventDefault();
    closeReactionModal();
  });

  const likeBtn=document.getElementById('reactionLikeBtn');
  const dislikeBtn=document.getElementById('reactionDislikeBtn');
  if(likeBtn)likeBtn.addEventListener('click',function(){
    currentReactionType='like';
    likeBtn.classList.add('active','like-active');
    if(dislikeBtn)dislikeBtn.classList.remove('active','dislike-active');
    updateReactionSubmitState_();
  });
  if(dislikeBtn)dislikeBtn.addEventListener('click',function(){
    currentReactionType='dislike';
    dislikeBtn.classList.add('active','dislike-active');
    if(likeBtn)likeBtn.classList.remove('active','like-active');
    updateReactionSubmitState_();
  });

  const submitBtn=document.getElementById('reactionSubmitBtn');
  if(submitBtn)submitBtn.addEventListener('click',function(e){
    e.preventDefault();
    submitReaction();
  });

  document.addEventListener('click',function(e){
    const familyButton=e.target.closest('[data-hof-family-ranking]');
    if(familyButton){openHallFamilyRanking(familyButton.dataset.hofFamilyRanking,familyButton);return;}
    const toggle=e.target.closest('[data-hof-period-toggle]');
    if(toggle){
      e.preventDefault();
      const popover=document.getElementById(toggle.dataset.hofPeriodTarget||'hofPeriodPopover');
      if(!popover)return;
      const willOpen=popover.hidden;
      closeHallPeriodPopover();
      if(willOpen){
        popover.hidden=false;
        popover.setAttribute('aria-hidden','false');
        toggle.setAttribute('aria-expanded','true');
      }
      return;
    }
    if(!e.target.closest('[data-hof-period]'))closeHallPeriodPopover();
    if(e.target.closest('#hofMyRankingLoginBtn'))window.KinojoAuth?.openLoginModal?.();
  });

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      closeReactionModal();
      closeHallPeriodPopover();
    }
  });

  bindInlineSuggestionPanel();
}

function closeHallPeriodPopover(){
  document.querySelectorAll('.hof-v2-period-popover,.hof-v2-card-info-popover').forEach(popover=>{popover.hidden=true;popover.setAttribute('aria-hidden','true')});
  document.querySelectorAll('[data-hof-period-toggle]').forEach(toggle=>toggle.setAttribute('aria-expanded','false'));
}

function bindHallDynamicEvents(){
  // Character rankings remain on /ranking; family rankings use the explicit modal above.
  bindCharacterButtons();
}

function applyOverflowMarquee(){
  document.querySelectorAll('.flow-candidate').forEach(function(el){
    const overflow=el.scrollWidth>el.clientWidth+2;
    el.classList.toggle('marquee',overflow);
    if(overflow){
      const shift=Math.min(160,Math.max(32,el.scrollWidth-el.clientWidth+24));
      el.style.setProperty('--marquee-shift','-'+shift+'px');
    }else{
      el.style.removeProperty('--marquee-shift');
    }
  });
}
