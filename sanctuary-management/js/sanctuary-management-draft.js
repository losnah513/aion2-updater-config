(function(){
  'use strict';

  const WEEKDAYS=Object.freeze([
    {value:3,label:'수'},{value:4,label:'목'},{value:5,label:'금'},{value:6,label:'토'},
    {value:7,label:'일'},{value:1,label:'월'},{value:2,label:'화'}
  ]);
  const state={layer:null,opener:null,team:null,selectedForceId:0,selectedSlotId:0,requestKey:'',forceSaveRequestKey:'',forceAddRequestKey:'',slotRequestKey:'',message:'',tone:'',saving:false,mutating:false};
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
      if(event.target.matches?.('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list'))syncScrollFade(event.target);
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
    state.opener=null;state.team=null;state.selectedForceId=0;state.selectedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=false;
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
    const shell=scroller.matches('.sanctuary-management-builder-dialog')?scroller.closest('.sanctuary-management-draft-frame'):scroller.matches('.sanctuary-management-force-list')?scroller.closest('.sanctuary-management-force-rail'):scroller.matches('.sanctuary-management-candidate-list')?scroller.closest('.sanctuary-management-candidate-rail'):scroller.closest('.sanctuary-management-schedule-panel');
    shell?.classList.toggle('has-more',hasMore);
  }

  function syncScrollFades(){
    state.layer?.querySelectorAll('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list').forEach(syncScrollFade);
  }

  function openMode(opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.team=null;state.selectedForceId=0;state.selectedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=false;
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

  function teamForces(){
    return Array.isArray(state.team?.forces)?state.team.forces.slice().sort((left,right)=>Number(left.forceNo)-Number(right.forceNo)):[];
  }

  function selectedForce(){
    const forces=teamForces();
    return forces.find(force=>Number(force.forceId)===Number(state.selectedForceId))||forces[0]||null;
  }

  function forceSlots(force=selectedForce()){
    if(!force||!Array.isArray(force.parties))return [];
    return force.parties.flatMap(party=>(Array.isArray(party.slots)?party.slots:[]).map(slot=>({partyNo:Number(party.partyNo),slot}))).sort((left,right)=>left.partyNo-right.partyNo||Number(left.slot.slotNo)-Number(right.slot.slotNo));
  }

  function selectedSlot(){
    return forceSlots().find(item=>Number(item.slot.slotId)===Number(state.selectedSlotId))||null;
  }

  function slotDisplayNumber(item){return item?(item.partyNo-1)*5+Number(item.slot.slotNo):0;}

  function forceRailMarkup(){
    const forces=teamForces();
    const active=selectedForce();
    const busy=state.saving||state.mutating;
    if(!state.team){
      return '<div class="sanctuary-management-force-list"><button type="button" class="is-active" disabled><strong>1포스</strong><small>저장 후 Server 생성</small></button></div><p>새 DRAFT 저장 시 1포스와 10슬롯을 Server가 생성합니다.</p>';
    }
    const buttons=forces.map(force=>{
      const selected=Number(force.forceId)===Number(active?.forceId);
      return '<button type="button" data-draft-force="'+escapeHtml(force.forceId)+'" class="'+(selected?'is-active':'')+'" aria-pressed="'+selected+'"'+(busy?' disabled':'')+'><strong>'+escapeHtml(force.forceNo)+'포스</strong><small>'+escapeHtml(force.occupiedCount)+' / '+escapeHtml(force.capacity)+'명 · rev '+escapeHtml(force.revision)+'</small></button>';
    }).join('');
    const add=forces.length<9?'<button type="button" class="is-add" data-draft-add-force'+(busy?' disabled':'')+'><strong>+ 포스 추가</strong><small>다음 '+(forces.length+1)+'포스 · 최대 9</small></button>':'';
    return '<div class="sanctuary-management-force-list" data-force-list>'+buttons+add+'</div><p>Server 포스 '+forces.length+'/9 · 선택한 포스의 10슬롯을 표시합니다.</p>';
  }

  function slotMarkup(slot,partyNo){
    const number=(Number(partyNo)-1)*5+Number(slot.slotNo);
    const occupied=slot.occupied===true&&slot.character;
    const selected=!occupied&&Number(slot.slotId)===Number(state.selectedSlotId);
    const name=occupied?value(slot.character.name):'빈 슬롯';
    const detail=occupied?[value(slot.character.serverName),value(slot.character.className),value(slot.character.relation)].filter(Boolean).join(' · '):selected?'후보를 선택해 추가':'눌러서 생성자 캐릭터 선택';
    const disabled=occupied||state.saving||state.mutating;
    return '<button type="button" class="sanctuary-management-draft-slot'+(occupied?' is-occupied':'')+(selected?' is-selected':'')+'"'+(disabled?' disabled':'')+' data-draft-slot data-slot-id="'+escapeHtml(slot.slotId)+'" data-slot-revision="'+escapeHtml(slot.revision)+'" data-party-no="'+escapeHtml(partyNo)+'" data-slot-no="'+escapeHtml(slot.slotNo)+'" data-occupied="'+String(Boolean(occupied))+'" aria-pressed="'+String(selected)+'"><span>'+number+'</span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(detail)+'</small></button>';
  }

  function candidateMarkup(){
    const force=selectedForce();
    const chosen=selectedSlot();
    if(!state.team||!force)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>초안 저장 후 연결</strong><p>Server가 생성자의 소유 캐릭터를 확인합니다.</p></div></aside>';
    if(!chosen)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>빈 슬롯 선택</strong><p>'+escapeHtml(force.forceNo)+'포스의 빈 카드를 누르면 Server 후보를 표시합니다.</p></div></aside>';
    if(force.creatorOwnerResolved!==true)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty is-warning"><span aria-hidden="true">!</span><strong>소유권 확인 필요</strong><p>등록된 본캐 연결 정보를 확인할 수 없습니다. · '+escapeHtml(force.creatorCandidateCode||'OWNER_NOT_RESOLVED')+'</p></div></aside>';
    if(force.creatorAlreadyAssigned===true)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty is-complete"><span aria-hidden="true">✓</span><strong>생성자 배치 완료</strong><p>이 포스에는 생성자의 캐릭터가 이미 1개 배치되어 있습니다.</p></div></aside>';
    const candidates=Array.isArray(force.creatorCandidates)?force.creatorCandidates:[];
    if(!candidates.length)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty is-warning"><span aria-hidden="true">!</span><strong>추가할 후보 없음</strong><p>Server에서 이 포스에 추가 가능한 생성자 캐릭터를 찾지 못했습니다.</p></div></aside>';
    const slotNumber=slotDisplayNumber(chosen);
    const cards=candidates.map(candidate=>{
      const relation=candidate.isMain?'본캐':'부캐';
      const initial=Array.from(value(candidate.characterName)||'?')[0]||'?';
      return '<button type="button" class="sanctuary-management-candidate-card" data-draft-candidate="'+escapeHtml(candidate.characterId)+'"'+(state.saving||state.mutating?' disabled':'')+'><span class="sanctuary-management-candidate-avatar" aria-hidden="true">'+escapeHtml(initial)+'</span><span class="sanctuary-management-candidate-copy"><em>'+relation+'</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>'+escapeHtml([candidate.serverName,candidate.className].filter(Boolean).join(' · '))+'</small></span></button>';
    }).join('');
    return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 '+slotNumber+'번 슬롯 생성자 캐릭터 후보"><header><strong>생성자 캐릭터</strong><small>'+escapeHtml(candidates.length)+'개 · '+slotNumber+'번 슬롯</small></header><div class="sanctuary-management-candidate-list" data-candidate-list>'+cards+'</div><p>현재 포스에 없는 소유 캐릭터만 Server가 반환합니다.</p></aside>';
  }

  function rosterMarkup(){
    const force=selectedForce();
    if(!force){
      const slots=Array.from({length:10},(_,index)=>'<button type="button" class="sanctuary-management-draft-slot" disabled data-occupied="false"><span>'+(index+1)+'</span><strong>생성 대기</strong><small>'+(index<5?'1파티':'2파티')+' · Server 저장 전</small></button>').join('');
      return '<main class="sanctuary-management-roster" aria-label="저장 전 1포스 슬롯 미리보기"><div class="sanctuary-management-party-labels"><span>1파티 · 1–5번</span><span>2파티 · 6–10번</span></div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
    }
    const parties=force.parties.slice().sort((left,right)=>Number(left.partyNo)-Number(right.partyNo));
    const labels=parties.map(party=>'<span>'+escapeHtml(party.partyNo)+'파티 · '+escapeHtml(party.occupiedCount)+'/'+escapeHtml(party.capacity)+'명</span>').join('');
    const slots=parties.map(party=>party.slots.map(slot=>slotMarkup(slot,party.partyNo)).join('')).join('');
    return '<main class="sanctuary-management-roster" aria-label="'+escapeHtml(force.forceNo)+'포스 Server 슬롯"><div class="sanctuary-management-party-labels">'+labels+'</div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
  }

  function defaultStatus(){
    const force=selectedForce();
    if(!force)return '새 DRAFT는 저장할 때 1포스·2파티·10슬롯이 Server에 생성됩니다.';
    return force.forceNo+'포스 · '+force.occupiedCount+'/'+force.capacity+'명 · 빈자리 '+force.vacancyCount+' · Server revision '+force.revision;
  }

  function renderRosterState(){
    const rail=state.layer?.querySelector('.sanctuary-management-force-rail');
    if(rail)rail.innerHTML=forceRailMarkup();
    const roster=state.layer?.querySelector('.sanctuary-management-roster');
    if(roster)roster.outerHTML=rosterMarkup();
    const candidates=state.layer?.querySelector('.sanctuary-management-candidate-rail');
    if(candidates)candidates.outerHTML=candidateMarkup();
    requestAnimationFrame(syncScrollFades);
  }

  function modeMarkup(){
    const schedule=currentSchedule();
    const sanctuaryOptions=sanctuaryItems().map(item=>{
      const code=sanctuaryCode(item);const available=value(item.availableFrom);
      return '<option value="'+escapeHtml(code)+'"'+(code===selectedCode()?' selected':'')+' data-available-from="'+escapeHtml(available)+'">'+escapeHtml(sanctuaryLabel(item))+(available?' · '+escapeHtml(available)+'부터':'')+'</option>';
    }).join('');
    const weekdays=WEEKDAYS.map(day=>'<label><input type="checkbox" name="draftWeekday" value="'+day.value+'"'+(schedule.weekdays.includes(day.value)?' checked':'')+'><span>'+day.label+'</span></label>').join('');
    const isWeekly=schedule.kind==='WEEKLY';
    const editing=Boolean(state.team);
    const busy=state.saving||state.mutating;
    return '<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<div class="sanctuary-management-draft-frame">'
        +'<form class="sanctuary-management-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftTitle" aria-describedby="sanctuaryDraftDescription" tabindex="-1" data-draft-form>'
          +'<div class="sanctuary-management-builder-layout">'
            +'<section class="sanctuary-management-composer">'
              +'<header class="sanctuary-management-composer-title"><div><span>TEAM &amp; FORCE</span><h2 id="sanctuaryDraftTitle">고정 팀 '+(editing?'초안 이어쓰기':'초안 생성')+'</h2><p id="sanctuaryDraftDescription">편성 전 팀 정보와 일정을 안전하게 저장합니다.</p></div><label><span>팀 제목</span><input name="draftTitle" maxlength="80" required value="'+escapeHtml(state.team?.title||'')+'" placeholder="예: 1팀 목요일 21시"></label></header>'
              +'<div class="sanctuary-management-composer-middle">'
                +'<aside class="sanctuary-management-force-rail" aria-label="포스 선택">'+forceRailMarkup()+'</aside>'
                +rosterMarkup()
                +candidateMarkup()
              +'</div>'
              +'<footer class="sanctuary-management-composer-actions"><p class="sanctuary-management-draft-status'+(state.tone?' is-'+escapeHtml(state.tone):'')+'" data-draft-status role="status">'+escapeHtml(state.message||defaultStatus())+'</p><div><button type="submit" class="is-primary"'+(busy?' disabled':'')+'>'+(state.saving?'저장 중…':state.mutating?'포스 추가 중…':editing?'초안 저장':'초안 생성')+'</button><button type="button" data-draft-reset'+(busy?' disabled':'')+'>초기화</button><button type="button" data-draft-close'+(busy?' disabled':'')+'>닫기</button></div></footer>'
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
    state.selectedForceId=Number(state.team?.forces?.[0]?.forceId||0);
    state.selectedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=false;
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

  function setControlsDisabled(disabled){
    state.layer?.querySelectorAll('button,input,select').forEach(control=>{
      if(disabled){
        if(control.disabled)control.dataset.draftWasDisabled='true';
        control.disabled=true;
        return;
      }
      control.disabled=control.dataset.draftWasDisabled==='true';
      delete control.dataset.draftWasDisabled;
    });
  }

  async function save(){
    if(state.saving||state.mutating)return;
    const model=readModel();
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
    state.saving=true;
    state.requestKey=state.requestKey||('sm-draft-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.requestKey;
    setStatus('Server에 고정 팀 DRAFT를 저장하고 다시 불러오는 중입니다.','progress');
    setControlsDisabled(true);
    try{
      const result=await bridge().saveFixedDraft(model);
      const message=(state.team?'고정 팀 초안을 저장했습니다.':'고정 팀 초안을 생성했습니다.')+' · team '+value(result.teamId)+' · revision '+value(result.revision);
      close();
      if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);
    }catch(error){
      state.saving=false;
      setStatus(value(error?.message)||'고정 팀 초안을 저장하지 못했습니다.','error');
      setControlsDisabled(false);
      state.layer.querySelector('[data-draft-mode="participation"]')?.setAttribute('aria-disabled','true');
    }
  }

  async function addForce(){
    if(state.saving||state.mutating||!state.team)return;
    const forces=teamForces();
    if(forces.length>=9){setStatus('한 팀에는 최대 9포스까지만 구성할 수 있습니다.');return;}
    const model=readModel();
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
    state.mutating=true;
    state.forceSaveRequestKey=state.forceSaveRequestKey||('sm-force-save-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    state.forceAddRequestKey=state.forceAddRequestKey||('sm-force-add-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.forceSaveRequestKey;
    setStatus('현재 입력 내용을 먼저 저장한 뒤 Server에 다음 포스를 추가하고 있습니다.','progress');
    setControlsDisabled(true);
    const teamId=Number(state.team.teamId);
    try{
      await bridge().saveFixedDraft(model);
      const saved=bridge().findTeam(teamId);
      if(!saved)throw new Error('저장된 팀 초안을 다시 찾지 못했습니다.');
      const result=await bridge().addForce(teamId,Number(saved.revision),state.forceAddRequestKey);
      state.team=bridge().findTeam(teamId);
      if(!state.team)throw new Error('포스가 추가된 팀 초안을 다시 찾지 못했습니다.');
      state.selectedForceId=Number(result.forceId||state.team.forces?.at(-1)?.forceId||0);
      state.selectedSlotId=0;
      state.forceSaveRequestKey='';state.forceAddRequestKey='';state.mutating=false;
      state.message=value(result.forceNo)+'포스를 추가했습니다. · 팀 revision '+value(result.revision)+' · Server 편성 재조회 완료';
      state.tone='success';
      state.layer.innerHTML=modeMarkup();
      syncDateMinimum();
      requestAnimationFrame(()=>{
        syncScrollFades();
        state.layer?.querySelector('[data-draft-force="'+CSS.escape(String(state.selectedForceId))+'"]')?.focus();
      });
    }catch(error){
      state.team=bridge()?.findTeam?.(teamId)||state.team;
      state.mutating=false;
      state.message=value(error?.message)||'포스를 추가하지 못했습니다.';
      state.tone='error';
      state.layer.innerHTML=modeMarkup();
      syncDateMinimum();
      requestAnimationFrame(syncScrollFades);
    }
  }

  async function assignCreatorCharacter(characterId){
    if(state.saving||state.mutating||!state.team)return;
    const force=selectedForce();
    const chosen=selectedSlot();
    const candidate=force?.creatorCandidates?.find(item=>Number(item.characterId)===Number(characterId));
    if(!force||!chosen||chosen.slot.occupied||!candidate){setStatus('빈 슬롯과 Server가 반환한 생성자 캐릭터를 다시 선택해 주세요.');return;}
    state.mutating=true;
    state.slotRequestKey=state.slotRequestKey||('sm-slot-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    const teamId=Number(state.team.teamId);
    const slotNumber=slotDisplayNumber(chosen);
    setStatus(slotNumber+'번 슬롯에 '+value(candidate.characterName)+' 캐릭터를 추가하고 Server 편성을 다시 확인하고 있습니다.','progress');
    setControlsDisabled(true);
    try{
      const result=await bridge().setSlot(teamId,Number(force.forceId),chosen.partyNo,Number(chosen.slot.slotNo),Number(candidate.characterId),Number(state.team.revision),state.slotRequestKey);
      state.team=bridge().findTeam(teamId);
      if(!state.team)throw new Error('캐릭터가 추가된 팀 초안을 다시 찾지 못했습니다.');
      state.slotRequestKey='';state.mutating=false;
      setControlsDisabled(false);
      renderRosterState();
      setStatus((candidate.isMain?'본캐 ':'부캐 ')+value(candidate.characterName)+' 캐릭터를 '+slotNumber+'번 슬롯에 추가했습니다. · 팀 revision '+value(result.revision),'success');
    }catch(error){
      state.team=bridge()?.findTeam?.(teamId)||state.team;
      state.mutating=false;
      setControlsDisabled(false);
      renderRosterState();
      setStatus(value(error?.message)||'생성자 캐릭터를 슬롯에 추가하지 못했습니다.','error');
    }
  }

  function handleClick(event){
    if(event.target.closest('[data-draft-close]')){if(!state.saving&&!state.mutating)close();return;}
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
    const force=event.target.closest('[data-draft-force]');
    if(force&&!force.disabled){state.selectedForceId=Number(force.dataset.draftForce)||0;state.selectedSlotId=0;renderRosterState();return;}
    if(event.target.closest('[data-draft-add-force]')){addForce();return;}
    const slot=event.target.closest('[data-draft-slot]');
    if(slot&&!slot.disabled&&slot.dataset.occupied!=='true'){
      state.selectedSlotId=Number(slot.dataset.slotId)||0;
      renderRosterState();
      setStatus(slotDisplayNumber(selectedSlot())+'번 슬롯에 추가할 생성자 캐릭터를 선택해 주세요.','progress');
      state.layer?.querySelector('.sanctuary-management-candidate-card')?.focus();
      return;
    }
    const candidate=event.target.closest('[data-draft-candidate]');
    if(candidate&&!candidate.disabled){assignCreatorCharacter(Number(candidate.dataset.draftCandidate));return;}
    if(event.target.closest('[data-draft-reset]')){openDraft(state.team,state.opener);}
  }

  function handleChange(event){if(event.target.name==='draftSanctuary')syncDateMinimum();}

  function handleKeydown(event){
    if(event.key==='Escape'&&!state.saving&&!state.mutating){event.preventDefault();close();return;}
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
