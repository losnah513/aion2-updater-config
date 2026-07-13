/*
 * sanctuary-editor.js - KINOJO Sanctuary Server Engine editor
 * Role: 성역 페이지의 수정 버튼을 Supabase 성역 슬롯 저장과 연결합니다.
 * - 화면은 운영 팀 단위로 전환하며, 선택한 팀의 포스만 접이식으로 표시합니다.
 * - 슬롯과 포스 메타 저장 규격은 기존 Server Engine 계약을 그대로 사용합니다.
 */
(function(){
  const CLASS_OPTIONS = ['', '검성', '수호성', '살성', '궁성', '정령성', '마도성', '치유성', '호법성', '권성'];

  function currentSanctuaryId(){
    try{ if(typeof currentId !== 'undefined' && currentId) return currentId; }catch(_err){}
    return String(new URLSearchParams(location.search).get('id') || window.KinojoSanctuaryCurrentId || '').trim().toLowerCase();
  }

  function data(){
    try{ if(typeof sanctuaryData !== 'undefined' && sanctuaryData) return sanctuaryData; }catch(_err){}
    return null;
  }

  function esc(value){
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function token(){
    if(window.KinojoAuth && typeof window.KinojoAuth.getToken === 'function') return window.KinojoAuth.getToken();
    try{
      const raw = localStorage.getItem('kinojo_login_session_v1');
      const session = raw ? JSON.parse(raw) : null;
      return session && session.token ? session.token : '';
    }catch(_err){ return ''; }
  }

  function toast(message){
    if(window.KinojoToast && typeof window.KinojoToast.show === 'function') return window.KinojoToast.show(message);
    alert(message);
  }

  function groupKey(group, index){
    return String(group.teamGroupNo || group.teamId || index + 1);
  }

  function groupName(group, index){
    return String(group.teamGroupName || group.operatingTeamName || ((group.teamGroupNo || index + 1) + '팀'));
  }

  function forceNo(force, index){
    return Number(force.forceNo || force.displayForceNo || force.teamNo || index + 1);
  }

  function storageTeamNo(force, group, index){
    const stored = Number(force.teamNo || force.storageTeamNo || 0);
    if(stored) return stored;
    const groupNo = Number(group?.teamGroupNo || group?.operatingTeamNo || 1);
    return (groupNo * 100) + forceNo(force, index);
  }

  function forceName(force, index){
    return String(force.forceName || force.teamName || (forceNo(force, index) + '포스'));
  }

  function memberCount(force){
    let count = 0;
    (force.parties || []).forEach(party => (party.slots || []).forEach(slot => { if(String(slot?.name || '').trim()) count += 1; }));
    return count;
  }

  function normalizeTeamGroups(source){
    const explicit = Array.isArray(source?.teamGroups) ? source.teamGroups : [];
    if(explicit.length){
      return explicit.map((group, index) => ({
        ...group,
        teamGroupNo: group.teamGroupNo || index + 1,
        teamGroupName: groupName(group, index),
        forces: Array.isArray(group.forces) ? group.forces.slice() : []
      })).sort((a,b) => Number(a.teamGroupNo || 0) - Number(b.teamGroupNo || 0));
    }

    const buckets = new Map();
    (Array.isArray(source?.teams) ? source.teams : []).forEach((force, index) => {
      const no = force.teamGroupNo || force.operatingTeamNo || force.groupNo || 1;
      const key = String(no);
      if(!buckets.has(key)){
        buckets.set(key, {
          teamGroupNo: no,
          teamGroupName: force.teamGroupName || force.operatingTeamName || (no + '팀'),
          forces: []
        });
      }
      buckets.get(key).forces.push({...force, __sourceIndex:index});
    });
    return Array.from(buckets.values())
      .sort((a,b) => Number(a.teamGroupNo || 0) - Number(b.teamGroupNo || 0))
      .map(group => ({...group, forces:(group.forces || []).sort((a,b) => forceNo(a,0) - forceNo(b,0))}));
  }

  function ensureModal(){
    let modal = document.getElementById('sanctuaryEditorModal');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'sanctuaryEditorModal';
    modal.className = 'sanctuary-editor-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="sanctuary-editor-card" role="dialog" aria-modal="true" aria-labelledby="sanctuaryEditorTitle">'
      + '<div class="sanctuary-editor-head">'
      + '<div><div class="tip-kicker">SANCTUARY TEAM EDIT</div><h2 id="sanctuaryEditorTitle">성역 팀 구성 수정</h2></div>'
      + '<button class="sanctuary-editor-close" type="button" aria-label="닫기">×</button>'
      + '</div>'
      + '<div class="sanctuary-editor-help"><strong>팀을 먼저 선택</strong>한 뒤 필요한 포스만 열어 수정하세요. 저장은 모든 팀의 변경 내용을 한 번에 반영합니다.</div>'
      + '<div class="sanctuary-editor-body" id="sanctuaryEditorBody"></div>'
      + '<div class="sanctuary-editor-foot">'
      + '<span class="sanctuary-editor-status" id="sanctuaryEditorStatus"></span>'
      + '<button class="edit-btn" id="sanctuaryEditorReloadBtn" type="button">새로고침</button>'
      + '<button class="edit-btn sanctuary-editor-save" id="sanctuaryEditorSaveBtn" type="button">서버에 저장</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if(event.target === modal) close(); });
    modal.querySelector('.sanctuary-editor-close')?.addEventListener('click', close);
    modal.querySelector('#sanctuaryEditorSaveBtn')?.addEventListener('click', save);
    modal.querySelector('#sanctuaryEditorReloadBtn')?.addEventListener('click', () => { close(); reloadFresh(); });
    return modal;
  }

  function renderTeamTab(group, index){
    const forces = Array.isArray(group.forces) ? group.forces : [];
    const members = forces.reduce((sum, force) => sum + memberCount(force), 0);
    const key = groupKey(group, index);
    return '<button class="sanctuary-editor-team-tab" type="button" role="tab" aria-selected="' + (index === 0 ? 'true' : 'false') + '" data-editor-team-tab="' + esc(key) + '">'
      + '<strong>' + esc(groupName(group, index)) + '</strong>'
      + '<span>' + forces.length + '포스 · ' + members + '명</span>'
      + '</button>';
  }

  function renderTeamGroup(group, index){
    const forces = Array.isArray(group.forces) ? group.forces : [];
    const members = forces.reduce((sum, force) => sum + memberCount(force), 0);
    const key = groupKey(group, index);
    return '<section class="sanctuary-editor-team-panel' + (index === 0 ? ' active' : '') + '" role="tabpanel" data-editor-team-panel="' + esc(key) + '"' + (index === 0 ? '' : ' hidden') + '>'
      + '<header class="sanctuary-editor-group-head">'
      + '<div><span>OPERATING TEAM</span><h3>' + esc(groupName(group, index)) + '</h3><p>' + forces.length + '개 포스 · 현재 ' + members + '명 배치</p></div>'
      + '<div class="sanctuary-editor-group-count"><strong>' + members + '</strong><span>배치 인원</span></div>'
      + '</header>'
      + '<div class="sanctuary-editor-force-list">'
      + (forces.length ? forces.map((force, forceIndex) => renderForce(force, group, forceIndex, forces.length)).join('') : '<div class="empty-main">이 팀에 등록된 포스가 없습니다.</div>')
      + '</div>'
      + '</section>';
  }

  function renderForce(force, group, index, forceCount){
    const members = [];
    (force.parties || []).forEach(party => (party.slots || []).forEach(slot => { if(slot.name) members.push(slot.name); }));
    const leaderOptions = ['<option value="">대표 미설정</option>']
      .concat(members.map(name => '<option value="' + esc(name) + '" ' + (name === force.leaderCharacter ? 'selected' : '') + '>' + esc(name) + '</option>'))
      .join('');
    const parties = (force.parties || []).map(party => renderParty(party)).join('');
    const no = forceNo(force, index);
    const storedNo = storageTeamNo(force, group, index);
    const groupNo = Number(group?.teamGroupNo || group?.operatingTeamNo || 1);
    const name = forceName(force, index);
    const compactTitle = forceCount === 1 ? '팀 기본 구성' : name;
    return '<details class="sanctuary-editor-force" data-editor-team="' + esc(storedNo) + '" data-editor-team-group="' + esc(groupNo) + '" data-editor-force-no="' + esc(no) + '"' + (index === 0 ? ' open' : '') + '>'
      + '<summary class="sanctuary-editor-force-summary">'
      + '<div class="sanctuary-editor-force-summary-main"><span>' + (forceCount === 1 ? 'TEAM ROSTER' : 'FORCE ' + esc(no)) + '</span><strong>' + esc(compactTitle) + '</strong><small>' + members.length + ' / 10명 · ' + ((force.parties || []).length || 2) + '파티</small></div>'
      + '<div class="sanctuary-editor-force-toggle">열기</div>'
      + '</summary>'
      + '<div class="sanctuary-editor-force-body">'
      + '<div class="sanctuary-editor-team-head">'
      + '<div class="sanctuary-editor-team-title">' + esc(name) + '</div>'
      + '<label>구성명<input data-team-field="teamName" value="' + esc(force.nameMode === 'manual' ? (force.teamName || force.forceName || '') : '') + '" placeholder="비우면 자동 구성명" /></label>'
      + '<label>대표자<select data-team-field="leaderCharacter">' + leaderOptions + '</select></label>'
      + '<label>색상<input data-team-field="customColor" type="color" value="' + esc(force.customColor || '#8b5cf6') + '" /></label>'
      + '</div>'
      + parties
      + '</div>'
      + '</details>';
  }

  function renderParty(party){
    return '<div class="sanctuary-editor-party" data-editor-party="' + esc(party.partyNo) + '">'
      + '<div class="sanctuary-editor-party-title">' + esc(party.partyNo) + '파티</div>'
      + '<div class="sanctuary-editor-slot-head"><span>슬롯</span><span>캐릭터명</span><span>직업</span><span>전투력</span><span>본캐명</span></div>'
      + (party.slots || []).map(slot => renderSlot(slot)).join('')
      + '</div>';
  }

  function renderSlot(slot){
    const options = CLASS_OPTIONS.map(item => '<option value="' + esc(item) + '" ' + (String(slot.className || '') === item ? 'selected' : '') + '>' + esc(item || '선택') + '</option>').join('');
    return '<div class="sanctuary-editor-slot" data-editor-slot="' + esc(slot.slotNo) + '">'
      + '<span class="sanctuary-editor-slot-no">' + esc(slot.slotNo) + '</span>'
      + '<input data-slot-field="name" value="' + esc(slot.name || '') + '" placeholder="캐릭터명" />'
      + '<select data-slot-field="className">' + options + '</select>'
      + '<input data-slot-field="power" value="' + esc(slot.power || '') + '" inputmode="numeric" placeholder="전투력" />'
      + '<input data-slot-field="owner" value="' + esc(slot.owner || '') + '" placeholder="본캐명" />'
      + '</div>';
  }

  function activateTeam(key, focusTab){
    const modal = ensureModal();
    modal.querySelectorAll('[data-editor-team-tab]').forEach(tab => {
      const active = String(tab.dataset.editorTeamTab) === String(key);
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      if(active && focusTab) tab.focus({preventScroll:true});
    });
    modal.querySelectorAll('[data-editor-team-panel]').forEach(panel => {
      const active = String(panel.dataset.editorTeamPanel) === String(key);
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function bindTeamTabs(modal){
    modal.querySelectorAll('[data-editor-team-tab]').forEach(tab => {
      tab.addEventListener('click', () => activateTeam(tab.dataset.editorTeamTab, false));
    });
  }

  function open(){
    const modal = ensureModal();
    const body = modal.querySelector('#sanctuaryEditorBody');
    const status = modal.querySelector('#sanctuaryEditorStatus');
    const source = data();
    if(!token()){
      toast('관리자 로그인 후 사용할 수 있습니다.');
      return;
    }
    if(!source){
      toast('성역 데이터를 먼저 불러와야 합니다.');
      return;
    }
    const groups = normalizeTeamGroups(source);
    if(!groups.length){
      body.innerHTML = '<div class="empty-main">수정할 팀 데이터가 없습니다.</div>';
    }else{
      body.innerHTML = '<div class="sanctuary-editor-workspace' + (groups.length === 1 ? ' single-team' : '') + '">'
        + (groups.length > 1 ? '<nav class="sanctuary-editor-team-nav" role="tablist" aria-label="성역 운영 팀">' + groups.map(renderTeamTab).join('') + '</nav>' : '')
        + '<div class="sanctuary-editor-team-content">' + groups.map(renderTeamGroup).join('') + '</div>'
        + '</div>';
      bindTeamTabs(modal);
      activateTeam(groupKey(groups[0], 0), false);
    }
    if(status) status.textContent = '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sanctuary-editor-open');
  }

  function close(){
    const modal = document.getElementById('sanctuaryEditorModal');
    if(!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sanctuary-editor-open');
  }

  function collect(){
    const modal = ensureModal();
    const updates = [];
    const teamMeta = [];
    modal.querySelectorAll('[data-editor-team]').forEach(forceEl => {
      const teamNo = Number(forceEl.dataset.editorTeam || 0);
      const teamGroupNo = Number(forceEl.dataset.editorTeamGroup || 0);
      const forceNoValue = Number(forceEl.dataset.editorForceNo || 0);
      const teamName = String(forceEl.querySelector('[data-team-field="teamName"]')?.value || '').trim();
      const leaderCharacter = String(forceEl.querySelector('[data-team-field="leaderCharacter"]')?.value || '').trim();
      const customColor = String(forceEl.querySelector('[data-team-field="customColor"]')?.value || '').trim();
      teamMeta.push({ teamNo, teamGroupNo, forceNo: forceNoValue, teamName, nameMode: teamName ? 'manual' : 'auto', leaderCharacter, customColor });
      forceEl.querySelectorAll('[data-editor-party]').forEach(partyEl => {
        const partyNo = Number(partyEl.dataset.editorParty || 0);
        partyEl.querySelectorAll('[data-editor-slot]').forEach(slotEl => {
          updates.push({
            teamNo,
            teamGroupNo,
            forceNo: forceNoValue,
            partyNo,
            slotNo: Number(slotEl.dataset.editorSlot || 0),
            name: String(slotEl.querySelector('[data-slot-field="name"]')?.value || '').trim(),
            className: String(slotEl.querySelector('[data-slot-field="className"]')?.value || '').trim(),
            power: String(slotEl.querySelector('[data-slot-field="power"]')?.value || '').replace(/[^0-9]/g, ''),
            owner: String(slotEl.querySelector('[data-slot-field="owner"]')?.value || '').trim()
          });
        });
      });
    });
    return { updates, teamMeta };
  }

  async function save(){
    const modal = ensureModal();
    const status = modal.querySelector('#sanctuaryEditorStatus');
    const btn = modal.querySelector('#sanctuaryEditorSaveBtn');
    try{
      if(!token()) throw new Error('관리자 로그인 후 사용할 수 있습니다.');
      if(!currentSanctuaryId()) throw new Error('성역 Master 정보를 먼저 불러와 주세요.');
      const payload = collect();
      if(!payload.updates.length) throw new Error('저장할 슬롯이 없습니다.');
      if(status){ status.className = 'sanctuary-editor-status pending'; status.textContent = 'Server Engine 저장 중...'; }
      if(btn){ btn.disabled = true; btn.textContent = '저장 중...'; }
      if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');
      const result = await window.KinojoApi.postAction('sanctuaryAdmin', {
        command: 'saveSheet',
        sessionToken: token(),
        sanctuaryId: currentSanctuaryId(),
        updates: payload.updates,
        teamMeta: payload.teamMeta
      });
      if(!result.ok) throw new Error(result.message || '성역 서버 저장 실패');
      try{ sessionStorage.removeItem('kinojo_sanctuary_cache_v2026071301_' + currentSanctuaryId()); }catch(_err){}
      if(status){ status.className = 'sanctuary-editor-status success'; status.textContent = '저장 완료 · ' + Number(result.updatedSlots || 0) + '개 슬롯 반영'; }
      await reloadFresh();
      setTimeout(close, 350);
    }catch(err){
      if(status){ status.className = 'sanctuary-editor-status error'; status.textContent = err.message || String(err); }
      else toast(err.message || String(err));
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '서버에 저장'; }
    }
  }

  async function reloadFresh(){
    try{
      if(typeof fetchSanctuaryFresh === 'function' && typeof applySanctuaryData === 'function'){
        const fresh = await fetchSanctuaryFresh();
        applySanctuaryData(fresh);
        return;
      }
    }catch(_err){}
    location.reload();
  }

  function bind(){
    const btn = document.getElementById('editModeBtn');
    if(btn && !btn.dataset.sanctuaryEditorBound){
      btn.dataset.sanctuaryEditorBound = '1';
      btn.textContent = '성역 팀 수정';
      btn.addEventListener('click', function(event){
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }, true);
    }
    document.addEventListener('keydown', event => { if(event.key === 'Escape') close(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.KinojoSanctuaryEditor = { open, close, save, bind };
})();
