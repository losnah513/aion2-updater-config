/*
 * sanctuary-editor.js - KINOJO Sanctuary operating team editor
 * Role: MASTER 성역 시트의 편성 정보는 읽기 전용으로 보여주고,
 *       운영 팀 이름과 대표자만 Server Engine에 저장합니다.
 */
(function(){
  function currentSanctuaryId(){
    try{ if(typeof currentId !== 'undefined' && currentId) return currentId; }catch(_err){}
    return String(new URLSearchParams(location.search).get('id') || window.KinojoSanctuaryCurrentId || '').trim().toLowerCase();
  }

  function sourceData(){
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

  function forceNo(force, index){
    return Number(force?.forceNo || force?.displayForceNo || (Number(force?.teamNo || 0) >= 100 ? Number(force.teamNo) % 100 : force?.teamNo) || index + 1);
  }

  function memberNames(group){
    const names = [];
    const seen = new Set();
    (group.forces || []).forEach(force => {
      (force.parties || []).forEach(party => {
        (party.slots || []).forEach(slot => {
          const name = String(slot?.name || '').trim();
          if(name && !seen.has(name)){
            seen.add(name);
            names.push(name);
          }
        });
      });
    });
    return names;
  }

  function normalizeTeamGroups(source){
    const explicit = Array.isArray(source?.teamGroups) ? source.teamGroups : [];
    if(explicit.length){
      return explicit.map((group, index) => {
        const no = Number(group.teamGroupNo || group.operatingTeamNo || index + 1);
        const forces = Array.isArray(group.forces) ? group.forces.slice() : [];
        const autoName = String(group.autoTeamName || group.autoName || '').trim();
        const displayName = String(group.teamGroupName || group.operatingTeamName || group.teamName || autoName || (no + '팀')).trim();
        return {
          ...group,
          teamGroupNo:no,
          teamGroupName:displayName,
          autoTeamName:autoName || displayName,
          nameMode:String(group.nameMode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto',
          leaderCharacter:String(group.leaderCharacter || '').trim(),
          forces:forces.sort((a,b) => forceNo(a,0) - forceNo(b,0))
        };
      }).sort((a,b) => a.teamGroupNo - b.teamGroupNo);
    }

    const buckets = new Map();
    (Array.isArray(source?.teams) ? source.teams : []).forEach((force, index) => {
      const no = Number(force.teamGroupNo || force.operatingTeamNo || force.groupNo || 1);
      if(!buckets.has(no)){
        buckets.set(no, {
          teamGroupNo:no,
          teamGroupName:String(force.teamGroupName || force.operatingTeamName || (no + '팀')),
          autoTeamName:String(force.autoTeamName || force.teamGroupName || force.operatingTeamName || (no + '팀')),
          nameMode:String(force.nameMode || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto',
          leaderCharacter:String(force.leaderCharacter || '').trim(),
          forces:[]
        });
      }
      buckets.get(no).forces.push({...force,__sourceIndex:index});
    });
    return Array.from(buckets.values())
      .sort((a,b) => a.teamGroupNo - b.teamGroupNo)
      .map(group => ({...group,forces:group.forces.sort((a,b) => forceNo(a,0) - forceNo(b,0))}));
  }

  function ensureModal(){
    let modal = document.getElementById('sanctuaryEditorModal');
    if(modal) return modal;

    modal = document.createElement('section');
    modal.id = 'sanctuaryEditorModal';
    modal.className = 'sanctuary-editor-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = ''
      + '<div class="sanctuary-editor-card" role="dialog" aria-modal="true" aria-labelledby="sanctuaryEditorTitle">'
      + '  <header class="sanctuary-editor-head">'
      + '    <div><div class="tip-kicker">SANCTUARY TEAM MANAGEMENT</div><h2 id="sanctuaryEditorTitle">성역 정보 수정</h2><p>MASTER 성역 시트 편성은 읽기 전용이며 팀 이름과 대표자만 수정할 수 있습니다.</p></div>'
      + '    <button class="sanctuary-editor-close" type="button" aria-label="닫기">×</button>'
      + '  </header>'
      + '  <div class="sanctuary-editor-summary" id="sanctuaryEditorSummary"></div>'
      + '  <div class="sanctuary-editor-body" id="sanctuaryEditorBody"></div>'
      + '  <footer class="sanctuary-editor-foot">'
      + '    <span class="sanctuary-editor-status" id="sanctuaryEditorStatus"></span>'
      + '    <button class="edit-btn" id="sanctuaryEditorReloadBtn" type="button">새로고침</button>'
      + '    <button class="edit-btn sanctuary-editor-save" id="sanctuaryEditorSaveBtn" type="button">변경사항 저장</button>'
      + '  </footer>'
      + '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if(event.target === modal) close(); });
    modal.querySelector('.sanctuary-editor-close')?.addEventListener('click', close);
    modal.querySelector('#sanctuaryEditorSaveBtn')?.addEventListener('click', save);
    modal.querySelector('#sanctuaryEditorReloadBtn')?.addEventListener('click', () => reloadFresh());
    return modal;
  }

  function forceMembers(force){
    const members = [];
    (force.parties || []).forEach(party => {
      (party.slots || []).forEach(slot => {
        const name = String(slot?.name || '').trim();
        if(name) members.push(name);
      });
    });
    return members;
  }

  function renderForceSummary(force, index){
    const no = forceNo(force, index);
    const members = forceMembers(force);
    const parties = Number(force.partyCount || (force.parties || []).length || 2);
    return '<div class="sanctuary-editor-roster-force">'
      + '<div><strong>' + esc(no) + '포스</strong><span>' + esc(parties) + '파티 · ' + esc(members.length) + '명</span></div>'
      + '<p>' + (members.length ? members.map(esc).join(' · ') : '등록 인원 없음') + '</p>'
      + '</div>';
  }

  function renderTeamCard(group, index){
    const no = Number(group.teamGroupNo || index + 1);
    const forces = Array.isArray(group.forces) ? group.forces : [];
    const members = memberNames(group);
    const autoName = String(group.autoTeamName || group.teamGroupName || (no + '팀')).trim();
    const mode = group.nameMode === 'manual' ? 'manual' : 'auto';
    const displayName = String(group.teamGroupName || autoName || (no + '팀')).trim();
    const leader = String(group.leaderCharacter || '').trim();
    const leaderOptions = ['<option value="">대표 미설정</option>']
      .concat(members.map(name => '<option value="' + esc(name) + '"' + (name === leader ? ' selected' : '') + '>' + esc(name) + '</option>'))
      .join('');

    return '<article class="sanctuary-editor-team-card" data-editor-team-group="' + esc(no) + '" data-name-mode="' + esc(mode) + '" data-auto-name="' + esc(autoName) + '">'
      + '<div class="sanctuary-editor-team-number">' + esc(no) + '<span>팀</span></div>'
      + '<div class="sanctuary-editor-team-main">'
      + '  <div class="sanctuary-editor-team-name-row">'
      + '    <span class="sanctuary-editor-mode ' + (mode === 'manual' ? 'manual' : 'auto') + '" data-team-mode-label>' + (mode === 'manual' ? '사용자 지정' : '자동 생성') + '</span>'
      + '    <label class="sanctuary-editor-name-field"><span>팀 이름</span><input data-team-field="teamName" maxlength="40" value="' + esc(displayName) + '" /></label>'
      + '    <button class="sanctuary-editor-auto-btn" type="button" data-team-auto>자동 이름</button>'
      + '  </div>'
      + '  <div class="sanctuary-editor-team-controls">'
      + '    <label><span>대표자</span><select data-team-field="leaderCharacter">' + leaderOptions + '</select></label>'
      + '    <div class="sanctuary-editor-team-stat"><span>포스</span><strong>' + esc(forces.length) + '개</strong></div>'
      + '    <div class="sanctuary-editor-team-stat"><span>인원</span><strong>' + esc(members.length) + '명</strong></div>'
      + '  </div>'
      + '  <details class="sanctuary-editor-roster">'
      + '    <summary>MASTER 시트 편성 상세 보기</summary>'
      + '    <div class="sanctuary-editor-roster-list">' + (forces.length ? forces.map(renderForceSummary).join('') : '<div class="empty-main">등록된 포스가 없습니다.</div>') + '</div>'
      + '  </details>'
      + '</div>'
      + '</article>';
  }

  function renderSummary(source, groups){
    const info = source?.info || {};
    const forceCount = groups.reduce((sum, group) => sum + (group.forces || []).length, 0);
    const memberCount = groups.reduce((sum, group) => sum + memberNames(group).length, 0);
    return '<div class="sanctuary-editor-summary-name"><span>선택 성역</span><strong>' + esc(info.sanctuaryName || info.shortName || currentSanctuaryId()) + '</strong></div>'
      + '<div class="sanctuary-editor-summary-metrics">'
      + '  <span>운영 팀 <strong>' + esc(groups.length) + '개</strong></span>'
      + '  <span>포스 <strong>' + esc(forceCount) + '개</strong></span>'
      + '  <span>총 인원 <strong>' + esc(memberCount) + '명</strong></span>'
      + '</div>';
  }

  function setMode(card, mode){
    const normalized = mode === 'manual' ? 'manual' : 'auto';
    card.dataset.nameMode = normalized;
    const label = card.querySelector('[data-team-mode-label]');
    if(label){
      label.classList.toggle('manual', normalized === 'manual');
      label.classList.toggle('auto', normalized === 'auto');
      label.textContent = normalized === 'manual' ? '사용자 지정' : '자동 생성';
    }
  }

  function bindCards(modal){
    modal.querySelectorAll('[data-editor-team-group]').forEach(card => {
      const input = card.querySelector('[data-team-field="teamName"]');
      const autoButton = card.querySelector('[data-team-auto]');
      if(input){
        input.addEventListener('input', () => {
          const autoName = String(card.dataset.autoName || '').trim();
          setMode(card, String(input.value || '').trim() === autoName ? 'auto' : 'manual');
        });
      }
      if(autoButton){
        autoButton.addEventListener('click', () => {
          if(input) input.value = String(card.dataset.autoName || '');
          setMode(card, 'auto');
        });
      }
    });
  }

  function open(){
    const modal = ensureModal();
    const body = modal.querySelector('#sanctuaryEditorBody');
    const summary = modal.querySelector('#sanctuaryEditorSummary');
    const status = modal.querySelector('#sanctuaryEditorStatus');
    const source = sourceData();

    if(!token()){
      toast('관리자 로그인 후 사용할 수 있습니다.');
      return;
    }
    if(!source){
      toast('성역 데이터를 먼저 불러와야 합니다.');
      return;
    }

    const groups = normalizeTeamGroups(source);
    summary.innerHTML = renderSummary(source, groups);
    body.innerHTML = groups.length
      ? '<div class="sanctuary-editor-team-list">' + groups.map(renderTeamCard).join('') + '</div>'
        + '<aside class="sanctuary-editor-guide"><strong>안내 사항</strong><span>팀 이름을 비우는 대신 ‘자동 이름’을 누르면 Server Engine의 형용사 + 생물 이름을 사용합니다.</span><span>대표자는 해당 팀의 MASTER 시트 등록 캐릭터 중에서만 선택할 수 있습니다.</span><span>캐릭터명·직업·전투력·본캐명은 MASTER 성역 시트 원본이므로 이 화면에서 수정되지 않습니다.</span></aside>'
      : '<div class="empty-main">수정할 운영 팀 데이터가 없습니다.</div>';

    bindCards(modal);
    if(status){ status.className = 'sanctuary-editor-status'; status.textContent = ''; }
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
    const teamMeta = [];
    modal.querySelectorAll('[data-editor-team-group]').forEach(card => {
      const mode = card.dataset.nameMode === 'manual' ? 'manual' : 'auto';
      const inputName = String(card.querySelector('[data-team-field="teamName"]')?.value || '').trim();
      const leaderCharacter = String(card.querySelector('[data-team-field="leaderCharacter"]')?.value || '').trim();
      teamMeta.push({
        teamGroupNo:Number(card.dataset.editorTeamGroup || 0),
        teamName:mode === 'manual' ? inputName : '',
        nameMode:mode,
        leaderCharacter
      });
    });
    return { updates:[], teamMeta };
  }

  async function save(){
    const modal = ensureModal();
    const status = modal.querySelector('#sanctuaryEditorStatus');
    const btn = modal.querySelector('#sanctuaryEditorSaveBtn');
    try{
      if(!token()) throw new Error('관리자 로그인 후 사용할 수 있습니다.');
      if(!currentSanctuaryId()) throw new Error('성역 Master 정보를 먼저 불러와 주세요.');
      const payload = collect();
      if(!payload.teamMeta.length) throw new Error('저장할 운영 팀 정보가 없습니다.');
      if(status){ status.className = 'sanctuary-editor-status pending'; status.textContent = 'Server Engine 저장 중...'; }
      if(btn){ btn.disabled = true; btn.textContent = '저장 중...'; }
      if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');

      const result = await window.KinojoApi.postAction('sanctuaryAdmin', {
        command:'saveTeamMeta',
        sessionToken:token(),
        sanctuaryId:currentSanctuaryId(),
        updates:payload.updates,
        teamMeta:payload.teamMeta
      });
      if(!result.ok) throw new Error(result.message || '성역 운영 팀 저장 실패');

      try{ sessionStorage.removeItem('kinojo_sanctuary_cache_v2026071301_' + currentSanctuaryId()); }catch(_err){}
      if(status){ status.className = 'sanctuary-editor-status success'; status.textContent = '저장 완료 · ' + Number(result.updatedTeams || 0) + '개 팀 반영'; }
      await reloadFresh();
      setTimeout(close, 450);
    }catch(err){
      if(status){ status.className = 'sanctuary-editor-status error'; status.textContent = err.message || String(err); }
      else toast(err.message || String(err));
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '변경사항 저장'; }
    }
  }

  async function reloadFresh(){
    try{
      if(typeof fetchSanctuaryFresh === 'function' && typeof applySanctuaryData === 'function'){
        const fresh = await fetchSanctuaryFresh();
        applySanctuaryData(fresh);
        const modal = document.getElementById('sanctuaryEditorModal');
        if(modal?.classList.contains('open')) open();
        return;
      }
    }catch(_err){}
    location.reload();
  }

  function bind(){
    const btn = document.getElementById('editModeBtn');
    if(btn && !btn.dataset.sanctuaryEditorBound){
      btn.dataset.sanctuaryEditorBound = '1';
      btn.textContent = '성역 정보 수정';
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
