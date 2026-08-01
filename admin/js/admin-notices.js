/* KINOJO Admin General notices and event notice groups v2026080101 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const $$=A.$$;
  const EVENT_NOTICE_TYPES=A.EVENT_NOTICE_TYPES;
  const state=A.state;
  const adminEventNotice=(...args)=>A.adminEventNotice(...args);
  const adminNotice=(...args)=>A.adminNotice(...args);
  const esc=(...args)=>A.esc(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);
  const todayDateInputValue=(...args)=>A.todayDateInputValue(...args);

  function eventNoticeStatusLabel(status){
    const key=String(status||'').toUpperCase();
    if(key==='DRAFT') return '작성중';
    if(key==='SCHEDULED') return '예정';
    if(key==='ACTIVE') return '진행중';
    if(key==='EXPIRED') return '종료';
    if(key==='PAUSED') return '일시중지';
    if(key==='PUBLISHED') return '노출';
    if(key==='DELETED') return '삭제됨';
    return key || '상태 없음';
  }

  function eventNoticePillClass(status){
    const key=String(status||'').toUpperCase();
    if(key==='DRAFT') return 'info';
    if(key==='SCHEDULED') return 'info';
    if(key==='ACTIVE') return 'ok';
    if(key==='PAUSED') return 'info';
    if(key==='EXPIRED' || key==='DELETED') return 'error';
    return 'info';
  }

  function formatEventDateTime(value){
    if(!value) return '-';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  function normalizeEventNoticeGroup(g){
    return {
      id:g.id || g.groupId || g.group_id || '',
      title:g.title || g.groupTitle || '이벤트 공지',
      status:g.runtimeStatus || g.runtime_status || g.status || '',
      rawStatus:g.status || '',
      itemCount:Number(g.itemCount || g.item_count || (Array.isArray(g.items)?g.items.length:0) || 0),
      priority:Number(g.priority || 0),
      popupVersion:Number(g.popupVersion || g.popup_version || 0),
      createdAt:g.createdAt || g.created_at || '',
      updatedAt:g.updatedAt || g.updated_at || '',
      nextEventAt:g.nextEventAt || g.next_event_at || '',
      items:Array.isArray(g.items)?g.items:[]
    };
  }

  function eventNoticeTypeMeta(value){
    return EVENT_NOTICE_TYPES.find(t=>t.value===String(value||'')) || EVENT_NOTICE_TYPES[0];
  }

  function formatEventNoticeDateRange(g){
    const items=Array.isArray(g.items)?g.items:[];
    const dates=items.map(it=>it.eventAt||it.event_at||'').filter(Boolean).sort();
    if(!dates.length) return '일정 없음';
    const first=formatEventDateTime(dates[0]);
    const last=formatEventDateTime(dates[dates.length-1]);
    return first===last ? first : first+' ~ '+last;
  }

  function renderEventNoticeGroups(groups){
    const root=$('#eventNoticeList'); if(!root)return;
    if(!groups.length){ root.innerHTML='<div class="admin-empty">이벤트 공지 묶음이 없습니다.</div>'; return; }
    root.innerHTML=groups.map(raw=>{
      const g=normalizeEventNoticeGroup(raw);
      const pillClass=eventNoticePillClass(g.status);
      const types=(g.items||[]).slice(0,6).map(item=>{
        const type=item.noticeType||item.notice_type;
        const meta=eventNoticeTypeMeta(type);
        return '<span class="type-'+esc(meta.value || type)+'"><i>'+esc(meta.icon || 'INFO')+'</i>'+esc(meta.label)+'</span>';
      }).join('');
      return '<article class="admin-event-notice-entry" data-event-notice-id="'+esc(g.id)+'">'+
        '<div class="admin-event-notice-entry-top"><span class="admin-pill '+pillClass+'">'+esc(eventNoticeStatusLabel(g.status))+'</span><strong>'+esc(g.title)+'</strong></div>'+
        '<div class="admin-event-notice-entry-meta"><span>카드 '+g.itemCount+'개</span><span>'+esc(formatEventNoticeDateRange(g))+'</span><span>v'+g.popupVersion+'</span></div>'+ 
        (types?'<div class="admin-event-notice-type-list">'+types+'</div>':'')+
        '<div class="admin-event-notice-entry-actions"><button class="admin-btn" type="button" data-event-notice-preview>미리보기</button><button class="admin-btn" type="button" data-event-notice-edit>수정</button><button class="admin-btn" type="button" data-event-notice-duplicate>복제</button><button class="admin-btn danger" type="button" data-event-notice-delete>삭제</button></div>'+ 
      '</article>';
    }).join('');
  }

  async function loadEventNoticeGroups(){
    if(!$('#eventNoticeList')) return;
    const status=$('#eventNoticeStatusFilter')?.value || 'ALL';
    setStatus('#eventNoticeStatus','이벤트 공지 목록을 불러오는 중...','');
    try{
      const data=await adminEventNotice('listGroups',{status,limit:50});
      const groups=data.groups || data.items || data.eventNotices || [];
      state.eventNoticeGroups=(Array.isArray(groups)?groups:[]).map(normalizeEventNoticeGroup);
      state.eventNoticeGroups.sort((a,b)=>{
        const order={draft:10,scheduled:20,active:30,paused:40,expired:50,deleted:60};
        const oa=order[String(a.status||'').toLowerCase()]||90;
        const ob=order[String(b.status||'').toLowerCase()]||90;
        if(oa!==ob) return oa-ob;
        if((b.priority||0)!==(a.priority||0)) return (b.priority||0)-(a.priority||0);
        return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
      });
      renderEventNoticeGroups(state.eventNoticeGroups);
      setStatus('#eventNoticeStatus','이벤트 공지 묶음 '+state.eventNoticeGroups.length+'건','ok');
    }catch(err){
      setStatus('#eventNoticeStatus',err.message||String(err),'error');
      $('#eventNoticeList') && ($('#eventNoticeList').innerHTML='<div class="admin-empty">이벤트 공지 목록을 불러오지 못했습니다.</div>');
    }
  }

  function getEventNoticeGroupById(id){
    const key=String(id||'');
    return (state.eventNoticeGroups||[]).find(g=>String(g.id)===key) || null;
  }

  function eventNoticeTypeOptions(selected){
    return EVENT_NOTICE_TYPES.map(t=>'<option value="'+esc(t.value)+'" '+(String(selected||'')===t.value?'selected':'')+'>'+esc(t.label)+'</option>').join('');
  }

  function renderEventNoticeEditorCard(item, index){
    const type=item?.noticeType || item?.notice_type || 'abyss_low';
    const date=item?.eventDate || item?.event_date || (item?.eventAt || item?.event_at || '').slice(0,10) || todayDateInputValue();
    const time=item?.eventTime || item?.event_time || ((item?.eventAt || item?.event_at || '').match(/T(\d{2}:\d{2})/)||[])[1] || '22:00';
    const meta=eventNoticeTypeMeta(type);
    const title=item?.title || item?.mainText || '';
    const description=item?.description || item?.bodyText || '';
    return '<article class="admin-event-editor-card theme-'+esc(type)+'" data-event-notice-card>'+
      '<div class="admin-event-card-head"><strong><i class="admin-event-type-icon">'+esc(meta.icon || 'INFO')+'</i> 공지 카드 '+(index+1)+'</strong><div class="admin-event-card-actions"><button class="admin-btn" type="button" data-event-card-up>↑</button><button class="admin-btn" type="button" data-event-card-down>↓</button><button class="admin-btn danger" type="button" data-event-card-remove '+(index===0?'disabled':'')+'>삭제</button></div></div>'+
      '<div class="admin-event-card-grid">'+
        '<label>공지 종류<select class="admin-select" data-event-field="noticeType">'+eventNoticeTypeOptions(type)+'</select></label>'+
        '<label>날짜<input class="admin-input" type="date" data-event-field="eventDate" value="'+esc(date)+'"/></label>'+
        '<label>시간<input class="admin-input" type="time" data-event-field="eventTime" value="'+esc(time)+'"/></label>'+
      '</div>'+
      '<label>메인 텍스트<input class="admin-input" data-event-field="title" maxlength="80" placeholder="예: 어비스 하층 요새전 시작" value="'+esc(title)+'"/></label>'+
      '<label>본문 작은 텍스트<textarea class="admin-textarea small" data-event-field="description" maxlength="200" placeholder="예: 10분 전 파티 합류 / 이동 준비">'+esc(description)+'</textarea></label>'+
    '</article>';
  }

  function getDefaultEventNoticeItem(order){
    const t=EVENT_NOTICE_TYPES[order % Math.min(EVENT_NOTICE_TYPES.length,6)] || EVENT_NOTICE_TYPES[0];
    return { noticeType:t.value, eventDate:todayDateInputValue(), eventTime:'22:00', title:t.title, description:t.body, displayOrder:order+1 };
  }

  function renumberEventNoticeEditor(){
    const cards=$$('[data-event-notice-card]', $('#eventNoticeEditorCards'));
    cards.forEach((card,idx)=>{
      const strong=card.querySelector('.admin-event-card-head strong'); if(strong) strong.textContent='공지 카드 '+(idx+1);
      const remove=card.querySelector('[data-event-card-remove]'); if(remove) remove.disabled=cards.length<=1;
      const up=card.querySelector('[data-event-card-up]'); if(up) up.disabled=idx===0;
      const down=card.querySelector('[data-event-card-down]'); if(down) down.disabled=idx===cards.length-1;
    });
    const add=$('#eventNoticeAddCardBtn'); if(add) add.disabled=cards.length>=6;
    const count=$('#eventNoticeEditorCount'); if(count) count.textContent='카드 '+cards.length+'/6';
  }

  function applyEventNoticeTypeTemplate(card){
    const type=card?.querySelector('[data-event-field="noticeType"]')?.value || 'abyss_low';
    const preset=EVENT_NOTICE_TYPES.find(t=>t.value===type) || EVENT_NOTICE_TYPES[0];
    const title=card.querySelector('[data-event-field="title"]');
    const description=card.querySelector('[data-event-field="description"]');
    if(title && !title.value.trim()) title.value=preset.title;
    if(description && !description.value.trim()) description.value=preset.body;
    if(card){
      card.className = card.className.replace(/\btheme-[a-z0-9_]+\b/g,'').trim() + ' theme-' + preset.value;
      const icon=card.querySelector('.admin-event-type-icon');
      if(icon) icon.textContent=preset.icon || 'INFO';
    }
  }

  function openEventNoticeEditor(group){
    state.eventNoticeEditingId = group?.id || null;
    const modal=$('#eventNoticeEditorModal'); if(!modal)return;
    const title=$('#eventNoticeEditorTitle');
    if(title) title.textContent = group ? '이벤트 공지 수정' : '이벤트 공지 등록';
    $('#eventNoticeGroupTitle') && ($('#eventNoticeGroupTitle').value = group?.title || '이벤트 공지');
    $('#eventNoticeGroupStatus') && ($('#eventNoticeGroupStatus').value = String(group?.rawStatus || group?.status || 'draft').toLowerCase());
    $('#eventNoticeGroupPriority') && ($('#eventNoticeGroupPriority').value = String(group?.priority || 0));
    const items = (Array.isArray(group?.items) && group.items.length) ? group.items.slice(0,6) : [getDefaultEventNoticeItem(0)];
    $('#eventNoticeEditorCards').innerHTML = items.map((item,idx)=>renderEventNoticeEditorCard(item,idx)).join('');
    setStatus('#eventNoticeEditorStatus','', '');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden','false');
    renumberEventNoticeEditor();
  }

  function closeEventNoticeEditor(){
    const modal=$('#eventNoticeEditorModal'); if(!modal)return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden','true');
    state.eventNoticeEditingId=null;
  }

  function startEventNoticeCreate(){
    openEventNoticeEditor(null);
  }

  function editEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','수정할 이벤트 공지 묶음을 찾지 못했습니다. 목록을 새로고침해 주세요.','error'); return; }
    openEventNoticeEditor(group);
  }

  function normalizeEventNoticeItemForPreview(item){
    const type=item?.noticeType || item?.notice_type || 'event';
    const meta=eventNoticeTypeMeta(type);
    const eventAt=item?.eventAt || item?.event_at || '';
    const date=item?.eventDate || item?.event_date || (eventAt ? String(eventAt).slice(0,10) : '');
    const time=item?.eventTime || item?.event_time || ((String(eventAt).match(/T(\d{2}:\d{2})/)||[])[1]) || '';
    return { type, label:meta.label, icon:meta.icon || 'INFO', title:item?.title || item?.mainText || '이벤트 공지', description:item?.description || item?.bodyText || '', date, time };
  }

  function renderEventNoticePreviewBlock(group){
    const g=group ? normalizeEventNoticeGroup(group) : normalizeEventNoticeGroup(collectEventNoticeEditorPayload());
    const items=(g.items||[]).slice(0,6).map(normalizeEventNoticeItemForPreview);
    const cards=items.map(item=>'<article class="kinojo-event-preview-card type-'+esc(item.type)+'"><i>'+esc(item.icon||'INFO')+'</i><div><strong>'+esc(item.label)+'</strong><b>'+esc(item.title)+'</b><span>'+esc(item.description||'')+'</span></div><time>'+esc(item.time||'--:--')+'</time></article>').join('');
    return '<div class="kinojo-event-preview-wrap"><header><span>EVENT NOTICE</span><strong>'+esc(g.title||'이벤트 공지')+'</strong></header><div class="kinojo-event-preview-cards">'+cards+'</div><footer><button type="button">오늘 하루 그만보기</button><button type="button">닫기</button></footer></div>';
  }

  function openEventNoticePreview(group){
    const modal=$('#eventNoticePreviewModal'); const body=$('#eventNoticePreviewBody'); if(!modal||!body)return;
    body.innerHTML=renderEventNoticePreviewBlock(group);
    modal.classList.add('active'); modal.setAttribute('aria-hidden','false');
  }

  function closeEventNoticePreview(){
    const modal=$('#eventNoticePreviewModal'); if(!modal)return;
    modal.classList.remove('active'); modal.setAttribute('aria-hidden','true');
  }

  function duplicateEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','복제할 이벤트 공지 묶음을 찾지 못했습니다.','error'); return; }
    const clone=Object.assign({}, group, { id:null, title:(group.title||'이벤트 공지')+' 복사본', rawStatus:'draft', status:'DRAFT' });
    clone.items=(group.items||[]).map((item,idx)=>Object.assign({}, item, { id:null, displayOrder:idx+1, display_order:idx+1 }));
    openEventNoticeEditor(clone);
    setStatus('#eventNoticeEditorStatus','복제본입니다. 날짜와 문구를 확인한 뒤 저장하세요.','');
  }

  async function deleteEventNoticeGroup(id){
    const group=getEventNoticeGroupById(id);
    if(!group){ setStatus('#eventNoticeStatus','삭제할 이벤트 공지 묶음을 찾지 못했습니다.','error'); return; }
    if(!confirm('이벤트 공지 묶음 "'+(group.title||'')+'"을 삭제 처리할까요?')) return;
    setStatus('#eventNoticeStatus','이벤트 공지를 삭제 처리하는 중...','');
    try{
      const res=await adminEventNotice('deleteGroup',{groupId:id});
      if(res && res.ok===false) throw new Error(res.message||'이벤트 공지 삭제 실패');
      toast('이벤트 공지 삭제 완료');
      await loadEventNoticeGroups();
    }catch(err){ setStatus('#eventNoticeStatus',err.message||String(err),'error'); }
  }

  function collectEventNoticeEditorPayload(){
    const cards=$$('[data-event-notice-card]', $('#eventNoticeEditorCards'));
    const items=cards.map((card,idx)=>{
      const get=(key)=>card.querySelector('[data-event-field="'+key+'"]')?.value || '';
      return {
        displayOrder:idx+1,
        noticeType:get('noticeType'),
        eventDate:get('eventDate'),
        eventTime:get('eventTime'),
        title:get('title').trim(),
        description:get('description').trim()
      };
    });
    return {
      groupId:state.eventNoticeEditingId || null,
      title:($('#eventNoticeGroupTitle')?.value || '이벤트 공지').trim(),
      status:$('#eventNoticeGroupStatus')?.value || 'draft',
      priority:Number($('#eventNoticeGroupPriority')?.value || 0),
      items
    };
  }

  async function saveEventNoticeEditor(){
    const payload=collectEventNoticeEditorPayload();
    if(!payload.title){ setStatus('#eventNoticeEditorStatus','공지 묶음 제목을 입력하세요.','error'); return; }
    if(!payload.items.length){ setStatus('#eventNoticeEditorStatus','공지 카드를 최소 1개 이상 입력하세요.','error'); return; }
    if(payload.items.length>6){ setStatus('#eventNoticeEditorStatus','공지 카드는 최대 6개까지 등록 가능합니다.','error'); return; }
    for(let i=0;i<payload.items.length;i++){
      const item=payload.items[i];
      if(!item.noticeType){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 종류를 선택하세요.','error'); return; }
      if(!item.eventDate){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 날짜를 입력하세요.','error'); return; }
      if(!item.eventTime){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 시간을 입력하세요.','error'); return; }
      if(!item.title){ setStatus('#eventNoticeEditorStatus','공지 카드 '+(i+1)+'번의 메인 텍스트를 입력하세요.','error'); return; }
    }
    const btn=$('#eventNoticeEditorSaveBtn'); if(btn) btn.disabled=true;
    setStatus('#eventNoticeEditorStatus','이벤트 공지를 저장하는 중...','');
    try{
      const res=await adminEventNotice('saveGroup', payload);
      if(res && res.ok===false) throw new Error(res.message || '이벤트 공지 저장 실패');
      toast('이벤트 공지 저장 완료');
      setStatus('#eventNoticeStatus','저장 후 목록을 새로고침했습니다.','ok');
      closeEventNoticeEditor();
      await loadEventNoticeGroups();
    }catch(err){
      setStatus('#eventNoticeEditorStatus',err.message||String(err),'error');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  async function loadNotices(){
    setStatus('#noticeStatus','공지 목록을 불러오는 중...','');
    try{ const list=await adminNotice('listNotices',{limit:20}); const notices=list.notices||[]; $('#noticeList').innerHTML=notices.length?notices.map(n=>'<article class="admin-row"><div class="admin-row-main"><strong>'+esc(n.noticeType||n.notice||'공지')+'</strong><span>'+esc(n.content||'')+'</span></div><div class="admin-row-actions"><span class="admin-pill info">'+esc(n.author||'관리자')+'</span></div></article>').join(''):'<div class="admin-empty">등록된 공지가 없습니다.</div>'; setStatus('#noticeStatus','공지 '+notices.length+'건','ok'); }
    catch(err){ setStatus('#noticeStatus',err.message||String(err),'error'); }
  }

  async function saveNotice(){
    const content=$('#noticeContent')?.value||''; const noticeType=$('#noticeType')?.value||'공지'; if(!content.trim()){setStatus('#noticeStatus','공지 내용을 입력하세요.','error');return;}
    try{ const res=await adminNotice('createNotice',{content,noticeType}); if(res.ok===false)throw new Error(res.message||'공지 저장 실패'); $('#noticeContent').value=''; toast('공지 저장 완료'); await loadNotices(); }
    catch(err){ setStatus('#noticeStatus',err.message||String(err),'error'); }
  }

  Object.assign(A,{eventNoticeStatusLabel,eventNoticePillClass,formatEventDateTime,normalizeEventNoticeGroup,eventNoticeTypeMeta,formatEventNoticeDateRange,renderEventNoticeGroups,loadEventNoticeGroups,getEventNoticeGroupById,eventNoticeTypeOptions,renderEventNoticeEditorCard,getDefaultEventNoticeItem,renumberEventNoticeEditor,applyEventNoticeTypeTemplate,openEventNoticeEditor,closeEventNoticeEditor,startEventNoticeCreate,editEventNoticeGroup,normalizeEventNoticeItemForPreview,renderEventNoticePreviewBlock,openEventNoticePreview,closeEventNoticePreview,duplicateEventNoticeGroup,deleteEventNoticeGroup,collectEventNoticeEditorPayload,saveEventNoticeEditor,loadNotices,saveNotice});
})(window.KinojoAdmin);
