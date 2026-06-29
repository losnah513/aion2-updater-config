/*
 * KINOJO Common Admin Panel
 * Role: 탑바 공용 관리 패널의 버튼 동작을 모든 페이지에서 동일하게 처리합니다.
 * Note: 명예의 전당 전용 hall-admin.js에 있던 관리자 버튼 로직을 공통 UI로 이동한 파일입니다.
 */
(function(){
  function q(s,root=document){return root.querySelector(s)}
  function escapeHtml(value){
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }
  function apiUrl(){
    if(window.KinojoApi && typeof window.KinojoApi.getBaseUrl === 'function') return window.KinojoApi.getBaseUrl();
    const param=new URLSearchParams(location.search).get('api');
    if(param)return param;
    return '';
  }
  function token(){return window.KinojoAuth?.getSession?.()?.token || window.KinojoAuth?.getToken?.() || ''}
  function adminUrl(action,params={}){
    const base=apiUrl();
    const q=new URLSearchParams(Object.assign({action,t:String(Date.now())},params));
    if(!base) return '';
    return base+(base.includes('?')?'&':'?')+q.toString();
  }
  function setAdminButtonLoading_(id,text){
    const btn=document.getElementById(id);if(!btn)return;
    if(!btn.dataset.oldText)btn.dataset.oldText=btn.textContent||'';
    btn.disabled=true;btn.textContent=text||'처리 중...';
  }
  function clearAdminButtonLoading_(id,text){
    const btn=document.getElementById(id);if(!btn)return;
    btn.disabled=false;btn.textContent=text||btn.dataset.oldText||btn.textContent;delete btn.dataset.oldText;
  }
  function activateAdminPane(key){
    document.querySelectorAll('[data-admin-panel]').forEach(btn=>btn.classList.toggle('active',btn.dataset.adminPanel===key));
    document.querySelectorAll('[data-admin-pane]').forEach(pane=>pane.classList.toggle('active',pane.dataset.adminPane===key));
    if(key==='account'){
      window.KinojoAuth?.renderAccountAdminInline?.({ load:true, focus:false });
    }
    if(key==='system'){
      loadAdminNotices();
    }
  }
  function bindAdminTabs(){
    document.querySelectorAll('[data-admin-panel]').forEach(btn=>{
      if(btn.dataset.boundCommonAdminTab)return;
      btn.dataset.boundCommonAdminTab='1';
      btn.addEventListener('click',()=>activateAdminPane(btn.dataset.adminPanel));
    });
  }
  function resultTarget(key){
    const active=document.querySelector('.admin-panel-pane.active')?.dataset.adminPane || key || 'mvp';
    return document.querySelector('[data-admin-result="'+active+'"]') || document.querySelector('[data-admin-result="mvp"]');
  }
  function showAdminResult_(title,html,key){
    const target=resultTarget(key);
    if(!target){ alert((title||'결과')+'\n'+String(html||'').replace(/<[^>]+>/g,' ')); return; }
    target.innerHTML='<div class="admin-result-box"><div class="admin-result-head"><strong>'+escapeHtml(title||'결과')+'</strong><button type="button" aria-label="닫기">×</button></div><div class="admin-result-body">'+html+'</div></div>';
    target.querySelector('button')?.addEventListener('click',()=>{target.innerHTML='';});
  }
  async function adminMvp(){
    try{
      setAdminButtonLoading_('adminMvpBtn','확인 중...');
      const data=window.KinojoSupabase?.adminUnsupported ? await window.KinojoSupabase.adminUnsupported('MVP 후보 확인') : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data.ok)return showAdminResult_('MVP 후보 확인',escapeHtml(data.message||'후보 확인 실패'),'mvp');
      const season=data.season||{};
      const rows=(data.candidates||[]).slice(0,5).map((item,i)=>
        '<div class="admin-result-row"><strong>'+(i+1)+'위 '+escapeHtml(item.name||'-')+'</strong>'
        +'<span>시즌 '+Number(item.seasonScore||0)+' · 반응 '+Number(item.reactionScore||0)+' · 예상 '+Number(item.finalScorePreview||0)+'</span>'
        +'<span>좋아요 '+Number(item.like||0)+' / 싫어요 '+Number(item.dislike||0)+' · '+escapeHtml(item.excludeReason||'')+'</span></div>'
      ).join('')||'<div class="empty">아직 집계 데이터가 없습니다.</div>';
      showAdminResult_('MVP 후보 확인','<div class="admin-result-meta">'+escapeHtml(season.seasonName||'')+' '+escapeHtml(season.startDate||'')+' ~ '+escapeHtml(season.endDate||'')+'</div><div class="admin-result-list">'+rows+'</div><div class="admin-result-meta">전투력 보정 20%는 MVP 선정 시점에만 반영됩니다.</div>','mvp');
    }catch(e){showAdminResult_('MVP 후보 확인','확인 오류: '+escapeHtml(e.message||e),'mvp')}
    finally{clearAdminButtonLoading_('adminMvpBtn','MVP 후보 확인')}
  }
  async function adminSnapshot(){
    try{
      setAdminButtonLoading_('adminSnapshotBtn','생성 중...');
      const data=window.KinojoSupabase?.adminUnsupported ? await window.KinojoSupabase.adminUnsupported('성장왕 스냅샷 생성') : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data.ok)return showAdminResult_('성장왕 스냅샷 생성',escapeHtml(data.message||'스냅샷 저장 실패'),'growth');
      showAdminResult_('성장왕 스냅샷 생성','저장 완료: '+Number(data.result?.count||0)+'명','growth');
    }catch(e){showAdminResult_('성장왕 스냅샷 생성','저장 오류: '+escapeHtml(e.message||e),'growth')}
    finally{clearAdminButtonLoading_('adminSnapshotBtn','성장왕 스냅샷 생성')}
  }
  async function adminSnapshotTriggerInstall(){
    try{
      setAdminButtonLoading_('adminSnapshotTriggerBtn','설치 중...');
      const data=window.KinojoSupabase?.adminUnsupported ? await window.KinojoSupabase.adminUnsupported('주간 성장 자동 집계 활성화') : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data.ok){
        const msg=data.needAuth?'자동 트리거 설치 권한 승인이 필요합니다. Apps Script 편집기에서 installWeeklyGrowthSnapshotTriggers_ 함수를 한 번 직접 실행해 권한 승인 후 다시 시도해 주세요.':(data.message||'자동 트리거 설치 실패');
        return showAdminResult_('주간 성장 자동 집계 활성화',escapeHtml(msg),'growth');
      }
      showAdminResult_('주간 성장 자동 집계 활성화','설치 완료<br>수요일 00:00 START / 화요일 00:00 END','growth');
    }catch(e){showAdminResult_('주간 성장 자동 집계 활성화','설치 오류: '+escapeHtml(e.message||e),'growth')}
    finally{clearAdminButtonLoading_('adminSnapshotTriggerBtn','주간 성장 자동 집계 활성화')}
  }
  async function adminSnapshotStatus(){
    try{
      setAdminButtonLoading_('adminSnapshotStatusBtn','확인 중...');
      const data=window.KinojoSupabase?.adminUnsupported ? await window.KinojoSupabase.adminUnsupported('스냅샷 상태 확인') : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data.ok)return showAdminResult_('스냅샷 상태 확인',escapeHtml(data.message||'상태 확인 실패'),'growth');
      const rows=(data.weeks||[]).slice(0,8).map(w=>'<div class="admin-result-row"><strong>'+escapeHtml(w.weekKey||'-')+'</strong><span>START '+Number(w.startCount||0)+'명 · END '+Number(w.endCount||0)+'명 · '+(w.ready?'정상':'비교 불가')+'</span></div>').join('')||'<div class="empty">스냅샷 데이터가 없습니다.</div>';
      const trigger=data.trigger||{};
      const summary='<div class="admin-result-meta">최근 정상 주차: '+escapeHtml(data.latestReadyWeekKey||'없음')+'</div>'
        +'<div class="admin-result-meta">자동 트리거: '+(trigger.installed?'정상':'확인/설치 필요')+' · START '+Number(trigger.startCount||0)+'개 · END '+Number(trigger.endCount||0)+'개</div>'
        +'<div class="admin-result-list">'+rows+'</div>';
      showAdminResult_('스냅샷 상태 확인',summary,'growth');
    }catch(e){showAdminResult_('스냅샷 상태 확인','확인 오류: '+escapeHtml(e.message||e),'growth')}
    finally{clearAdminButtonLoading_('adminSnapshotStatusBtn','스냅샷 상태 확인')}
  }
  async function adminVisitAdjust(){
    const target=document.querySelector('[data-visit-target].active')?.dataset.visitTarget||'daily';
    const sign=document.querySelector('[data-visit-sign].active')?.dataset.visitSign||'plus';
    const amount=Math.max(1,Math.min(9999,Number(document.getElementById('adminVisitAmount')?.value||0)));
    const status=document.getElementById('adminVisitStatus');
    const mode=target==='total'?(sign==='minus'?'totalMinus':'totalPlus'):(sign==='minus'?'dailyMinus':'dailyPlus');
    try{
      setAdminButtonLoading_('adminVisitApplyBtn','반영중...');
      if(status){status.className='admin-status';status.textContent='반영 중...'}
      const data=window.KinojoSupabase?.adminVisit ? await window.KinojoSupabase.adminVisit(mode, amount) : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data.ok)throw new Error(data.message||'방문자수 반영 실패');
      if(window.KinojoCommonUI && typeof window.KinojoCommonUI.renderVisits==='function' && data.stats)window.KinojoCommonUI.renderVisits(data.stats);
      if(status){status.className='admin-status success';status.textContent='방문자수 반영 완료되었습니다.'}
    }catch(e){if(status){status.className='admin-status error';status.textContent='방문자수 반영 실패: '+(e.message||e)}}
    finally{clearAdminButtonLoading_('adminVisitApplyBtn','반영')}
  }
  function resetNoticeForm(){
    const idEl=document.getElementById('adminNoticeEditingId');
    const typeEl=document.getElementById('adminNoticeType');
    const contentEl=document.getElementById('adminNoticeContent');
    const saveBtn=document.getElementById('adminNoticeSaveBtn');
    const status=document.getElementById('adminNoticeStatus');
    if(idEl)idEl.value='';
    if(typeEl)typeEl.value='공지';
    if(contentEl)contentEl.value='';
    if(saveBtn)saveBtn.textContent='공지 등록';
    if(status){status.className='admin-status';status.textContent='';}
  }
  function renderAdminNoticeList(notices){
    const box=document.getElementById('adminNoticeAdminList');
    if(!box)return;
    if(!Array.isArray(notices)||!notices.length){
      box.innerHTML='<div class="admin-notice-list-empty">등록된 활성 공지가 없습니다.</div>';
      return;
    }
    box.innerHTML=notices.map(item=>{
      const id=Number(item.id||0);
      const type=escapeHtml(item.noticeType||item.notice||'공지');
      const author=escapeHtml(item.author||'관리자');
      const content=escapeHtml(item.content||'');
      const created=escapeHtml(String(item.createdAt||'').replace('T',' ').slice(0,16));
      return '<article class="admin-notice-card" data-notice-id="'+id+'">'
        +'<div class="admin-notice-card-head"><strong>['+type+']</strong><span>'+created+' · '+author+'</span></div>'
        +'<p>'+content+'</p>'
        +'<div class="admin-notice-card-actions">'
        +'<button class="btn admin-notice-edit-btn" type="button" data-notice-edit="'+id+'">수정</button>'
        +'<button class="btn admin-close admin-notice-delete-btn" type="button" data-notice-delete="'+id+'">삭제</button>'
        +'</div>'
        +'</article>';
    }).join('');
    box.querySelectorAll('[data-notice-edit]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const id=Number(btn.dataset.noticeEdit||0);
        const item=notices.find(n=>Number(n.id||0)===id);
        if(!item)return;
        const idEl=document.getElementById('adminNoticeEditingId');
        const typeEl=document.getElementById('adminNoticeType');
        const contentEl=document.getElementById('adminNoticeContent');
        const saveBtn=document.getElementById('adminNoticeSaveBtn');
        const status=document.getElementById('adminNoticeStatus');
        if(idEl)idEl.value=String(id);
        if(typeEl)typeEl.value=item.noticeType||item.notice||'공지';
        if(contentEl){contentEl.value=item.content||'';contentEl.focus();}
        if(saveBtn)saveBtn.textContent='공지 수정 저장';
        if(status){status.className='admin-status pending';status.textContent='공지 수정 모드입니다.';}
      });
    });
    box.querySelectorAll('[data-notice-delete]').forEach(btn=>{
      btn.addEventListener('click',()=>adminDeleteNotice(Number(btn.dataset.noticeDelete||0)));
    });
  }
  async function loadAdminNotices(){
    const box=document.getElementById('adminNoticeAdminList');
    if(!box)return;
    try{
      box.innerHTML='<div class="admin-notice-list-empty">공지 목록을 불러오는 중입니다.</div>';
      const data=window.KinojoSupabase?.adminNotice ? await window.KinojoSupabase.adminNotice('listNotices',{limit:20}) : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data||data.ok===false)throw new Error(data?.message||'공지 목록을 불러오지 못했습니다.');
      renderAdminNoticeList(data.notices||[]);
    }catch(e){
      box.innerHTML='<div class="admin-notice-list-empty error">공지 목록 로딩 실패: '+escapeHtml(e.message||e)+'</div>';
    }
  }
  async function adminDeleteNotice(id){
    if(!id)return;
    const status=document.getElementById('adminNoticeStatus');
    const ok=window.confirm ? window.confirm('이 공지를 삭제할까요? 실제 DB에서는 비활성 처리됩니다.') : true;
    if(!ok)return;
    try{
      if(status){status.className='admin-status pending';status.textContent='공지사항 삭제 중...';}
      const data=window.KinojoSupabase?.adminNotice ? await window.KinojoSupabase.adminNotice('deleteNotice',{id}) : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data||data.ok===false)throw new Error(data?.message||'공지사항 삭제 실패');
      if(status){status.className='admin-status success';status.textContent='공지사항이 삭제되었습니다.';}
      resetNoticeForm();
      await loadAdminNotices();
      window.KinojoCommonUI?.reloadNotices?.();
    }catch(e){
      if(status){status.className='admin-status error';status.textContent='공지사항 삭제 실패: '+(e.message||e);}
      window.KinojoSafeError?.show?.(e,{feature:'공지사항 삭제',action:'noticeAdmin/deleteNotice',payload:{id},title:'공지사항 삭제가 정상 처리되지 않았습니다.',message:'오류 진단 내용을 복사해서 전달해 주세요.'});
    }
  }
  async function adminSaveNotice(){
    const idEl=document.getElementById('adminNoticeEditingId');
    const typeEl=document.getElementById('adminNoticeType');
    const contentEl=document.getElementById('adminNoticeContent');
    const status=document.getElementById('adminNoticeStatus');
    const editingId=Number(idEl?.value||0);
    const noticeType=String(typeEl?.value||'').trim();
    const content=String(contentEl?.value||'').trim();
    if(!noticeType||!content){
      if(status){status.className='admin-status error';status.textContent='공지 종류와 내용을 입력해 주세요.';}
      return;
    }
    try{
      setAdminButtonLoading_('adminNoticeSaveBtn',editingId?'수정 중...':'등록 중...');
      if(status){status.className='admin-status pending';status.textContent=editingId?'공지사항 수정 중...':'공지사항 등록 중...';}
      const action=editingId?'updateNotice':'createNotice';
      const data=window.KinojoSupabase?.adminNotice ? await window.KinojoSupabase.adminNotice(action,{id:editingId,noticeType,content}) : {ok:false,message:'Supabase 설정을 확인해 주세요.'};
      if(!data || data.ok === false){
        throw Object.assign(new Error(data?.message||'공지사항 처리 결과를 확인하지 못했습니다.'), { data });
      }
      if(status){status.className='admin-status success';status.textContent=editingId?'공지사항이 수정되었습니다.':'공지사항이 등록되었습니다.';}
      resetNoticeForm();
      await loadAdminNotices();
      window.KinojoCommonUI?.reloadNotices?.();
    }catch(e){
      if(status){status.className='admin-status error';status.textContent='공지사항 처리가 정상 처리되지 않았습니다.';}
      window.KinojoSafeError?.show?.(e,{feature:editingId?'공지사항 수정':'공지사항 등록',action:'noticeAdmin/'+(editingId?'updateNotice':'createNotice'),payload:{id:editingId,noticeType,content},title:'공지사항 처리가 정상 처리되지 않았습니다.',message:'오류 진단 내용을 복사해서 전달해 주세요.'});
    }finally{clearAdminButtonLoading_('adminNoticeSaveBtn',editingId?'공지 수정 저장':'공지 등록')}
  }
  function bindButtons(){
    bindAdminTabs();
    const pairs=[
      ['adminMvpBtn',adminMvp],['adminSnapshotBtn',adminSnapshot],['adminSnapshotStatusBtn',adminSnapshotStatus],['adminSnapshotTriggerBtn',adminSnapshotTriggerInstall],['adminVisitApplyBtn',adminVisitAdjust],['adminNoticeSaveBtn',adminSaveNotice],['adminNoticeResetBtn',resetNoticeForm],['adminNoticeReloadBtn',loadAdminNotices]
    ];
    pairs.forEach(([id,fn])=>{const btn=document.getElementById(id);if(btn&&!btn.dataset.commonAdminBound){btn.dataset.commonAdminBound='1';btn.addEventListener('click',fn)}});
    document.querySelectorAll('[data-visit-sign]').forEach(btn=>{if(btn.dataset.boundVisitSign)return;btn.dataset.boundVisitSign='1';btn.addEventListener('click',()=>{document.querySelectorAll('[data-visit-sign]').forEach(b=>b.classList.remove('active'));btn.classList.add('active')})});
    document.querySelectorAll('[data-visit-target]').forEach(btn=>{if(btn.dataset.boundVisitTarget)return;btn.dataset.boundVisitTarget='1';btn.addEventListener('click',()=>{document.querySelectorAll('[data-visit-target]').forEach(b=>b.classList.remove('active'));btn.classList.add('active')})});
    const ownerMapBtn=document.getElementById('adminOwnerMapQuickBtn');
    if(ownerMapBtn&&!ownerMapBtn.dataset.commonAdminBound){
      ownerMapBtn.dataset.commonAdminBound='1';
      ownerMapBtn.addEventListener('click',()=>{
        activateAdminPane('account');
        setTimeout(()=>document.getElementById('adminOwnerMapSyncBtn')?.click(),0);
      });
    }
  }
  function init(){bindButtons();loadAdminNotices()}
  document.addEventListener('kinojo-admin-panel-ready',()=>bindButtons());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.KinojoAdminPanel={bind:bindButtons,adminMvp,adminSnapshot,adminSnapshotStatus,adminSnapshotTriggerInstall,adminVisitAdjust,adminSaveNotice,loadAdminNotices,resetNoticeForm,adminDeleteNotice};
  window.setAdminButtonLoading_=setAdminButtonLoading_;
  window.clearAdminButtonLoading_=clearAdminButtonLoading_;
  window.showAdminResult_=showAdminResult_;
  window.adminMvp=adminMvp;
  window.showMvpAdminPrompt=adminMvp;
  window.adminSnapshot=adminSnapshot;
  window.adminSnapshotStatus=adminSnapshotStatus;
  window.adminSnapshotTriggerInstall=adminSnapshotTriggerInstall;
  window.adminVisitAdjust=adminVisitAdjust;
})();
