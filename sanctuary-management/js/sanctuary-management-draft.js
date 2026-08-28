(function(){
  'use strict';

  const WEEKDAYS=Object.freeze([
    {value:3,label:'수'},{value:4,label:'목'},{value:5,label:'금'},{value:6,label:'토'},
    {value:7,label:'일'},{value:1,label:'월'},{value:2,label:'화'}
  ]);
  const state={layer:null,opener:null,team:null,requestKey:'',message:'',tone:'',saving:false};
  const value=input=>String(input??'').trim();
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bridge=()=>window.KinojoSanctuaryManagementDraftBridge;

  function todayKst(){
    return new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  }

  function sanctuaryItems(){return Array.isArray(bridge()?.snapshot()?.sanctuaries)?bridge().snapshot().sanctuaries:[];}
  function sanctuaryCode(item){return value(item?.code)||value(item?.id);}
  function sanctuaryLabel(item){return value(item?.shortName)||value(item?.name)||sanctuaryCode(item);}
  function sanctuaryForTeam(team){return sanctuaryItems().find(item=>String(item.id)===String(team?.sanctuaryId))||null;}
  function selectedCode(){
    const fromTeam=sanctuaryForTeam(state.team);
    if(fromTeam)return sanctuaryCode(fromTeam);
    const requested=value(new URLSearchParams(location.search).get('id'));
    if(requested&&sanctuaryItems().some(item=>sanctuaryCode(item)===requested))return requested;
    return sanctuaryCode(sanctuaryItems()[0]);
  }

  function defaultSchedule(){
    const sanctuary=sanctuaryItems().find(item=>sanctuaryCode(item)===selectedCode());
    const startsOn=value(sanctuary?.availableFrom)||todayKst();
    return {kind:'WEEKLY',startsOn,weekdays:[4],startsAt:'21:00',durationMinutes:30};
  }

  function currentSchedule(){
    const schedule=state.team?.schedule;
    if(!schedule||typeof schedule!=='object')return defaultSchedule();
    return {
      kind:value(schedule.kind)==='ONCE'?'ONCE':'WEEKLY',
      startsOn:value(schedule.startsOn)||todayKst(),
      weekdays:Array.isArray(schedule.weekdays)?schedule.weekdays.map(Number).filter(Number.isInteger):[],
      startsAt:value(schedule.startsAt)||'21:00',
      durationMinutes:Number(schedule.durationMinutes)||30
    };
  }

  function ensureLayer(){
    if(state.layer&&document.body.contains(state.layer))return state.layer;
    const layer=document.createElement('section');
    layer.id='sanctuaryManagementDraftLayer';
    layer.className='sanctuary-management-draft-layer';
    layer.hidden=true;
    layer.setAttribute('aria-hidden','true');
    layer.addEventListener('click',handleClick);
    layer.addEventListener('keydown',handleKeydown);
    layer.addEventListener('change',handleChange);
    layer.addEventListener('scroll',event=>{
      if(event.target.matches?.('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll'))syncScrollFade(event.target);
    },true);
    window.addEventListener('resize',()=>requestAnimationFrame(syncScrollFades));
    document.body.appendChild(layer);
    state.layer=layer;
    return layer;
  }

  function openLayer(opener){
    const layer=ensureLayer();
    state.opener=opener||document.activeElement;
    layer.hidden=false;
    layer.setAttribute('aria-hidden','false');
    document.body.classList.add('sanctuary-management-draft-open');
  }

  function close(){
    const layer=ensureLayer();
    layer.hidden=true;
    layer.setAttribute('aria-hidden','true');
    layer.replaceChildren();
    document.body.classList.remove('sanctuary-management-draft-open');
    const target=state.opener;
    state.opener=null;state.team=null;state.requestKey='';state.message='';state.tone='';state.saving=false;
    try{target?.focus({preventScroll:true});}catch(_error){target?.focus?.();}
  }

  function focusDialog(selector){
    requestAnimationFrame(()=>{
      const target=state.layer?.querySelector(selector)||state.layer?.querySelector('[role="dialog"]');
      try{target?.focus({preventScroll:true});}catch(_error){target?.focus?.();}
      syncScrollFades();
    });
    setTimeout(syncScrollFades,160);
  }

  function syncScrollFade(scroller){
    if(!scroller)return;
    const hasMore=scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-2;
    const shell=scroller.matches('.sanctuary-management-builder-dialog')?scroller.closest('.sanctuary-management-draft-frame'):scroller.closest('.sanctuary-management-schedule-panel');
    shell?.classList.toggle('has-more',hasMore);
  }

  function syncScrollFades(){
    state.layer?.querySelectorAll('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll').forEach(syncScrollFade);
  }

  function openMode(opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.team=null;state.requestKey='';state.message='';state.tone='';state.saving=false;
    openLayer(opener);
    state.layer.innerHTML='<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<section class="sanctuary-management-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftModeTitle" aria-describedby="sanctuaryDraftModeDescription" tabindex="-1">'
        +'<header><span>CREATE TEAM</span><h2 id="sanctuaryDraftModeTitle">팀 생성 방식을 선택하세요</h2><p id="sanctuaryDraftModeDescription">현재 단계에서는 고정 팀 초안을 Server에 저장하고 다시 불러올 수 있습니다.</p></header>'
        +'<div class="sanctuary-management-mode-options">'
          +'<button type="button" data-draft-mode="fixed"><span aria-hidden="true">◆</span><strong>고정 팀 생성</strong><small>팀 정보와 일정을 DRAFT로 먼저 저장합니다.</small><em>초안 작성 시작</em></button>'
          +'<button type="button" aria-disabled="true" data-draft-mode="participation"><span aria-hidden="true">＋</span><strong>참여 팀 생성</strong><small>참여 모집 연결 단계에서 활성화됩니다.</small><em>준비 중</em></button>'
        +'</div>'
        +'<footer><p>저장은 Edge command와 DB revision을 통해서만 처리됩니다.</p><button type="button" data-draft-close>닫기</button></footer>'
      +'</section>';
    focusDialog('[data-draft-mode="fixed"]');
  }

  function modeMarkup(){
    const schedule=currentSchedule();
    const sanctuaryOptions=sanctuaryItems().map(item=>{
      const code=sanctuaryCode(item);const available=value(item.availableFrom);
      return '<option value="'+escapeHtml(code)+'"'+(code===selectedCode()?' selected':'')+' data-available-from="'+escapeHtml(available)+'">'+escapeHtml(sanctuaryLabel(item))+(available?' · '+escapeHtml(available)+'부터':'')+'</option>';
    }).join('');
    const weekdays=WEEKDAYS.map(day=>'<label><input type="checkbox" name="draftWeekday" value="'+day.value+'"'+(schedule.weekdays.includes(day.value)?' checked':'')+'><span>'+day.label+'</span></label>').join('');
    const slots=Array.from({length:10},(_,index)=>'<button type="button" class="sanctuary-management-draft-slot" disabled><span>'+(index+1)+'</span><strong>빈 슬롯</strong><small>'+(index<5?'1파티':'2파티')+' · 3-3 연결</small></button>').join('');
    const isWeekly=schedule.kind==='WEEKLY';
    const editing=Boolean(state.team);
    return '<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<div class="sanctuary-management-draft-frame">'
        +'<form class="sanctuary-management-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftTitle" aria-describedby="sanctuaryDraftDescription" tabindex="-1" data-draft-form>'
          +'<div class="sanctuary-management-builder-layout">'
            +'<section class="sanctuary-management-composer">'
              +'<header class="sanctuary-management-composer-title"><div><span>TEAM &amp; FORCE</span><h2 id="sanctuaryDraftTitle">고정 팀 '+(editing?'초안 이어쓰기':'초안 생성')+'</h2><p id="sanctuaryDraftDescription">편성 전 팀 정보와 일정을 안전하게 저장합니다.</p></div><label><span>팀 제목</span><input name="draftTitle" maxlength="80" required value="'+escapeHtml(state.team?.title||'')+'" placeholder="예: 1팀 목요일 21시"></label></header>'
              +'<div class="sanctuary-management-composer-middle">'
                +'<aside class="sanctuary-management-force-rail" aria-label="포스 선택"><button type="button" class="is-active" disabled><strong>1포스</strong><small>Server 기본 생성</small></button><p>포스 추가·전환은 3-3에서 연결합니다.</p></aside>'
                +'<main class="sanctuary-management-roster" aria-label="1포스 슬롯 미리보기"><div class="sanctuary-management-party-labels"><span>1파티 · 1–5번</span><span>2파티 · 6–10번</span></div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>'
                +'<aside class="sanctuary-management-candidate-rail" aria-label="캐릭터 후보"><span aria-hidden="true">◇</span><strong>후보 영역</strong><p>생성자 캐릭터는 3-4에서 Server 결과로 연결합니다.</p></aside>'
              +'</div>'
              +'<footer class="sanctuary-management-composer-actions"><p class="sanctuary-management-draft-status'+(state.tone?' is-'+escapeHtml(state.tone):'')+'" data-draft-status role="status">'+escapeHtml(state.message||'DRAFT는 빈 슬롯 상태로 저장할 수 있습니다.')+'</p><div><button type="submit" class="is-primary"'+(state.saving?' disabled':'')+'>'+(state.saving?'저장 중…':editing?'초안 저장':'초안 생성')+'</button><button type="button" data-draft-reset'+(state.saving?' disabled':'')+'>초기화</button><button type="button" data-draft-close'+(state.saving?' disabled':'')+'>닫기</button></div></footer>'
            +'</section>'
            +'<section class="sanctuary-management-schedule-panel" aria-labelledby="sanctuaryDraftScheduleTitle">'
              +'<header><span>SCHEDULE</span><h3 id="sanctuaryDraftScheduleTitle">팀 일정 입력</h3><p>팀 아래 모든 포스가 같은 일정과 진행 시간을 공유합니다.</p></header>'
              +'<div class="sanctuary-management-schedule-scroll">'
                +'<div class="sanctuary-management-week-note"><strong>아이온2 주간</strong><span>수요일 → 화요일</span></div>'
                +'<label class="sanctuary-management-field"><span>진행 성역</span><select name="draftSanctuary" required>'+sanctuaryOptions+'</select></label>'
                +'<label class="sanctuary-management-field"><span>진행 내용</span><input name="draftActivity" maxlength="24" required value="'+escapeHtml(state.team?.activity||'')+'" placeholder="예: 성역1 진행"></label>'
                +'<div class="sanctuary-management-schedule-kind" role="group" aria-label="일정 반복 방식"><button type="button" data-draft-kind="WEEKLY" aria-pressed="'+isWeekly+'">매주 반복</button><button type="button" data-draft-kind="ONCE" aria-pressed="'+(!isWeekly)+'">1회성</button></div>'
                +'<input type="hidden" name="draftKind" value="'+schedule.kind+'">'
                +'<fieldset class="sanctuary-management-weekdays"'+(isWeekly?'':' hidden')+'><legend>반복 요일</legend><div>'+weekdays+'</div><small>종료일 없이 선택한 요일마다 반복됩니다.</small></fieldset>'
                +'<label class="sanctuary-management-field"><span>'+(isWeekly?'반복 시작일':'진행 날짜')+'</span><input type="date" name="draftStartsOn" required value="'+escapeHtml(schedule.startsOn)+'"></label>'
                +'<label class="sanctuary-management-field"><span>시작 시각</span><input type="time" name="draftStartsAt" step="1800" required value="'+escapeHtml(schedule.startsAt)+'"></label>'
                +'<label class="sanctuary-management-field"><span>진행 시간</span><select name="draftDuration">'+[30,60,90,120,150,180,210,240].map(minutes=>'<option value="'+minutes+'"'+(minutes===schedule.durationMinutes?' selected':'')+'>'+minutes+'분</option>').join('')+'</select><small>기본·최소 30분, 30분 단위</small></label>'
                +'<div class="sanctuary-management-schedule-preview"><span>저장 상태</span><strong>'+(editing?'DB DRAFT · revision '+escapeHtml(state.team.revision):'새 Server DRAFT')+'</strong><small>공개와 구성원 배치는 후속 단계에서 별도로 검증합니다.</small></div>'
              +'</div>'
            +'</section>'
          +'</div>'
        +'</form>'
      +'</div>';
  }

  function openDraft(team,opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.team=team&&typeof team==='object'?team:null;
    state.requestKey='';state.message='';state.tone='';state.saving=false;
    openLayer(opener||state.opener);
    state.layer.innerHTML=modeMarkup();
    syncDateMinimum();
    focusDialog('.sanctuary-management-builder-dialog');
  }

  function syncDateMinimum(){
    const form=state.layer?.querySelector('[data-draft-form]');
    if(!form)return;
    const select=form.elements.draftSanctuary;
    const option=select?.selectedOptions?.[0];
    const minimum=value(option?.dataset.availableFrom);
    const date=form.elements.draftStartsOn;
    if(date){date.min=minimum;if(minimum&&value(date.value)<minimum)date.value=minimum;}
  }

  function readModel(){
    const form=state.layer?.querySelector('[data-draft-form]');
    const kind=value(form?.elements.draftKind?.value)==='ONCE'?'ONCE':'WEEKLY';
    const weekdays=kind==='WEEKLY'?Array.from(form.querySelectorAll('input[name="draftWeekday"]:checked')).map(input=>Number(input.value)):[];
    return {
      teamId:Number(state.team?.teamId||0)||null,
      revision:Number(state.team?.revision||0)||null,
      requestKey:state.requestKey,
      sanctuaryCode:value(form?.elements.draftSanctuary?.value),
      title:value(form?.elements.draftTitle?.value),
      activity:value(form?.elements.draftActivity?.value),
      schedule:{
        kind,
        startsOn:value(form?.elements.draftStartsOn?.value),
        weekdays,
        startsAt:value(form?.elements.draftStartsAt?.value),
        durationMinutes:Number(form?.elements.draftDuration?.value)||30
      }
    };
  }

  function validate(model){
    if(!model.title||model.title.length>80)return '팀 제목을 1자 이상 80자 이하로 입력해 주세요.';
    if(!model.sanctuaryCode)return '진행 성역을 선택해 주세요.';
    if(!model.activity||model.activity.length>24)return '진행 내용을 1자 이상 24자 이하로 입력해 주세요.';
    if(!model.schedule.startsOn)return model.schedule.kind==='WEEKLY'?'반복 시작일을 입력해 주세요.':'진행 날짜를 입력해 주세요.';
    if(!model.schedule.startsAt)return '시작 시각을 입력해 주세요.';
    if(model.schedule.kind==='WEEKLY'&&!model.schedule.weekdays.length)return '반복할 요일을 하나 이상 선택해 주세요.';
    if(model.schedule.durationMinutes<30||model.schedule.durationMinutes%30!==0)return '진행 시간은 30분부터 30분 단위로 선택해 주세요.';
    const selected=sanctuaryItems().find(item=>sanctuaryCode(item)===model.sanctuaryCode);
    const available=value(selected?.availableFrom);
    if(available&&model.schedule.startsOn<available)return sanctuaryLabel(selected)+' 일정은 '+available+'부터 등록할 수 있습니다.';
    return '';
  }

  function setStatus(message,tone='warning'){
    state.message=message;state.tone=tone;
    const status=state.layer?.querySelector('[data-draft-status]');
    if(status){status.textContent=message;status.className='sanctuary-management-draft-status is-'+tone;}
  }

  async function save(){
    if(state.saving)return;
    const model=readModel();
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
    state.saving=true;
    state.requestKey=state.requestKey||('sm-draft-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.requestKey;
    setStatus('Server에 고정 팀 DRAFT를 저장하고 다시 불러오는 중입니다.','progress');
    state.layer.querySelectorAll('button,input,select').forEach(control=>{
      if(control.disabled)control.dataset.draftWasDisabled='true';
      control.disabled=true;
    });
    try{
      const result=await bridge().saveFixedDraft(model);
      const message=(state.team?'고정 팀 초안을 저장했습니다.':'고정 팀 초안을 생성했습니다.')+' · team '+value(result.teamId)+' · revision '+value(result.revision);
      close();
      if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);
    }catch(error){
      state.saving=false;
      setStatus(value(error?.message)||'고정 팀 초안을 저장하지 못했습니다.','error');
      state.layer.querySelectorAll('button,input,select').forEach(control=>{
        control.disabled=control.dataset.draftWasDisabled==='true';
        delete control.dataset.draftWasDisabled;
      });
      state.layer.querySelector('[data-draft-mode="participation"]')?.setAttribute('aria-disabled','true');
    }
  }

  function handleClick(event){
    if(event.target.closest('[data-draft-close]')){if(!state.saving)close();return;}
    const mode=event.target.closest('[data-draft-mode]');
    if(mode){if(mode.dataset.draftMode==='fixed')openDraft(null,state.opener);else window.KinojoToast?.show?.('참여 팀은 Stage 4에서 연결합니다.');return;}
    const kind=event.target.closest('[data-draft-kind]');
    if(kind){
      const form=state.layer.querySelector('[data-draft-form]');
      form.elements.draftKind.value=kind.dataset.draftKind;
      form.querySelectorAll('[data-draft-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button===kind)));
      const weekdays=form.querySelector('.sanctuary-management-weekdays');
      weekdays.hidden=kind.dataset.draftKind!=='WEEKLY';
      form.elements.draftStartsOn.previousElementSibling.textContent=kind.dataset.draftKind==='WEEKLY'?'반복 시작일':'진행 날짜';
      return;
    }
    if(event.target.closest('[data-draft-reset]')){openDraft(state.team,state.opener);}
  }

  function handleChange(event){if(event.target.name==='draftSanctuary')syncDateMinimum();}

  function handleKeydown(event){
    if(event.key==='Escape'&&!state.saving){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const focusable=Array.from(state.layer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(item=>item.offsetParent!==null);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  document.addEventListener('submit',event=>{
    if(!event.target.matches('[data-draft-form]'))return;
    event.preventDefault();save();
  });

  window.KinojoSanctuaryManagementDraftUI=Object.freeze({openMode,openDraft,close});
})();
