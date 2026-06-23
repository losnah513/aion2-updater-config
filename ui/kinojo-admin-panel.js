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
    const param=new URLSearchParams(location.search).get('api');
    if(param)return param;
    try{ if(typeof WEB_APP_URL!=='undefined'&&WEB_APP_URL)return WEB_APP_URL; }catch(_e){}
    return 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';
  }
  function token(){return window.KinojoAuth?.getSession?.()?.token || window.KinojoAuth?.getToken?.() || ''}
  function adminUrl(action,params={}){
    const base=apiUrl();
    const q=new URLSearchParams(Object.assign({action,t:String(Date.now())},params));
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
      const res=await fetch(adminUrl('mvpAdmin',{sessionToken:token()}),{cache:'no-store'});
      const data=await res.json();
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
      const res=await fetch(adminUrl('weeklySnapshot',{sessionToken:token()}),{cache:'no-store'});
      const data=await res.json();
      if(!data.ok)return showAdminResult_('성장왕 스냅샷 생성',escapeHtml(data.message||'스냅샷 저장 실패'),'growth');
      showAdminResult_('성장왕 스냅샷 생성','저장 완료: '+Number(data.result?.count||0)+'명','growth');
    }catch(e){showAdminResult_('성장왕 스냅샷 생성','저장 오류: '+escapeHtml(e.message||e),'growth')}
    finally{clearAdminButtonLoading_('adminSnapshotBtn','성장왕 스냅샷 생성')}
  }
  async function adminSnapshotTriggerInstall(){
    try{
      setAdminButtonLoading_('adminSnapshotTriggerBtn','설치 중...');
      const res=await fetch(adminUrl('weeklySnapshotTriggers',{sessionToken:token()}),{cache:'no-store'});
      const data=await res.json();
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
      const res=await fetch(adminUrl('weeklySnapshotDiagnose',{sessionToken:token()}),{cache:'no-store'});
      const data=await res.json();
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
      const res=await fetch(adminUrl('hallVisit',{mode,boost:String(amount),sessionToken:token()}),{cache:'no-store'});
      const data=await res.json();
      if(!data.ok)throw new Error(data.message||'방문자수 반영 실패');
      if(typeof window.renderVisits==='function'&&data.stats)window.renderVisits(data.stats);
      if(status){status.className='admin-status success';status.textContent='방문자수 반영 완료되었습니다.'}
    }catch(e){if(status){status.className='admin-status error';status.textContent='방문자수 반영 실패: '+(e.message||e)}}
    finally{clearAdminButtonLoading_('adminVisitApplyBtn','반영')}
  }
  async function adminSaveNotice(){
    const typeEl=document.getElementById('adminNoticeType');
    const authorEl=document.getElementById('adminNoticeAuthor');
    const contentEl=document.getElementById('adminNoticeContent');
    const status=document.getElementById('adminNoticeStatus');
    const noticeType=String(typeEl?.value||'').trim();
    const author=String(authorEl?.value||'').trim();
    const content=String(contentEl?.value||'').trim();
    if(!noticeType||!author||!content){
      if(status){status.className='admin-status error';status.textContent='공지, 작성자, 내용을 모두 입력해 주세요.';}
      return;
    }
    try{
      setAdminButtonLoading_('adminNoticeSaveBtn','등록 중...');
      if(status){status.className='admin-status pending';status.textContent='공지사항 등록 중...';}
      const res=await fetch(apiUrl(),{method:'POST',body:JSON.stringify({action:'noticeAdmin',command:'createNotice',sessionToken:token(),noticeType,author,content})});
      const data=await res.json();
      if(!data.ok)throw new Error(data.message||'공지사항 등록 실패');
      if(status){status.className='admin-status success';status.textContent='공지사항이 등록되었습니다.';}
      if(contentEl)contentEl.value='';
      window.KinojoCommonUI?.reloadNotices?.();
    }catch(e){
      if(status){status.className='admin-status error';status.textContent='공지사항 등록 실패: '+(e.message||e);}
    }finally{clearAdminButtonLoading_('adminNoticeSaveBtn','공지 등록')}
  }
  function bindButtons(){
    bindAdminTabs();
    const pairs=[
      ['adminMvpBtn',adminMvp],['adminSnapshotBtn',adminSnapshot],['adminSnapshotStatusBtn',adminSnapshotStatus],['adminSnapshotTriggerBtn',adminSnapshotTriggerInstall],['adminVisitApplyBtn',adminVisitAdjust],['adminNoticeSaveBtn',adminSaveNotice]
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
  function init(){bindButtons()}
  document.addEventListener('kinojo-admin-panel-ready',()=>bindButtons());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.KinojoAdminPanel={bind:bindButtons,adminMvp,adminSnapshot,adminSnapshotStatus,adminSnapshotTriggerInstall,adminVisitAdjust,adminSaveNotice};
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
