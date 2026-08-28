/* KINOJO Admin banner quality guard v2026082811 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');

  const MAIN='[data-main-banner-admin]';
  const SIDE='[data-side-banner-admin]';
  const UNSAVED_MESSAGE='저장하지 않은 배너 설정 변경사항이 있습니다. 변경사항을 버리고 이동할까요?';
  const DATE_RE=/^(\d{4})-(\d{2})-(\d{2})$/;
  const KST_RE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
  const MAIN_DIRTY='#bName,#bPriority,#bMode,#bStart,#bEnd,#bDates,#bSlide,#bTransition,#bDays input,[data-b-check],[data-b-alt],[data-b-link]';
  const SIDE_DIRTY='#sName,#sPriority,#sMode,#sStart,#sEnd,#sDates,#sSlide,#sTransition,#sDays input,[data-s-check],[data-s-alt],[data-s-link],[data-s-weight],[data-s-item-mode],[data-s-start],[data-s-end],[data-s-dates],[data-s-day]';
  const MAIN_ACTION='[data-b-save],[data-b-publish],[data-b-pause],[data-b-archive],[data-b-restore],#bUpload,[data-b-refresh]';
  const SIDE_ACTION='[data-s-save],[data-s-publish],[data-s-pause],[data-s-archive],[data-s-restore],#sUpload,[data-s-refresh]';
  const TERMINAL={
    'b-save':'저장 완료','b-publish':'게시 완료','b-pause':'일시정지 완료','b-archive':'보관 완료','b-restore':'복원 완료','b-upload':'등록 완료',
    's-save':'저장 완료','s-publish':'게시 완료','s-pause':'일시정지 완료','s-archive':'보관 완료','s-restore':'복원 완료','s-upload':'등록 완료'
  };
  const ERROR_MAP={
    SESSION_TOKEN_REQUIRED:'MASTER 세션이 필요합니다.',SESSION_TOKEN_INVALID:'MASTER 세션이 만료되었습니다.',SESSION_INVALID:'MASTER 세션을 다시 확인해 주세요.',MASTER_REQUIRED:'MASTER 권한이 필요합니다.',
    BANNER_CAMPAIGN_NAME_INVALID:'캠페인 이름을 1~120자로 입력해 주세요.',BANNER_CAMPAIGN_PRIORITY_INVALID:'우선순위는 0~10000 정수여야 합니다.',
    BANNER_CAMPAIGN_SCHEDULE_RANGE_INVALID:'캠페인 종료 시각은 시작 시각보다 뒤여야 합니다.',BANNER_CAMPAIGN_SLIDE_INTERVAL_INVALID:'슬라이드 간격은 3000~60000ms로 입력해 주세요.',
    BANNER_CAMPAIGN_TRANSITION_INVALID:'전환 속도는 0~5000ms로 입력해 주세요.',BANNER_CAMPAIGN_TARGET_INVALID:'이 페이지에서는 선택한 배너 위치를 사용할 수 없습니다.',
    BANNER_CAMPAIGN_WEIGHT_INVALID:'이미지 가중치는 1~10000 정수여야 합니다.',BANNER_ITEM_SCHEDULE_RANGE_INVALID:'이미지 개별 일정의 종료 시각은 시작 시각보다 뒤여야 합니다.',
    BANNER_CLICK_URL_INVALID:'링크는 https:// 주소 또는 /로 시작하는 내부 경로만 사용할 수 있습니다.',BANNER_CAMPAIGN_PAUSE_REQUIRED:'게시 중인 캠페인은 먼저 일시정지해야 수정할 수 있습니다.',
    BANNER_CAMPAIGN_NO_ACTIVE_ITEMS:'게시하려면 사용할 이미지를 하나 이상 선택해 주세요.',BANNER_ASSET_NOT_READY:'선택한 이미지가 현재 사용 가능한 상태가 아닙니다.'
  };

  const $=(q,r=document)=>r.querySelector(q);
  const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
  const rootOf=el=>el?.closest?.(MAIN)||el?.closest?.(SIDE)||null;
  const kindOf=root=>root?.matches(MAIN)?'b':root?.matches(SIDE)?'s':'';
  const value=(root,q)=>String($(q,root)?.value??'').trim();
  const intValue=(root,q)=>{const raw=value(root,q);return /^-?\d+$/.test(raw)?Number(raw):NaN};
  const pending=root=>Boolean(root?.dataset?.pendingAction);

  function validDate(v){
    const m=DATE_RE.exec(String(v||''));if(!m)return false;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d;
  }
  function validDateList(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean).every(validDate)}
  function safeLink(v){const s=String(v||'').trim();return !s||/^https:\/\/.+/i.test(s)||(/^\/(?!\/)/.test(s))}
  function validKst(v){return !v||KST_RE.test(String(v))}
  function rangeValid(start,end){return !start||!end||end>start}
  function anyUnsaved(){return $$(MAIN+','+SIDE).some(root=>root.dataset.unsaved==='true')}
  function markDirty(root){if(root&&!pending(root)){root.dataset.unsaved='true';root.setAttribute('data-unsaved','true')}}
  function markClean(root){if(root){delete root.dataset.unsaved;root.removeAttribute('data-unsaved')}}
  function clearAllDirty(){for(const root of $$(MAIN+','+SIDE))markClean(root);window.dispatchEvent(new CustomEvent('kinojo-banner-discard-all'))}
  function confirmDiscard(root){return !root||root.dataset.unsaved!=='true'||window.confirm(UNSAVED_MESSAGE)}

  function friendly(text){
    const raw=String(text||'');
    for(const [code,message] of Object.entries(ERROR_MAP))if(raw.includes(code))return `${message} (${code})`;
    return raw;
  }
  function statusLine(root,scope='campaign'){const k=kindOf(root);return k==='b'?$(scope==='upload'?'#bUploadStatus':'#bCampaignStatus',root):$(scope==='upload'?'#sUploadStatus':'#sCampaignStatus',root)}
  function announce(root,message,type='error',focus){
    const line=statusLine(root);if(line){line.textContent=message;line.className='admin-statusline '+type;line.setAttribute('role',type==='error'?'alert':'status');line.setAttribute('aria-live',type==='error'?'assertive':'polite')}
    if(focus){focus.setAttribute('aria-invalid','true');focus.focus?.()}
  }
  function clearInvalid(root){$$('[aria-invalid="true"]',root).forEach(el=>el.removeAttribute('aria-invalid'))}
  function fail(root,message,el){announce(root,message,'error',el);return false}

  function validateBase(root,prefix,forPublish=false){
    clearInvalid(root);
    const name=$(prefix==='b'?'#bName':'#sName',root),n=String(name?.value||'').trim();
    if(n.length<1||n.length>120)return fail(root,'캠페인 이름을 1~120자로 입력해 주세요.',name);
    const priority=$(prefix==='b'?'#bPriority':'#sPriority',root),p=intValue(root,prefix==='b'?'#bPriority':'#sPriority');
    if(!Number.isInteger(p)||p<0||p>10000)return fail(root,'우선순위는 0~10000 정수로 입력해 주세요.',priority);
    const slide=$(prefix==='b'?'#bSlide':'#sSlide',root),sl=intValue(root,prefix==='b'?'#bSlide':'#sSlide');
    if(!Number.isInteger(sl)||sl<3000||sl>60000)return fail(root,'슬라이드 간격은 3000~60000ms로 입력해 주세요.',slide);
    const transition=$(prefix==='b'?'#bTransition':'#sTransition',root),tr=intValue(root,prefix==='b'?'#bTransition':'#sTransition');
    if(!Number.isInteger(tr)||tr<0||tr>5000)return fail(root,'전환 속도는 0~5000ms로 입력해 주세요.',transition);
    const mode=value(root,prefix==='b'?'#bMode':'#sMode');
    if(mode==='SCHEDULED'){
      const start=$(prefix==='b'?'#bStart':'#sStart',root),end=$(prefix==='b'?'#bEnd':'#sEnd',root),sv=String(start?.value||''),ev=String(end?.value||'');
      if(!validKst(sv))return fail(root,'시작 시각 형식을 확인해 주세요.',start);
      if(!validKst(ev))return fail(root,'종료 시각 형식을 확인해 주세요.',end);
      if(!rangeValid(sv,ev))return fail(root,'종료 시각은 시작 시각보다 뒤여야 합니다.',end);
      const dates=$(prefix==='b'?'#bDates':'#sDates',root);if(!validDateList(dates?.value))return fail(root,'특정 날짜는 YYYY-MM-DD 형식으로 입력해 주세요.',dates);
    }
    const selected=$$(prefix==='b'?'[data-b-check]:checked':'[data-s-check]:checked',root);
    if(forPublish&&selected.length<1)return fail(root,'게시하려면 이미지를 하나 이상 선택해 주세요.',$(prefix==='b'?'#bLibrary':'#sLibrary',root));
    const links=$$(prefix==='b'?'[data-b-link]':'[data-s-link]',root);for(const link of links)if(!safeLink(link.value))return fail(root,'링크는 https:// 주소 또는 /로 시작하는 내부 경로만 사용할 수 있습니다.',link);
    return true;
  }
  function validateMain(forPublish=false){const root=$(MAIN);return root?validateBase(root,'b',forPublish):false}
  function validateSide(forPublish=false){
    const root=$(SIDE);if(!root||!validateBase(root,'s',forPublish))return false;
    for(const weight of $$('[data-s-weight]',root)){const v=Number(weight.value);if(!/^\d+$/.test(String(weight.value).trim())||!Number.isInteger(v)||v<1||v>10000)return fail(root,'이미지 가중치는 1~10000 정수로 입력해 주세요.',weight)}
    for(const mode of $$('[data-s-item-mode]',root)){
      if(mode.value!=='CUSTOM')continue;const id=mode.dataset.sItemMode;
      const start=$(`[data-s-start="${id}"]`,root),end=$(`[data-s-end="${id}"]`,root),sv=String(start?.value||''),ev=String(end?.value||'');
      if(!validKst(sv))return fail(root,'개별 일정 시작 시각 형식을 확인해 주세요.',start);
      if(!validKst(ev))return fail(root,'개별 일정 종료 시각 형식을 확인해 주세요.',end);
      if(!rangeValid(sv,ev))return fail(root,'개별 일정 종료 시각은 시작 시각보다 뒤여야 합니다.',end);
      const dates=$(`[data-s-dates="${id}"]`,root);if(!validDateList(dates?.value))return fail(root,'개별 특정 날짜는 YYYY-MM-DD 형식으로 입력해 주세요.',dates);
    }
    return true;
  }
  function validate(forPublish=false,root=$(MAIN)){return root?.matches(SIDE)?validateSide(forPublish):validateMain(forPublish)}

  function setBusy(root,action){
    if(!root||pending(root))return false;
    root.dataset.pendingAction=action;root.setAttribute('aria-busy','true');
    $$(kindOf(root)==='b'?MAIN_ACTION:SIDE_ACTION,root).forEach(button=>button.setAttribute('aria-disabled','true'));
    const line=statusLine(root,action.endsWith('upload')?'upload':'campaign');if(line&&action!=='b-refresh'&&action!=='s-refresh'){line.textContent='처리 중...';line.className='admin-statusline';line.setAttribute('role','status');line.setAttribute('aria-live','polite')}
    clearTimeout(root._kinojoBannerBusyTimer);root._kinojoBannerBusyTimer=setTimeout(()=>releaseBusy(root),45000);
    return true;
  }
  function releaseBusy(root){
    if(!root)return;clearTimeout(root._kinojoBannerBusyTimer);delete root._kinojoBannerBusyTimer;delete root.dataset.pendingAction;root.removeAttribute('aria-busy');
    $$(kindOf(root)==='b'?MAIN_ACTION:SIDE_ACTION,root).forEach(button=>button.removeAttribute('aria-disabled'));
  }
  function terminalCheck(root){
    const action=root?.dataset?.pendingAction;if(!action)return;
    const lines=$$('.admin-statusline',root);if(lines.some(line=>line.classList.contains('error'))){releaseBusy(root);return}
    const expected=TERMINAL[action];if(expected&&lines.some(line=>String(line.textContent||'').includes(expected))){if(/-(save|publish)$/.test(action))markClean(root);releaseBusy(root);return}
    if(action.endsWith('refresh')&&lines.some(line=>line.classList.contains('ok')&&!String(line.textContent||'').includes('불러오는 중'))){releaseBusy(root)}
  }

  function decorate(root){
    if(!root)return;root.setAttribute('role','region');root.setAttribute('aria-label',root.matches(MAIN)?'메인 배너 관리':'PC 사이드 배너 관리');
    for(const line of $$('.admin-statusline',root)){
      const isError=line.classList.contains('error');line.setAttribute('role',isError?'alert':'status');line.setAttribute('aria-live',isError?'assertive':'polite');line.setAttribute('aria-atomic','true');
      if(isError){const text=String(line.textContent||''),next=friendly(text);if(next!==text)line.textContent=next}
    }
    const labels=[
      ['#bannerMainPreviewPc','메인 배너 PC 미리보기'],['#bannerMainPreviewMobile','메인 배너 모바일 미리보기'],['#bannerSidePreviewLeft','사이드 배너 왼쪽 미리보기'],['#bannerSidePreviewRight','사이드 배너 오른쪽 미리보기']
    ];
    for(const [q,label] of labels){const el=$(q,root);if(el){el.setAttribute('role','img');el.setAttribute('aria-label',label)}}
    const fieldLabels=[
      ['[data-b-alt]','메인 이미지 대체 텍스트'],['[data-b-link]','메인 이미지 링크'],['[data-s-alt]','사이드 이미지 대체 텍스트'],['[data-s-link]','사이드 이미지 링크'],['[data-s-weight]','사이드 이미지 가중치'],['[data-s-item-mode]','사이드 이미지 개별 일정 방식'],['[data-s-start]','사이드 이미지 개별 일정 시작'],['[data-s-end]','사이드 이미지 개별 일정 종료'],['[data-s-dates]','사이드 이미지 특정 날짜']
    ];
    for(const [q,label] of fieldLabels)for(const el of $$(q,root))if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',label);
    if(pending(root))$$(kindOf(root)==='b'?MAIN_ACTION:SIDE_ACTION,root).forEach(button=>button.setAttribute('aria-disabled','true'));
    terminalCheck(root);
  }
  function decorateAll(){decorate($(MAIN));decorate($(SIDE))}

  function block(event,root,message,focus){event.preventDefault();event.stopImmediatePropagation();if(message)announce(root,message,'error',focus)}
  function discardGate(event,root){if(confirmDiscard(root)){markClean(root);return true}block(event,root);return false}
  function actionFor(button,root){
    const k=kindOf(root);
    if(button.id===`${k}Upload`)return `${k}-upload`;
    for(const name of ['save','publish','pause','archive','restore','refresh'])if(button.matches(`[data-${k}-${name}]`))return `${k}-${name}`;
    return '';
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button,a');if(!target)return;
    if(anyUnsaved()&&!target.closest(MAIN+','+SIDE)){
      const tab=target.closest?.('[data-admin-tab]'),anchor=target.closest?.('a[href]');
      if((tab&&!tab.matches('[data-admin-tab="images"]'))||anchor){if(!window.confirm(UNSAVED_MESSAGE)){event.preventDefault();event.stopImmediatePropagation();return}clearAllDirty()}
    }
    const root=rootOf(target);if(!root)return;
    if(pending(root)){block(event,root,'현재 작업이 끝난 뒤 다시 시도해 주세요.');return}
    const k=kindOf(root),action=actionFor(target,root);
    if(target.matches(`[data-${k}-new],[data-${k}-edit],[data-${k}-refresh]`)){
      if(!discardGate(event,root))return;
      if(action)setBusy(root,action);
      return;
    }
    if(target.id===`${k}Upload`){
      if(root.dataset.unsaved==='true'){block(event,root,'캠페인 변경사항을 먼저 저장하거나 새 캠페인으로 초기화한 뒤 이미지를 업로드하세요.',$(k==='b'?'[data-b-save]':'[data-s-save]',root));return}
      setBusy(root,action);return;
    }
    if(target.matches(`[data-${k}-save],[data-${k}-publish]`)){
      const publish=target.matches(`[data-${k}-publish]`);if(!validate(publish,root)){event.preventDefault();event.stopImmediatePropagation();return}setBusy(root,action);return;
    }
    if(target.matches(`[data-${k}-pause],[data-${k}-archive],[data-${k}-restore]`)){
      if(!discardGate(event,root))return;setBusy(root,action);
    }
  },true);

  document.addEventListener('pointerdown',event=>{const t=event.target;if(t?.matches?.('#sPage,#sSlot'))t.dataset.qualityPrevious=t.value},true);
  document.addEventListener('focusin',event=>{const t=event.target;if(t?.matches?.('#sPage,#sSlot')&&!t.dataset.qualityPrevious)t.dataset.qualityPrevious=t.value},true);
  document.addEventListener('change',event=>{
    const t=event.target,root=rootOf(t);if(!root)return;
    if(t.matches('#sPage,#sSlot')){
      const old=t.dataset.qualityPrevious??t.defaultValue??'';
      if(root.dataset.unsaved==='true'&&!window.confirm(UNSAVED_MESSAGE)){event.preventDefault();event.stopImmediatePropagation();t.value=old;return}
      markClean(root);t.dataset.qualityPrevious=t.value;queueMicrotask(()=>$('[data-s-new]',root)?.click());return;
    }
    if((root.matches(MAIN)&&t.matches(MAIN_DIRTY))||(root.matches(SIDE)&&t.matches(SIDE_DIRTY)))markDirty(root);
    queueMicrotask(()=>decorate(root));
  },true);
  document.addEventListener('input',event=>{const t=event.target,root=rootOf(t);if(!root)return;if((root.matches(MAIN)&&t.matches(MAIN_DIRTY))||(root.matches(SIDE)&&t.matches(SIDE_DIRTY)))markDirty(root)},true);

  window.addEventListener('beforeunload',event=>{if(!anyUnsaved())return;event.preventDefault();event.returnValue=''});
  window.addEventListener('kinojo-banner-discard-all',()=>{for(const root of $$(MAIN+','+SIDE))markClean(root)});

  const observer=new MutationObserver(()=>decorateAll());observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled']});
  decorateAll();

  Object.assign(A,{validateBannerAdmin:validate,hasUnsavedBannerChanges:anyUnsaved,discardBannerChanges:clearAllDirty});
})(window.KinojoAdmin);
