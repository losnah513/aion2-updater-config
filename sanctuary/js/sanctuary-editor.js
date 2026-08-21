/*
 * sanctuary-editor.js - KINOJO Sanctuary step-based operating team editor
 * Role: MASTER 성역 시트 편성은 읽기 전용 카드로 보여주고,
 *       선택한 한 팀의 이름과 본캐 대표자만 Server Engine에 저장합니다.
 */
(function(){
  const state = {
    groups:[],
    selectedTeamNo:null,
    nameEditorOpen:false,
    leaderEditorOpen:false,
    busy:false
  };

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

  function normalizedName(value){
    return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
  }

  function token(){
    if(window.KinojoAuth && typeof window.KinojoAuth.getToken === 'function') return window.KinojoAuth.getToken();
    try{
      const raw = localStorage.getItem('kinojo_login_session_v1');
      const session = raw ? JSON.parse(raw) : null;
      return session && session.token ? session.token : '';
    }catch(_err){ return ''; }
  }

  function currentLevel(){
    const session = window.KinojoAuth?.getSession?.() || {};
    const direct = Number(session.level || 0);
    if(direct > 0) return direct;
    const role = String(session.role || session.roleLabel || '').toUpperCase().replace(/\s+/g,'_');
    if(role === 'MASTER') return 5;
    if(role === 'SUB_MASTER' || role === 'SUBMASTER') return 4;
    if(role === 'MANAGER' || role === 'ADMIN') return 3;
    if(role === 'STAFF') return 2;
    return 1;
  }

  function canEditTeamInfo(){ return currentLevel() >= 3; }
  function canAssignLeader(){ return currentLevel() >= 4; }

  function toast(message){
    if(window.KinojoToast && typeof window.KinojoToast.show === 'function') return window.KinojoToast.show(message);
    alert(message);
  }

  function forceNo(force, index){
    return Number(force?.forceNo || force?.displayForceNo || (Number(force?.teamNo || 0) >= 100 ? Number(force.teamNo) % 100 : force?.teamNo) || index + 1);
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

  function groupMembers(group){
    const members = [];
    const seen = new Set();
    (group?.forces || []).forEach((force, forceIndex) => {
      (force.parties || []).forEach((party, partyIndex) => {
        (party.slots || []).forEach(slot => {
          const name = String(slot?.name || '').trim();
          const key = normalizedName(name);
          if(!name || seen.has(key)) return;
          seen.add(key);
          members.push({
            name,
            className:String(slot.className || '').trim(),
            isMain:slot.isMain === true,
            mainCharacterName:String(slot.mainCharacterName || slot.owner || '').trim(),
            forceNo:forceNo(force, forceIndex),
            partyNo:Number(party.partyNo || partyIndex + 1)
          });
        });
      });
    });
    return members;
  }

  function allMemberNames(){
    const names = [];
    const seen = new Set();
    state.groups.forEach(group => groupMembers(group).forEach(member => {
      const key = normalizedName(member.name);
      if(!seen.has(key)){
        seen.add(key);
        names.push(member.name);
      }
    }));
    return names.sort((a,b) => a.localeCompare(b,'ko'));
  }

  function selectedGroup(){
    return state.groups.find(group => Number(group.teamGroupNo) === Number(state.selectedTeamNo)) || null;
  }

  function setStatus(message, type){
    const status = document.getElementById('sanctuaryEditorStatus');
    if(!status) return;
    status.className = 'sanctuary-editor-status' + (type ? ' ' + type : '');
    status.textContent = message || '';
  }

  function setBusy(busy){
    state.busy = busy === true;
    const modal = document.getElementById('sanctuaryEditorModal');
    modal?.querySelectorAll('button, input, select').forEach(control => {
      if(control.classList.contains('sanctuary-editor-close')) return;
      control.disabled = state.busy;
    });
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
      + '    <div><div class="tip-kicker">SANCTUARY TEAM MANAGEMENT</div><h2 id="sanctuaryEditorTitle">성역 정보 수정</h2><p id="sanctuaryEditorDescription">수정할 팀을 먼저 선택해 주세요.</p></div>'
      + '    <button class="sanctuary-editor-close" type="button" aria-label="닫기">×</button>'
      + '  </header>'
      + '  <div class="sanctuary-editor-summary" id="sanctuaryEditorSummary"></div>'
      + '  <div class="sanctuary-editor-body" id="sanctuaryEditorBody"></div>'
      + '  <footer class="sanctuary-editor-foot">'
      + '    <span class="sanctuary-editor-status" id="sanctuaryEditorStatus" aria-live="polite"></span>'
      + '    <button class="edit-btn" id="sanctuaryEditorReloadBtn" type="button">새로고침</button>'
      + '    <button class="edit-btn" id="sanctuaryEditorCloseBtn" type="button">닫기</button>'
      + '  </footer>'
      + '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if(event.target === modal) close();
      const action = event.target.closest('[data-editor-action]');
      if(action) handleAction(action);
    });
    modal.addEventListener('keydown', event => {
      if(event.key === 'Enter' && event.target?.id === 'sanctuaryEditorCharacterInput'){
        event.preventDefault();
        chooseByCharacter();
      }
    });
    modal.querySelector('.sanctuary-editor-close')?.addEventListener('click', close);
    modal.querySelector('#sanctuaryEditorCloseBtn')?.addEventListener('click', close);
    modal.querySelector('#sanctuaryEditorReloadBtn')?.addEventListener('click', () => reloadFresh(true));
    return modal;
  }

  function renderSummary(source, groups, group){
    const info = source?.info || {};
    if(group){
      const members = groupMembers(group);
      return '<div class="sanctuary-editor-summary-name"><span>선택 팀</span><strong>' + esc(group.teamGroupName) + '</strong></div>'
        + '<div class="sanctuary-editor-summary-metrics">'
        + '  <span>팀 번호 <strong>' + esc(group.teamGroupNo) + '팀</strong></span>'
        + '  <span>포스 <strong>' + esc((group.forces || []).length) + '개</strong></span>'
        + '  <span>인원 <strong>' + esc(members.length) + '명</strong></span>'
        + '</div>';
    }
    const forceCount = groups.reduce((sum, item) => sum + (item.forces || []).length, 0);
    const memberCount = groups.reduce((sum, item) => sum + groupMembers(item).length, 0);
    return '<div class="sanctuary-editor-summary-name"><span>선택 성역</span><strong>' + esc(info.sanctuaryName || info.shortName || currentSanctuaryId()) + '</strong></div>'
      + '<div class="sanctuary-editor-summary-metrics">'
      + '  <span>운영 팀 <strong>' + esc(groups.length) + '개</strong></span>'
      + '  <span>포스 <strong>' + esc(forceCount) + '개</strong></span>'
      + '  <span>총 인원 <strong>' + esc(memberCount) + '명</strong></span>'
      + '</div>';
  }

  function renderSelection(){
    const modal = ensureModal();
    const source = sourceData();
    const summary = modal.querySelector('#sanctuaryEditorSummary');
    const body = modal.querySelector('#sanctuaryEditorBody');
    const description = modal.querySelector('#sanctuaryEditorDescription');
    const options = state.groups.map(group =>
      '<option value="' + esc(group.teamGroupNo) + '">' + esc(group.teamGroupName) + ' (' + esc(group.teamGroupNo) + '팀)</option>'
    ).join('');
    const names = allMemberNames().map(name => '<option value="' + esc(name) + '"></option>').join('');

    state.selectedTeamNo = null;
    state.nameEditorOpen = false;
    state.leaderEditorOpen = false;
    description.textContent = '캐릭터 이름 또는 팀 목록으로 수정할 한 팀을 선택합니다.';
    summary.innerHTML = renderSummary(source, state.groups, null);
    body.innerHTML = state.groups.length
      ? '<section class="sanctuary-editor-picker">'
        + '<div class="sanctuary-editor-step"><span>1</span><div><strong>수정할 팀 선택</strong><p>현재 성역의 전체 팀을 한꺼번에 펼치지 않고, 선택한 팀 하나만 불러옵니다.</p></div></div>'
        + '<div class="sanctuary-editor-picker-grid">'
        + '  <label class="sanctuary-editor-picker-field"><span>캐릭터 이름으로 찾기</span><div><input id="sanctuaryEditorCharacterInput" list="sanctuaryEditorCharacterNames" autocomplete="off" placeholder="캐릭터 이름 입력"><button type="button" data-editor-action="choose-character">소속 팀 정보 수정하기</button></div><datalist id="sanctuaryEditorCharacterNames">' + names + '</datalist></label>'
        + '  <div class="sanctuary-editor-picker-divider"><span>또는</span></div>'
        + '  <label class="sanctuary-editor-picker-field"><span>팀 목록에서 선택</span><div><select id="sanctuaryEditorTeamSelect"><option value="">팀을 선택해 주세요</option>' + options + '</select><button type="button" data-editor-action="choose-team">확인</button></div></label>'
        + '</div>'
        + '<aside class="sanctuary-editor-guide"><strong>수정 범위</strong><span>Manager 이상은 팀 이름을 수정할 수 있습니다.</span><span>Sub Master 이상은 해당 팀의 본캐만 대표로 임명할 수 있습니다.</span><span>MASTER 시트의 캐릭터명·직업·전투력·본캐명은 읽기 전용입니다.</span></aside>'
        + '</section>'
      : '<div class="empty-main">수정할 운영 팀 데이터가 없습니다.</div>';
    setStatus('', '');
    requestAnimationFrame(() => document.getElementById('sanctuaryEditorCharacterInput')?.focus());
  }

  function renderNamePanel(group){
    const isManual = group.nameMode === 'manual';
    const editor = state.nameEditorOpen
      ? '<div class="sanctuary-editor-inline-editor">'
        + '<input id="sanctuaryEditorTeamNameInput" maxlength="12" size="12" value="' + esc(group.teamGroupName) + '" aria-label="새 팀 이름">'
        + '<button class="sanctuary-editor-confirm-btn" type="button" data-editor-action="save-name">변경</button>'
        + '<button class="sanctuary-editor-cancel-btn" type="button" data-editor-action="close-name">닫기</button>'
        + (isManual ? '<button class="sanctuary-editor-auto-btn" type="button" data-editor-action="use-auto-name">자동 이름 사용</button>' : '')
        + '<small>최대 12자</small>'
        + '</div>'
      : '';
    return '<section class="sanctuary-editor-setting-panel">'
      + '<div class="sanctuary-editor-setting-head"><div><span>현재 팀 이름</span><strong>' + esc(group.teamGroupName) + '</strong><small>' + (isManual ? '사용자 지정 이름' : '자동 생성 이름') + '</small></div>'
      + '<button type="button" data-editor-action="open-name">변경하기</button></div>'
      + editor
      + '</section>';
  }

  function renderLeaderPanel(group){
    const leader = String(group.leaderCharacter || '').trim();
    const mainMembers = groupMembers(group).filter(member => member.isMain);
    let editor = '';
    if(state.leaderEditorOpen){
      editor = '<div class="sanctuary-editor-leader-editor">'
        + '<div class="sanctuary-editor-leader-editor-title"><strong>대표로 임명할 본캐 선택</strong><span>본캐로 확인된 캐릭터만 표시됩니다.</span></div>'
        + (mainMembers.length
          ? '<div class="sanctuary-editor-leader-grid">' + mainMembers.map(member =>
              '<button class="sanctuary-editor-leader-card' + (normalizedName(member.name) === normalizedName(leader) ? ' is-current' : '') + '" type="button" data-editor-action="assign-leader" data-character-name="' + esc(member.name) + '">'
              + '<span class="sanctuary-editor-leader-name">' + esc(member.name) + '</span>'
              + '<span>' + esc(member.className || '직업 미확인') + ' · ' + esc(member.forceNo) + '포스 ' + esc(member.partyNo) + '파티</span>'
              + '<em>' + (normalizedName(member.name) === normalizedName(leader) ? '현재 대표' : '임명') + '</em>'
              + '</button>'
            ).join('') + '</div>'
          : '<div class="sanctuary-editor-empty-inline">이 팀에서 본캐로 확인된 캐릭터가 없습니다.</div>')
        + '<div class="sanctuary-editor-leader-actions">'
        + (leader ? '<button class="sanctuary-editor-cancel-btn" type="button" data-editor-action="release-leader">대표 해제</button>' : '')
        + '<button class="sanctuary-editor-muted-btn" type="button" data-editor-action="close-leader">목록 닫기</button>'
        + '</div></div>';
    }
    return '<section class="sanctuary-editor-setting-panel">'
      + '<div class="sanctuary-editor-setting-head"><div><span>현재 대표자</span><strong>' + esc(leader || '대표자 미설정') + '</strong><small>' + (leader ? '팀 대표 권한 적용 중' : '임명된 대표자가 없습니다.') + '</small></div>'
      + (canAssignLeader() ? '<button type="button" data-editor-action="open-leader">' + (leader ? '대표 변경' : '대표 임명') + '</button>' : '<span class="sanctuary-editor-permission-note">Sub Master 이상</span>')
      + '</div>' + editor + '</section>';
  }

  function renderMemberCard(slot){
    const name = String(slot?.name || '').trim();
    if(!name) return '';
    const className = String(slot.className || '').trim();
    return '<div class="sanctuary-editor-member-card' + (slot.isMain === true ? ' is-main' : '') + '">'
      + '<strong>' + esc(name) + '</strong>'
      + '<span>' + esc(className || '직업 미확인') + '</span>'
      + (slot.isMain === true ? '<em>본캐</em>' : '')
      + '</div>';
  }

  function renderParty(party, index){
    const cards = (party?.slots || []).map(renderMemberCard).filter(Boolean).join('');
    return '<section class="sanctuary-editor-roster-party">'
      + '<header><strong>' + esc(Number(party?.partyNo || index + 1)) + '파티</strong><span>' + esc((party?.slots || []).filter(slot => String(slot?.name || '').trim()).length) + '명</span></header>'
      + '<div class="sanctuary-editor-member-grid">' + (cards || '<div class="sanctuary-editor-empty-inline">등록 인원 없음</div>') + '</div>'
      + '</section>';
  }

  function renderForce(force, index){
    const parties = Array.isArray(force?.parties) ? force.parties : [];
    return '<article class="sanctuary-editor-roster-force">'
      + '<header><div><strong>' + esc(forceNo(force,index)) + '포스</strong><span>' + esc(parties.length || 2) + '파티</span></div></header>'
      + '<div class="sanctuary-editor-roster-parties">' + (parties.length ? parties.map(renderParty).join('') : '<div class="sanctuary-editor-empty-inline">등록된 파티가 없습니다.</div>') + '</div>'
      + '</article>';
  }

  function renderTeamDetail(){
    const modal = ensureModal();
    const source = sourceData();
    const group = selectedGroup();
    if(!group){ renderSelection(); return; }
    const summary = modal.querySelector('#sanctuaryEditorSummary');
    const body = modal.querySelector('#sanctuaryEditorBody');
    const description = modal.querySelector('#sanctuaryEditorDescription');
    description.textContent = '선택한 팀의 이름·대표자만 수정하며 MASTER 편성은 읽기 전용입니다.';
    summary.innerHTML = renderSummary(source, state.groups, group);
    body.innerHTML = '<section class="sanctuary-editor-detail">'
      + '<div class="sanctuary-editor-detail-nav"><button type="button" data-editor-action="back-to-picker">← 다른 팀 선택</button><span>2단계 · 선택 팀 정보</span></div>'
      + '<div class="sanctuary-editor-settings">' + renderNamePanel(group) + renderLeaderPanel(group) + '</div>'
      + '<details class="sanctuary-editor-roster">'
      + '<summary><span><strong>MASTER 시트 편성 상세 보기</strong><small>포스와 파티별 캐릭터 카드</small></span></summary>'
      + '<div class="sanctuary-editor-roster-list">' + ((group.forces || []).length ? group.forces.map(renderForce).join('') : '<div class="empty-main">등록된 포스가 없습니다.</div>') + '</div>'
      + '</details></section>';
  }

  function chooseTeam(teamNo){
    const group = state.groups.find(item => Number(item.teamGroupNo) === Number(teamNo));
    if(!group){
      setStatus('수정할 팀을 선택해 주세요.', 'error');
      return;
    }
    state.selectedTeamNo = group.teamGroupNo;
    state.nameEditorOpen = false;
    state.leaderEditorOpen = false;
    setStatus('', '');
    renderTeamDetail();
  }

  function chooseByCharacter(){
    const input = document.getElementById('sanctuaryEditorCharacterInput');
    const query = normalizedName(input?.value);
    if(!query){
      setStatus('캐릭터 이름을 입력해 주세요.', 'error');
      input?.focus();
      return;
    }
    const matches = state.groups.filter(group => groupMembers(group).some(member => normalizedName(member.name) === query));
    if(matches.length === 0){
      setStatus('현재 성역 편성에서 해당 캐릭터를 찾을 수 없습니다.', 'error');
      input?.focus();
      return;
    }
    if(matches.length > 1){
      setStatus('같은 이름이 여러 팀에 있습니다. 팀 목록에서 직접 선택해 주세요.', 'error');
      return;
    }
    chooseTeam(matches[0].teamGroupNo);
  }

  async function saveTeamMeta(group, changes, successMessage){
    if(state.busy) return;
    const nextNameMode = changes.nameMode ?? group.nameMode;
    const nextTeamName = nextNameMode === 'manual'
      ? String(changes.teamName ?? group.teamGroupName ?? '').trim()
      : '';
    const nextLeader = String(changes.leaderCharacter ?? group.leaderCharacter ?? '').trim();

    if(nextNameMode === 'manual' && !nextTeamName){
      setStatus('새 팀 이름을 입력해 주세요.', 'error');
      return;
    }
    if(nextNameMode === 'manual' && nextTeamName.length > 12){
      setStatus('팀 이름은 최대 12자까지 입력할 수 있습니다.', 'error');
      return;
    }
    try{
      if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');
      setBusy(true);
      setStatus('Server Engine 저장 중...', 'pending');
      const result = await window.KinojoApi.postAction('sanctuaryAdmin', {
        command:'saveTeamMeta',
        sessionToken:token(),
        sanctuaryId:currentSanctuaryId(),
        updates:[],
        teamMeta:[{
          teamGroupNo:Number(group.teamGroupNo),
          teamName:nextTeamName,
          nameMode:nextNameMode,
          leaderCharacter:nextLeader
        }]
      });
      if(!result.ok) throw new Error(result.message || '성역 운영 팀 저장 실패');

      group.nameMode = nextNameMode;
      group.teamGroupName = nextNameMode === 'manual' ? nextTeamName : (group.autoTeamName || group.teamGroupName);
      group.leaderCharacter = nextLeader;
      state.nameEditorOpen = false;
      state.leaderEditorOpen = false;
      try{ sessionStorage.removeItem('kinojo_sanctuary_cache_v2026071301_' + currentSanctuaryId()); }catch(_err){}
      await reloadFresh(true, false);
      setStatus(successMessage, 'success');
    }catch(err){
      setStatus(err.message || String(err), 'error');
    }finally{
      setBusy(false);
    }
  }

  async function handleAction(action){
    if(state.busy) return;
    const command = action.dataset.editorAction;
    const group = selectedGroup();
    if(command === 'choose-character'){ chooseByCharacter(); return; }
    if(command === 'choose-team'){ chooseTeam(document.getElementById('sanctuaryEditorTeamSelect')?.value); return; }
    if(command === 'back-to-picker'){ renderSelection(); return; }
    if(!group) return;

    if(command === 'open-name'){
      state.nameEditorOpen = true;
      renderTeamDetail();
      requestAnimationFrame(() => {
        const input = document.getElementById('sanctuaryEditorTeamNameInput');
        input?.focus();
        input?.select();
      });
      return;
    }
    if(command === 'close-name'){
      state.nameEditorOpen = false;
      renderTeamDetail();
      return;
    }
    if(command === 'save-name'){
      const value = String(document.getElementById('sanctuaryEditorTeamNameInput')?.value || '').trim();
      await saveTeamMeta(group, {nameMode:'manual',teamName:value}, '팀 이름을 변경했습니다.');
      return;
    }
    if(command === 'use-auto-name'){
      await saveTeamMeta(group, {nameMode:'auto',teamName:''}, '자동 팀 이름으로 변경했습니다.');
      return;
    }
    if(command === 'open-leader'){
      state.leaderEditorOpen = true;
      renderTeamDetail();
      return;
    }
    if(command === 'close-leader'){
      state.leaderEditorOpen = false;
      renderTeamDetail();
      return;
    }
    if(command === 'assign-leader'){
      await saveTeamMeta(group, {leaderCharacter:String(action.dataset.characterName || '')}, '팀 대표자를 임명했습니다.');
      return;
    }
    if(command === 'release-leader'){
      await saveTeamMeta(group, {leaderCharacter:''}, '팀 대표자를 해제했습니다.');
    }
  }

  function open(){
    const modal = ensureModal();
    const source = sourceData();
    if(!token() || !canEditTeamInfo()){
      toast('성역 팀 정보 수정은 Manager 이상만 사용할 수 있습니다.');
      return;
    }
    if(!source){
      toast('성역 데이터를 먼저 불러와야 합니다.');
      return;
    }
    state.groups = normalizeTeamGroups(source);
    renderSelection();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sanctuary-editor-open');
  }

  function close(){
    const modal = document.getElementById('sanctuaryEditorModal');
    if(!modal || state.busy) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sanctuary-editor-open');
    state.selectedTeamNo = null;
    state.nameEditorOpen = false;
    state.leaderEditorOpen = false;
    setStatus('', '');
  }

  async function reloadFresh(keepSelection, showPending){
    const selectedNo = keepSelection ? state.selectedTeamNo : null;
    try{
      if(showPending !== false) setStatus('최신 성역 정보를 불러오는 중...', 'pending');
      if(typeof fetchSanctuaryFresh === 'function' && typeof applySanctuaryData === 'function'){
        const fresh = await fetchSanctuaryFresh();
        applySanctuaryData(fresh);
        state.groups = normalizeTeamGroups(fresh);
        state.selectedTeamNo = selectedNo;
        if(selectedNo && selectedGroup()) renderTeamDetail();
        else renderSelection();
        if(showPending !== false) setStatus('최신 정보를 불러왔습니다.', 'success');
        return;
      }
    }catch(err){
      if(showPending !== false) setStatus(err.message || '새로고침에 실패했습니다.', 'error');
      return;
    }
    location.reload();
  }

  function updateEditButtonAccess(){
    const btn = document.getElementById('editModeBtn');
    if(btn) btn.hidden = !canEditTeamInfo();
  }

  function bind(){
    const btn = document.getElementById('editModeBtn');
    if(btn && !btn.dataset.sanctuaryEditorBound){
      btn.dataset.sanctuaryEditorBound = '1';
      btn.textContent = '성역 정보 수정';
      btn.addEventListener('click', event => {
        event.preventDefault();
        open();
      });
    }
    updateEditButtonAccess();
    window.addEventListener('kinojo:auth-changed', updateEditButtonAccess);
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape') close();
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.KinojoSanctuaryEditor = { open, close, bind, reload:reloadFresh };
})();

/*
 * Sanctuary roster membership editor v313 (web route remains v312)
 * - Force-scoped lease/heartbeat
 * - Server-side character search
 * - PLAYNC official candidate lookup
 * - Pointer Events MOVE / SWAP Draft with multi-force lease groups
 */
(function(){
  'use strict';

  const ROSTER_POWER_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png';
  const QUICK_SCOPES=['WAITLIST','LEGION','ALL'];
  const QUICK_SCOPE_LABELS={WAITLIST:'대기자',LEGION:'레기온',ALL:'전체'};

  const rosterState={
    editor:null,
    editors:{},
    baselineSlots:{},
    draftSlots:{},
    primaryTeamNo:0,
    viewTeamNo:0,
    anchorEditSessionId:'',
    editGroupId:'',
    groupLeases:[],
    forceOptions:[],
    previewSlots:{},
    targetErrors:{},
    selectedSlot:null,
    moveMenuSource:'',
    panel:'existing',
    searchResults:[],
    mainResults:[],
    officialResult:null,
    raceId:null,
    relationType:'',
    selectedMain:null,
    busy:false,
    leaseLost:false,
    heartbeatTimer:0,
    drag:null,
    dragTimer:0,
    dragGhost:null,
    dragTarget:null,
    dragForceTimer:0,
    suppressClickUntil:0,
    openButton:null,
    changed:false,
    quickMode:false,
    quickPoint:null,
    quickActiveRow:'',
    quickResults:[],
    quickScope:'ALL',
    quickName:'',
    quickClass:''
  };

  function html(value){
    return String(value??'')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function accountSources(){
    const auth=window.KinojoAuth||window.KinojoAuthSessionCore||{};
    return [auth.getAccount?.(),auth.getSession?.()].filter(Boolean);
  }

  function permissionList(){
    const values=[];
    accountSources().forEach(source=>{
      const raw=source.permissions;
      if(Array.isArray(raw))values.push(...raw);
      else if(typeof raw==='string')values.push(...raw.split(/[\s,|]+/));
    });
    return values.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean);
  }

  function sessionLevel(){
    let level=0;
    accountSources().forEach(source=>{
      level=Math.max(level,Number(source.level||0));
      const role=String(source.role||source.roleLabel||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
      level=Math.max(level,role==='MASTER'?5:role==='SUB_MASTER'?4:role==='MANAGER'||role==='ADMIN'?3:role==='STAFF'?2:role==='MEMBER'?1:0);
    });
    return level;
  }

  function canManageRoster(){
    const permissions=permissionList();
    return sessionLevel()>=3||permissions.includes('all')||permissions.includes('sanctuary_roster_manage_all')||permissions.includes('sanctuary_roster_manage_assigned');
  }

  function currentEditor(){return rosterState.editors[rosterState.viewTeamNo]||rosterState.editor||{};}
  function currentLease(){return currentEditor().lease||{};}
  function currentForce(){return currentEditor().force||{};}
  function anchorSessionId(){return rosterState.anchorEditSessionId||currentLease().editSessionId||'';}
  function slotKey(teamNo,partyNo,slotNo){return [Number(teamNo),Number(partyNo),Number(slotNo)].join(':');}
  function emptySlot(teamNo,partyNo,slotNo){return {teamNo:Number(teamNo),partyNo:Number(partyNo),slotNo:Number(slotNo),characterMasterId:null,name:''};}
  function cloneSlot(slot,teamNo,partyNo,slotNo){
    return Object.assign({},slot||{}, {teamNo:Number(teamNo),partyNo:Number(partyNo),slotNo:Number(slotNo),characterMasterId:Number(slot?.characterMasterId||0)||null});
  }
  function registerEditor(editor,{replaceAll=false}={}){
    const teamNo=Number(editor?.force?.teamNo||0);
    if(!teamNo)return;
    if(replaceAll){rosterState.editors={};rosterState.baselineSlots={};rosterState.draftSlots={};}
    rosterState.editors[teamNo]=editor;
    for(let partyNo=1;partyNo<=2;partyNo++)for(let slotNo=1;slotNo<=5;slotNo++){
      const key=slotKey(teamNo,partyNo,slotNo);
      const found=(editor.force.slots||[]).find(slot=>Number(slot.partyNo)===partyNo&&Number(slot.slotNo)===slotNo);
      const preview=rosterState.previewSlots[key]||{};
      const slot=found?cloneSlot(Object.assign({},preview,found),teamNo,partyNo,slotNo):emptySlot(teamNo,partyNo,slotNo);
      rosterState.baselineSlots[key]=cloneSlot(slot,teamNo,partyNo,slotNo);
      rosterState.draftSlots[key]=cloneSlot(slot,teamNo,partyNo,slotNo);
    }
  }
  function draftSlot(teamNo,partyNo,slotNo){return rosterState.draftSlots[slotKey(teamNo,partyNo,slotNo)]||emptySlot(teamNo,partyNo,slotNo);}
  function draftChanges(){
    return Object.keys(rosterState.draftSlots).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).flatMap(key=>{
      const before=rosterState.baselineSlots[key];
      const after=rosterState.draftSlots[key];
      if(!before||Number(before.characterMasterId||0)===Number(after.characterMasterId||0))return [];
      return [{teamNo:Number(after.teamNo),partyNo:Number(after.partyNo),slotNo:Number(after.slotNo),expectedCharacterMasterId:Number(before.characterMasterId||0)||null,newCharacterMasterId:Number(after.characterMasterId||0)||null}];
    });
  }
  function hasDraft(){return draftChanges().length>0;}
  function collectForceOptions(){
    const seen=new Set();
    rosterState.previewSlots={};
    return Array.from(document.querySelectorAll('.force-card[data-team-no]')).map(card=>{
      const group=card.closest('.san-team-group');
      const teamNo=Number(card.dataset.teamNo||0);
      const slots=[];
      card.querySelectorAll('.party-card[data-party-no]').forEach(party=>{
        const partyNo=Number(party.dataset.partyNo||0);
        Array.from(party.querySelectorAll('.slot-grid > .char-card, .slot-grid > .empty-slot')).slice(0,5).forEach((node,index)=>{
          const slotNo=index+1;
          const occupied=node.classList.contains('char-card');
          const slot=occupied?{
            teamNo,partyNo,slotNo,
            characterMasterId:Number(node.dataset.characterId||0)||null,
            name:String(node.dataset.charName||''),
            className:String(node.dataset.charClass||''),
            serverName:String(node.dataset.serverName||''),
            isMain:node.dataset.isMain==='true',
            mainCharacterName:String(node.dataset.charOwner||''),
            pvePower:String(node.dataset.pvePower||node.dataset.charPower||''),
            classIconUrl:String(node.dataset.classIcon||'')
          }:emptySlot(teamNo,partyNo,slotNo);
          slots.push(slot);rosterState.previewSlots[slotKey(teamNo,partyNo,slotNo)]=slot;
        });
      });
      return {teamNo,teamGroupNo:Number(card.dataset.teamGroupNo||group?.dataset.teamGroup||0),forceName:String(card.dataset.forceName||card.querySelector('.team-name>span')?.textContent||teamNo+'포스').trim(),sanctuaryId:String(card.dataset.sanctuaryId||'').trim().toLowerCase(),slots};
    }).filter(item=>item.teamNo&&!seen.has(item.teamNo)&&seen.add(item.teamNo));
  }

  async function rosterAction(command,extra={}){
    if(!window.KinojoApi)throw new Error('Server Engine 연결을 확인해 주세요.');
    return window.KinojoApi.postAction('sanctuaryRoster',Object.assign({},extra,{command}));
  }

  function setInlineNotice(button,message,type='error'){
    const force=button?.closest?.('.force-card');
    if(!force)return;
    let notice=force.querySelector('.sanctuary-roster-lock-notice');
    if(!message){notice?.remove();return;}
    if(!notice){notice=document.createElement('div');force.querySelector('.team-head')?.after(notice);}
    notice.className='sanctuary-roster-lock-notice '+type;
    notice.textContent=message;
  }

  function refreshRosterButtons(){
    const visible=canManageRoster();
    document.querySelectorAll('[data-sanctuary-roster-edit]').forEach(button=>{
      button.hidden=true;
      button.setAttribute('aria-hidden','true');
    });
    const forceEdit=document.getElementById('forceEditBtn');
    if(forceEdit){forceEdit.hidden=!visible;forceEdit.setAttribute('aria-hidden',visible?'false':'true');}
    document.querySelectorAll('[data-sanctuary-quick-add]').forEach(button=>{
      button.disabled=!visible;
      button.classList.toggle('is-quick-add-enabled',visible);
      button.setAttribute('aria-hidden',visible?'false':'true');
    });
  }

  function ensureRosterModal(){
    let modal=document.getElementById('sanctuaryRosterEditorModal');
    if(modal)return modal;
    modal=document.createElement('section');
    modal.id='sanctuaryRosterEditorModal';
    modal.className='sanctuary-roster-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=''
      +'<div class="sanctuary-roster-card" role="dialog" aria-modal="true" aria-labelledby="sanctuaryRosterTitle">'
      +'  <header class="sanctuary-roster-head"><div><div class="tip-kicker">FORCE PARTY MEMBERS</div><h2 id="sanctuaryRosterTitle">포스 편집하기</h2><p id="sanctuaryRosterDescription">포스 편집 정보를 불러오는 중...</p></div><button type="button" class="sanctuary-roster-close" aria-label="닫기">×</button></header>'
      +'  <div class="sanctuary-roster-lease" id="sanctuaryRosterLease" aria-live="polite"></div>'
      +'  <nav class="sanctuary-roster-force-nav" id="sanctuaryRosterForceNav" aria-label="이동 대상 포스"></nav>'
      +'  <div class="sanctuary-roster-content" id="sanctuaryRosterContent"></div>'
      +'  <footer class="sanctuary-roster-foot"><span id="sanctuaryRosterStatus" aria-live="polite"></span><strong id="sanctuaryRosterDraftCount" hidden>변경사항 0건</strong><button type="button" class="edit-btn sanctuary-roster-draft-save" data-roster-action="save-draft" hidden>저장</button><button type="button" class="edit-btn" data-roster-action="cancel-draft" hidden>취소</button><button type="button" class="edit-btn" data-roster-action="refresh">최신 정보</button><button type="button" class="edit-btn" data-roster-action="close">닫기</button></footer>'
      +'</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{
      if(Date.now()<rosterState.suppressClickUntil){event.preventDefault();event.stopPropagation();return;}
      if(event.target===modal){closeRoster();return;}
      const action=event.target.closest('[data-roster-action]');
      if(action)handleRosterAction(action);
    });
    modal.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&event.target?.id==='sanctuaryRosterSearchInput'){
        event.preventDefault();searchExisting(false);
      }
      if(event.key==='Enter'&&event.target?.id==='sanctuaryRosterOfficialName'){
        event.preventDefault();lookupOfficial();
      }
      if(event.key==='Enter'&&event.target?.id==='sanctuaryRosterMainSearch'){
        event.preventDefault();searchExisting(true);
      }
      if((event.key==='Enter'||event.key===' ')&&event.target?.matches?.('[data-roster-draggable]')){
        event.preventDefault();openMoveMenu(event.target.dataset.slotKey);
      }
    });
    modal.querySelector('.sanctuary-roster-close')?.addEventListener('click',closeRoster);
    bindPointerDrag(modal);
    return modal;
  }

  function setRosterStatus(message,type=''){
    const target=document.getElementById('sanctuaryRosterStatus');
    if(!target)return;
    target.className=type;
    target.textContent=message||'';
  }

  function setRosterBusy(busy,message){
    rosterState.busy=busy===true;
    const modal=document.getElementById('sanctuaryRosterEditorModal');
    modal?.classList.toggle('is-busy',rosterState.busy);
    modal?.querySelectorAll('button,input,select').forEach(control=>{
      if(control.classList.contains('sanctuary-roster-close'))return;
      control.disabled=rosterState.busy||rosterState.leaseLost;
    });
    if(message)setRosterStatus(message,'pending');
  }

  function formatLocation(location){
    if(!location)return '';
    const group=Number(location.teamGroupNo||0);
    const force=Number(location.forceNo||(Number(location.teamNo||0)>=100?Number(location.teamNo)%100:location.teamNo)||0);
    return (group?group+'팀 · ':'')+(force?force+'포스 · ':'')+Number(location.partyNo||0)+'파티 '+Number(location.slotNo||0)+'번';
  }

  function leaseText(){
    const lease=currentLease();
    const expiry=Date.parse(lease.expiresAt||'');
    const seconds=Number.isFinite(expiry)?Math.max(0,Math.ceil((expiry-Date.now())/1000)):Number(lease.ttlSeconds||75);
    return rosterState.leaseLost
      ? '편집 권한이 만료되었습니다. 최신 포스 정보를 다시 불러와 주세요.'
      : (rosterState.editGroupId?'이동 대상 '+Math.max(2,rosterState.groupLeases.length)+'개 포스 잠금 유지 중':'포스 편집 잠금 유지 중')+' · 약 '+seconds+'초 안에 자동 갱신';
  }

  function slotByPosition(partyNo,slotNo){
    return draftSlot(rosterState.viewTeamNo,partyNo,slotNo);
  }

  function displaySlot(teamNo,partyNo,slotNo){
    return rosterState.draftSlots[slotKey(teamNo,partyNo,slotNo)]||rosterState.previewSlots[slotKey(teamNo,partyNo,slotNo)]||emptySlot(teamNo,partyNo,slotNo);
  }

  function rosterPowerValue(slot){
    return slot?.pvePower||slot?.pve_power||slot?.latestPveCombatPower||slot?.latest_pve_combat_power||slot?.power||'';
  }

  function rosterPowerShort(value){
    const helper=window.KinojoPowerFormat||{};
    if(typeof helper.short==='function')return helper.short(value);
    const number=Number(String(value??'').replace(/[^0-9.-]/g,''));
    if(!Number.isFinite(number)||number<=0)return '전투력 미확인';
    return number>=1000?(number/1000).toFixed(1)+'K':Math.round(number).toLocaleString('ko-KR');
  }

  function rosterPowerFull(value){
    const helper=window.KinojoPowerFormat||{};
    if(typeof helper.full==='function')return helper.full(value);
    const number=Number(String(value??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(number)&&number>0?Math.round(number).toLocaleString('ko-KR'):'전투력 미확인';
  }

  function rosterClassIcon(slot){
    return String(slot?.classIconUrl||slot?.class_icon_url||slot?.classIcon||'').trim()
      ||String(window.KinojoCharacterReaction?.classIconFor?.(slot?.className)||'').trim()
      ||String(window.KinojoCharacterProfileImage?.classIconFor?.(slot?.className)||'').trim();
  }

  function slotMarkup(slot){
    const occupied=!!String(slot.name||'').trim();
    const key=slotKey(slot.teamNo,slot.partyNo,slot.slotNo);
    const common=' data-roster-slot data-slot-key="'+html(key)+'" data-team-no="'+html(slot.teamNo)+'" data-party-no="'+html(slot.partyNo)+'" data-slot-no="'+html(slot.slotNo)+'"';
    if(!occupied){
      return '<div class="sanctuary-roster-slot is-empty"'+common+'><span aria-hidden="true">+</span><strong>'+html(slot.slotNo)+'번 빈 슬롯</strong></div>';
    }
    const isMain=slot.isMain===true;
    const relation=isMain?'본캐':(slot.mainCharacterName?'부캐 · '+slot.mainCharacterName:'부캐 · 본캐 미확인');
    const icon=rosterClassIcon(slot);
    const power=rosterPowerValue(slot);
    const powerShort=rosterPowerShort(power);
    const powerFull=rosterPowerFull(power);
    return '<article class="sanctuary-roster-slot is-filled'+(slot.isTeamLeader===true?' is-team-leader':'')+'" tabindex="0" role="group" aria-label="'+html(slot.slotNo)+'번 '+html(slot.name)+' 길게 눌러 이동, 키보드는 Enter" data-roster-draggable data-character-id="'+html(slot.characterMasterId||'')+'"'+common+'>'
      +'<span class="sanctuary-roster-class-icon" aria-hidden="true">'+(icon?'<img src="'+html(icon)+'" alt="" loading="lazy" decoding="async">':'<span>'+html(String(slot.className||'?').slice(0,1))+'</span>')+'</span>'
      +'<div class="sanctuary-roster-slot-copy"><div class="sanctuary-roster-slot-identity"><strong>'+html(slot.name)+'</strong><span class="sanctuary-roster-relation-badge '+(isMain?'is-main':'is-sub')+'" title="'+html(relation)+'">'+html(relation)+'</span></div>'
      +'<div class="sanctuary-roster-slot-meta"><span>'+html(slot.serverName||'서버 미확인')+'</span><span class="sanctuary-roster-power" title="정확한 전투력 '+html(powerFull)+'"><img src="'+ROSTER_POWER_ICON_URL+'" alt="" aria-hidden="true"><strong>'+html(powerShort)+'</strong></span></div></div>'
      +'</article>';
  }

  function partyMarkup(partyNo,teamNo){
    const slots=Array.from({length:5},(_,index)=>displaySlot(teamNo,partyNo,index+1));
    const filled=slots.filter(slot=>String(slot.name||'').trim()).length;
    return '<section class="sanctuary-roster-party"><header><strong>'+partyNo+'파티</strong><span>'+filled+' / 5</span></header><div>'+slots.map(slotMarkup).join('')+'</div></section>';
  }

  function forceGridMarkup(){
    return '<div class="sanctuary-roster-force-grid">'+rosterState.forceOptions.map(option=>{
      const loaded=!!rosterState.editors[option.teamNo];
      const active=Number(option.teamNo)===Number(rosterState.viewTeamNo);
      const failure=rosterState.targetErrors[option.teamNo];
      return '<article class="sanctuary-roster-force-card'+(loaded?' is-loaded':'')+(active?' is-active':'')+(failure?' is-blocked':'')+'" data-roster-force-card data-team-no="'+html(option.teamNo)+'">'
        +'<header><div><small>'+(option.teamGroupNo?html(option.teamGroupNo)+'팀':'운영팀')+'</small><strong>'+html(option.forceName)+'</strong></div>'
        +'<button type="button" data-roster-action="view-force" data-target-team-no="'+html(option.teamNo)+'">'+(loaded?'편집 준비됨':failure?'잠금 확인':'편집 준비')+'</button></header>'
        +(failure?'<p class="sanctuary-roster-force-error">'+html(failure)+'</p>':'')
        +'<div class="sanctuary-roster-parties">'+partyMarkup(1,option.teamNo)+partyMarkup(2,option.teamNo)+'</div></article>';
    }).join('')+'</div>';
  }

  function renderForceNav(){
    const target=document.getElementById('sanctuaryRosterForceNav');
    if(!target)return;
    const groups=new Map();
    rosterState.forceOptions.forEach(option=>{
      const group=Number(option.teamGroupNo||0);
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(option);
    });
    target.innerHTML=Array.from(groups.entries()).map(([group,options])=>'<div class="sanctuary-roster-force-group"><span>'+(group?html(group)+'팀':'포스')+'</span><div>'+options.map(option=>{
      const current=Number(option.teamNo)===Number(rosterState.viewTeamNo);
      const loaded=!!rosterState.editors[option.teamNo];
      const failure=rosterState.targetErrors[option.teamNo];
      return '<button type="button" class="'+(current?'is-active ':'')+(loaded?'is-loaded ':'')+(failure?'is-blocked':'')+'" data-roster-action="view-force" data-target-team-no="'+html(option.teamNo)+'" '+(current?'aria-current="true"':'')+' title="'+html(failure||option.forceName)+'">'+html(option.forceName)+(loaded&&!current?' ✓':'')+'</button>';
    }).join('')+'</div></div>').join('');
  }

  function moveMenuMarkup(){
    const source=rosterState.draftSlots[rosterState.moveMenuSource];
    if(!source||!source.characterMasterId)return '';
    const destinations=Object.keys(rosterState.draftSlots).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).filter(key=>key!==rosterState.moveMenuSource);
    return '<section class="sanctuary-roster-move-menu" aria-label="'+html(source.name)+' 이동 위치 선택"><header><div><span>키보드 이동</span><strong>'+html(source.name)+'의 목적지 선택</strong></div><button type="button" data-roster-action="close-move-menu">닫기</button></header><div>'+destinations.map(key=>{
      const target=rosterState.draftSlots[key];
      const option=rosterState.forceOptions.find(item=>Number(item.teamNo)===Number(target.teamNo));
      const label=(option?.teamGroupNo?option.teamGroupNo+'팀 · ':'')+(option?.forceName||target.teamNo+'포스')+' · '+target.partyNo+'파티 '+target.slotNo+'번';
      return '<button type="button" data-roster-action="move-to" data-slot-key="'+html(key)+'"><span>'+html(label)+'</span><strong>'+html(target.name||'빈 슬롯')+'</strong></button>';
    }).join('')+'</div><p>다른 포스는 위 포스 탭에서 먼저 열면 목적지 목록에 추가됩니다.</p></section>';
  }

  function classOptions(){
    return (currentEditor().classOptions||[]).map(value=>'<option value="'+html(value)+'">'+html(value)+'</option>').join('');
  }

  function existingResultMarkup(item,index,mainOnly=false){
    const location=item.rosterLocation||item.roster_location;
    const assigned=item.alreadyAssigned===true||item.already_assigned===true;
    const addExisting=item.addExistingAllowed===true||item.add_existing_allowed===true;
    const addNew=item.addNewAllowed===true||item.add_new_allowed===true;
    const canAdd=addExisting||addNew;
    const relation=item.isMain===true?'본캐':'부캐 · '+String(item.mainCharacterName||'본캐 미확인');
    const action=mainOnly
      ? '<button type="button" data-roster-action="choose-main" data-result-index="'+index+'">본캐 선택</button>'
      : (canAdd?'<button type="button" data-roster-action="add-search-result" data-result-index="'+index+'" data-operation="'+(addExisting?'ADD_EXISTING':'ADD_NEW')+'">추가</button>':'<button type="button" disabled>추가 불가</button>');
    return '<article class="sanctuary-roster-search-result'+(assigned?' is-assigned':'')+'"><div><strong>'+html(item.characterName||item.character_name)+'</strong><span>'+html(item.className||item.class_name||'직업 미확인')+' · '+html(item.serverName||item.server_name||'서버 미확인')+'</span><small>'+html(relation)+'</small>'+(assigned?'<em>현재 '+html(formatLocation(location))+'에 편성되어 있습니다.</em>':'')+'</div>'+action+'</article>';
  }

  function existingPanelMarkup(){
    const selected=rosterState.selectedSlot;
    const results=rosterState.searchResults.length
      ? '<div class="sanctuary-roster-results">'+rosterState.searchResults.map((item,index)=>existingResultMarkup(item,index,false)).join('')+'</div>'
      : '<div class="sanctuary-roster-panel-empty">이름 2자 이상 또는 클래스를 선택해 조회해 주세요.</div>';
    return '<section class="sanctuary-roster-add-panel"><header><div><span>선택 슬롯</span><strong>'+html(selected.partyNo)+'파티 '+html(selected.slotNo)+'번</strong></div><button type="button" data-roster-action="close-add">패널 닫기</button></header>'
      +'<div class="sanctuary-roster-panel-tabs"><button type="button" class="'+(rosterState.panel==='existing'?'is-active':'')+'" data-roster-action="show-existing">기존 캐릭터</button><button type="button" class="'+(rosterState.panel==='new'?'is-active':'')+'" data-roster-action="show-new">신규 인원 추가</button></div>'
      +'<div class="sanctuary-roster-search-controls"><input id="sanctuaryRosterSearchInput" autocomplete="off" placeholder="캐릭터 이름 2자 이상"><select id="sanctuaryRosterClassSelect"><option value="">전체 클래스</option>'+classOptions()+'</select><button type="button" data-roster-action="search">조회</button></div>'
      +results+'</section>';
  }

  function serverOptions(){
    if(!rosterState.raceId)return '<option value="">종족을 먼저 선택해 주세요</option>';
    return '<option value="">서버 선택</option>'+(currentEditor().activeServers||[])
      .filter(server=>Number(server.raceId)===Number(rosterState.raceId))
      .map(server=>'<option value="'+html(server.serverId)+'">'+html(server.serverName)+'</option>').join('');
  }

  function officialResultMarkup(){
    const result=rosterState.officialResult;
    if(!result)return '';
    const character=result.character||{};
    if(result.alreadyRegistered===true){
      const assigned=character.alreadyAssigned===true;
      const operation=character.addExistingAllowed===true?'ADD_EXISTING':character.addNewAllowed===true?'ADD_NEW':'';
      return '<div class="sanctuary-roster-official-result is-existing"><strong>이미 KINOJO에 등록된 캐릭터입니다.</strong><span>'+html(character.characterName)+' · '+html(character.className||'직업 미확인')+' · '+html(character.serverName||'')+'</span>'
        +(assigned?'<em>현재 '+html(formatLocation(character.rosterLocation))+'에 편성되어 있습니다.</em>':'')
        +(operation?'<button type="button" data-roster-action="add-official-existing" data-operation="'+operation+'">선택 슬롯에 추가</button>':'<button type="button" disabled>추가 불가</button>')+'</div>';
    }
    const relationButtons='<div class="sanctuary-roster-relation"><strong>캐릭터 관계 선택</strong><div><button type="button" class="'+(rosterState.relationType==='MAIN'?'is-active':'')+'" data-roster-action="relation-main">본캐</button><button type="button" class="'+(rosterState.relationType==='ALT'?'is-active':'')+'" data-roster-action="relation-alt">부캐</button></div></div>';
    const mainPicker=rosterState.relationType==='ALT'
      ? '<div class="sanctuary-roster-main-picker"><div><input id="sanctuaryRosterMainSearch" autocomplete="off" placeholder="연결할 기존 본캐 이름"><button type="button" data-roster-action="search-main">본캐 조회</button></div>'
        +(rosterState.selectedMain?'<div class="sanctuary-roster-selected-main">선택 본캐 <strong>'+html(rosterState.selectedMain.characterName)+'</strong><button type="button" data-roster-action="clear-main">변경</button></div>':'<div class="sanctuary-roster-results">'+rosterState.mainResults.map((item,index)=>existingResultMarkup(item,index,true)).join('')+'</div>')+'</div>'
      : '';
    const ready=rosterState.relationType==='MAIN'||(rosterState.relationType==='ALT'&&rosterState.selectedMain);
    return '<div class="sanctuary-roster-official-result"><strong>✓ 캐릭터가 확인되었습니다.</strong><span>'+html(character.characterName)+' · '+html(character.className)+' · '+html(character.serverName)+' · '+(Number(character.raceId)===1?'천족':'마족')+'</span>'+relationButtons+mainPicker+'<div class="sanctuary-roster-official-actions"><button type="button" data-roster-action="add-official" '+(ready?'':'disabled')+'>선택 슬롯에 추가</button><button type="button" data-roster-action="reset-official">초기화</button></div></div>';
  }

  function newPanelMarkup(){
    const selected=rosterState.selectedSlot;
    return '<section class="sanctuary-roster-add-panel"><header><div><span>선택 슬롯</span><strong>'+html(selected.partyNo)+'파티 '+html(selected.slotNo)+'번</strong></div><button type="button" data-roster-action="close-add">패널 닫기</button></header>'
      +'<div class="sanctuary-roster-panel-tabs"><button type="button" data-roster-action="show-existing">기존 캐릭터</button><button type="button" class="is-active" data-roster-action="show-new">신규 인원 추가</button></div>'
      +'<div class="sanctuary-roster-official-form"><div class="sanctuary-roster-race"><button type="button" class="'+(rosterState.raceId===1?'is-active':'')+'" data-roster-action="race" data-race-id="1">천족</button><button type="button" class="'+(rosterState.raceId===2?'is-active':'')+'" data-roster-action="race" data-race-id="2">마족</button></div><select id="sanctuaryRosterServerSelect">'+serverOptions()+'</select><div><input id="sanctuaryRosterOfficialName" autocomplete="off" placeholder="캐릭터 이름"><button type="button" data-roster-action="official-lookup">공식 조회</button></div></div>'
      +officialResultMarkup()+'</section>';
  }

  function renderRoster(){
    const modal=ensureRosterModal();
    const lease=document.getElementById('sanctuaryRosterLease');
    const content=document.getElementById('sanctuaryRosterContent');
    document.getElementById('sanctuaryRosterTitle').textContent='포스 편집하기';
    document.getElementById('sanctuaryRosterDescription').textContent='캐릭터를 길게 눌러 들어 올린 뒤 빈 슬롯으로 이동하거나 다른 캐릭터와 맞교환하고 저장하세요.';
    lease.className='sanctuary-roster-lease'+(rosterState.leaseLost?' is-lost':'');
    lease.textContent=leaseText();
    const nav=document.getElementById('sanctuaryRosterForceNav');if(nav)nav.innerHTML='';
    const changes=draftChanges();
    const count=document.getElementById('sanctuaryRosterDraftCount');
    if(count){count.hidden=!changes.length;count.textContent='변경사항 '+changes.length+'건';}
    modal.querySelector('[data-roster-action="save-draft"]')?.toggleAttribute('hidden',!changes.length);
    modal.querySelector('[data-roster-action="cancel-draft"]')?.toggleAttribute('hidden',!changes.length&&!rosterState.editGroupId);
    content.innerHTML='<div class="sanctuary-roster-layout">'+forceGridMarkup()+moveMenuMarkup()+'</div>';
    modal.querySelectorAll('button,input,select').forEach(control=>{
      if(control.classList.contains('sanctuary-roster-close'))return;
      if(rosterState.busy||rosterState.leaseLost)control.disabled=true;
    });
  }

  function resetAddPanel(){
    rosterState.searchResults=[];
    rosterState.mainResults=[];
    rosterState.officialResult=null;
    rosterState.raceId=null;
    rosterState.relationType='';
    rosterState.selectedMain=null;
  }

  function adoptPrimaryEditor(editor,{replaceAll=true}={}){
    const teamNo=Number(editor?.force?.teamNo||0);
    rosterState.editor=editor;
    registerEditor(editor,{replaceAll});
    rosterState.primaryTeamNo=teamNo;
    rosterState.viewTeamNo=teamNo;
    rosterState.anchorEditSessionId=String(editor?.lease?.editSessionId||'');
    rosterState.editGroupId='';
    rosterState.groupLeases=[];
    rosterState.targetErrors={};
    rosterState.moveMenuSource='';
  }

  function openMoveMenu(key){
    const source=rosterState.draftSlots[key];
    if(!source?.characterMasterId)return;
    rosterState.selectedSlot=null;
    resetAddPanel();
    rosterState.moveMenuSource=key;
    renderRoster();
    requestAnimationFrame(()=>document.querySelector('.sanctuary-roster-move-menu [data-roster-action="move-to"]')?.focus());
  }

  function moveDraft(sourceKey,targetKey){
    const source=rosterState.draftSlots[sourceKey];
    const target=rosterState.draftSlots[targetKey];
    if(!source?.characterMasterId||!target||sourceKey===targetKey){setRosterStatus('이동할 수 없는 위치여서 원래 자리로 돌아왔습니다.','error');return false;}
    if(hasRelationshipConflict(sourceKey,targetKey)){
      setRosterStatus('이동할 포스에 같은 본캐·부캐 관계의 캐릭터가 있어 이동할 수 없습니다.','error');
      return false;
    }
    const sourceName=source.name||'캐릭터';
    const targetName=target.name||'';
    rosterState.draftSlots[sourceKey]=cloneSlot(target,source.teamNo,source.partyNo,source.slotNo);
    rosterState.draftSlots[targetKey]=cloneSlot(source,target.teamNo,target.partyNo,target.slotNo);
    rosterState.selectedSlot=null;
    rosterState.moveMenuSource='';
    resetAddPanel();
    renderRoster();
    setRosterStatus(targetName?sourceName+' ↔ '+targetName+' 맞교환을 Draft에 담았습니다.':sourceName+' 이동을 Draft에 담았습니다.','success');
    return true;
  }

  async function openDraftTarget(teamNo,{fromDrag=false}={}){
    teamNo=Number(teamNo||0);
    if(!teamNo||rosterState.busy||rosterState.leaseLost)return false;
    if(rosterState.editors[teamNo]){
      rosterState.viewTeamNo=teamNo;
      rosterState.selectedSlot=null;
      rosterState.moveMenuSource=fromDrag?rosterState.moveMenuSource:'';
      resetAddPanel();renderRoster();
      setRosterStatus('이동 대상 포스로 전환했습니다.','success');
      return true;
    }
    try{
      setRosterBusy(true,'대상 포스의 편집 가능 여부를 확인하는 중...');
      const result=await rosterAction('TARGET_OPEN',{editSessionId:anchorSessionId(),targetTeamNo:teamNo});
      if(!result?.editor)throw Object.assign(new Error(result?.message||'대상 포스를 열지 못했습니다.'),{data:result});
      registerEditor(result.editor);
      rosterState.editGroupId=String(result.editGroupId||'');
      rosterState.groupLeases=Array.isArray(result.leases)?result.leases:[];
      rosterState.targetErrors[teamNo]='';
      rosterState.viewTeamNo=teamNo;
      rosterState.selectedSlot=null;
      resetAddPanel();
      setRosterStatus('대상 포스를 잠그고 이동 준비를 마쳤습니다.','success');
      return true;
    }catch(error){
      const message=error?.data?.message||error.message||'다른 사용자가 편집 중인 포스입니다.';
      rosterState.targetErrors[teamNo]=message;
      setRosterStatus(message,'error');
      return false;
    }finally{setRosterBusy(false);renderRoster();}
  }

  async function saveDraft(){
    const changes=draftChanges();
    if(!changes.length||rosterState.busy||rosterState.leaseLost)return;
    try{
      setRosterBusy(true,'Draft '+changes.length+'건을 Server와 Google Sheet에 한 번에 저장하는 중...');
      const result=await rosterAction('DRAFT_SAVE',{editSessionId:anchorSessionId(),slotChanges:changes,requestKey:'web-draft-v313-'+(crypto.randomUUID?.()||Date.now())});
      rosterState.changed=true;
      if(result.editClosed===true||!result.editor){
        Object.keys(rosterState.draftSlots).forEach(key=>{const slot=rosterState.draftSlots[key];rosterState.baselineSlots[key]=cloneSlot(slot,slot.teamNo,slot.partyNo,slot.slotNo);});
        rosterState.editGroupId='';rosterState.groupLeases=[];
        rosterState.leaseLost=true;stopHeartbeat();
        setRosterStatus(result.message||'Draft를 저장했습니다. 편집 세션은 종료되었습니다.','success');
        await refreshSanctuaryPageData();
        window.setTimeout(closeRoster,900);
        return;
      }
      adoptPrimaryEditor(result.editor);
      rosterState.selectedSlot=null;resetAddPanel();startHeartbeat();
      setRosterStatus(result.message||changes.length+'개 슬롯 변경을 저장했습니다.','success');
      await refreshSanctuaryPageData();
    }catch(error){
      const code=String(error?.code||error?.data?.code||'');
      if(/LEASE|EXPIRED|STALE/.test(code)){rosterState.leaseLost=true;stopHeartbeat();}
      setRosterStatus(error.message||'Draft 저장에 실패했습니다. 화면의 Draft는 유지됩니다.','error');
    }finally{setRosterBusy(false);renderRoster();}
  }

  async function cancelDraft(){
    if(rosterState.busy||rosterState.leaseLost)return;
    if(!rosterState.editGroupId){
      Object.keys(rosterState.baselineSlots).forEach(key=>{const slot=rosterState.baselineSlots[key];rosterState.draftSlots[key]=cloneSlot(slot,slot.teamNo,slot.partyNo,slot.slotNo);});
      rosterState.moveMenuSource='';renderRoster();setRosterStatus('Draft 변경을 취소했습니다.','');return;
    }
    try{
      setRosterBusy(true,'대상 포스 잠금을 정리하고 Draft를 취소하는 중...');
      const result=await rosterAction('DRAFT_RESET',{editSessionId:anchorSessionId()});
      if(result.editClosed===true){
        Object.keys(rosterState.baselineSlots).forEach(key=>{const slot=rosterState.baselineSlots[key];rosterState.draftSlots[key]=cloneSlot(slot,slot.teamNo,slot.partyNo,slot.slotNo);});
        rosterState.editGroupId='';rosterState.groupLeases=[];rosterState.leaseLost=true;stopHeartbeat();setRosterStatus(result.message||'Draft를 취소하고 편집을 종료했습니다.','success');return;
      }
      const editor=result.editor||result;
      if(!editor?.force)throw new Error('초기 포스 정보를 다시 불러오지 못했습니다.');
      adoptPrimaryEditor(editor);
      resetAddPanel();startHeartbeat();
      setRosterStatus('Draft 변경과 대상 포스 잠금을 취소했습니다.','success');
    }catch(error){setRosterStatus(error.message||'Draft 취소에 실패했습니다.','error');}
    finally{setRosterBusy(false);renderRoster();}
  }

  function overlapRatio(one,two){
    const left=Math.max(one.left,two.left),right=Math.min(one.right,two.right),top=Math.max(one.top,two.top),bottom=Math.min(one.bottom,two.bottom);
    const area=Math.max(0,right-left)*Math.max(0,bottom-top);
    return area/Math.max(1,Math.min(one.width*one.height,two.width*two.height));
  }

  function clearDragForceTimer(){
    if(rosterState.dragForceTimer)window.clearTimeout(rosterState.dragForceTimer);
    rosterState.dragForceTimer=0;
    if(rosterState.drag)rosterState.drag.dwellTeamNo=0;
  }

  function positionDragGhost(x,y){
    const ghost=rosterState.dragGhost;
    if(!ghost)return;
    ghost.style.left=(x-ghost.offsetWidth/2)+'px';
    ghost.style.top=(y-Math.min(40,ghost.offsetHeight/2))+'px';
  }

  function relationshipKey(slot){
    if(!slot?.characterMasterId)return '';
    const value=slot.isMain===true?slot.name:slot.mainCharacterName;
    return String(value||'').trim().toLocaleLowerCase().replace(/\s+/g,'');
  }

  function hasRelationshipConflict(sourceKey,targetKey){
    const source=rosterState.draftSlots[sourceKey];
    const target=rosterState.draftSlots[targetKey];
    if(!source||!target)return false;
    const occupiedRelations=Object.entries(Object.assign({},rosterState.previewSlots,rosterState.draftSlots));
    const conflicts=(teamNo,relation)=>relation&&occupiedRelations.some(([key,slot])=>{
      if(Number(slot.teamNo)!==Number(teamNo)||key===sourceKey||key===targetKey)return false;
      return relationshipKey(slot)===relation;
    });
    return conflicts(target.teamNo,relationshipKey(source))||(target.characterMasterId&&conflicts(source.teamNo,relationshipKey(target)));
  }

  function hasForceRelationshipConflict(sourceKey,targetTeamNo,ignoredTargetKey=''){
    const source=rosterState.draftSlots[sourceKey];
    const relation=relationshipKey(source);
    if(!source||!relation||!targetTeamNo)return false;
    return Object.entries(Object.assign({},rosterState.previewSlots,rosterState.draftSlots)).some(([key,slot])=>{
      if(key===sourceKey||key===ignoredTargetKey||Number(slot.teamNo)!==Number(targetTeamNo))return false;
      return relationshipKey(slot)===relation;
    });
  }

  function clearRelationshipWarnings(){
    document.querySelectorAll('.sanctuary-roster-force-card.is-owner-conflict,.sanctuary-roster-slot.is-owner-conflict').forEach(node=>node.classList.remove('is-owner-conflict'));
  }

  async function preparePointerDrag(x,y){
    const drag=rosterState.drag;
    if(!drag||drag.active||drag.preparing)return;
    drag.preparing=true;
    const teamNo=Number(String(drag.sourceKey||'').split(':')[0]||0);
    if(!rosterState.editors[teamNo]){
      const opened=await openDraftTarget(teamNo,{fromDrag:true});
      if(!opened||!rosterState.drag){cleanupPointerDrag(true);return;}
    }
    if(rosterState.drag){rosterState.drag.preparing=false;beginPointerDrag(rosterState.drag.lastX||x,rosterState.drag.lastY||y);}
  }

  function beginPointerDrag(x,y){
    const drag=rosterState.drag;
    if(!drag||drag.active)return;
    const source=document.querySelector('[data-roster-draggable][data-slot-key="'+CSS.escape(drag.sourceKey)+'"]');
    if(!source)return;
    drag.active=true;
    rosterState.suppressClickUntil=Date.now()+500;
    const ghost=source.cloneNode(true);
    ghost.querySelectorAll('button').forEach(button=>button.remove());
    ghost.removeAttribute('tabindex');ghost.removeAttribute('data-roster-draggable');
    ghost.className+=' sanctuary-roster-drag-ghost';
    ghost.style.width=Math.min(source.getBoundingClientRect().width,360)+'px';
    document.body.appendChild(ghost);
    rosterState.dragGhost=ghost;
    source.classList.add('is-drag-source');
    ensureRosterModal().classList.add('is-dragging');
    positionDragGhost(x,y);
    if(drag.pointerType==='touch'&&navigator.vibrate)navigator.vibrate(18);
    setRosterStatus('빈 슬롯에 놓으면 이동, 캐릭터 위에 놓으면 맞교환됩니다.','pending');
  }

  function updateDragTarget(x,y){
    const drag=rosterState.drag;
    if(!drag?.active)return;
    positionDragGhost(x,y);
    const under=document.elementFromPoint(x,y);
    const candidate=under?.closest?.('[data-roster-slot]');
    const forceCard=under?.closest?.('[data-roster-force-card]');
    const dwellTeamNo=Number(candidate?.dataset.teamNo||forceCard?.dataset.teamNo||0);
    if(dwellTeamNo&&!rosterState.editors[dwellTeamNo]){
      if(drag.dwellTeamNo!==dwellTeamNo){
        clearDragForceTimer();drag.dwellTeamNo=dwellTeamNo;
        rosterState.dragForceTimer=window.setTimeout(async()=>{
          rosterState.dragForceTimer=0;
          await openDraftTarget(dwellTeamNo,{fromDrag:true});
          if(rosterState.drag)rosterState.drag.dwellTeamNo=0;
        },420);
      }
    }else clearDragForceTimer();
    const content=document.getElementById('sanctuaryRosterContent');
    const contentRect=content?.getBoundingClientRect();
    if(content&&contentRect){
      const edge=70;
      if(y<contentRect.top+edge)content.scrollTop-=Math.ceil((contentRect.top+edge-y)/7);
      else if(y>contentRect.bottom-edge)content.scrollTop+=Math.ceil((y-(contentRect.bottom-edge))/7);
    }
    const targetKey=candidate?.dataset.slotKey||'';
    const targetLoaded=candidate&&!!rosterState.draftSlots[targetKey];
    const valid=targetLoaded&&targetKey!==drag.sourceKey&&rosterState.dragGhost&&overlapRatio(rosterState.dragGhost.getBoundingClientRect(),candidate.getBoundingClientRect())>=.42;
    drag.blockedByRelationship=false;
    rosterState.dragTarget?.classList.remove('is-drop-target','is-swap-target','is-owner-conflict');
    rosterState.dragTarget=null;clearRelationshipWarnings();
    if(forceCard&&hasForceRelationshipConflict(drag.sourceKey,dwellTeamNo,valid?targetKey:'')){
      drag.blockedByRelationship=true;
      forceCard.classList.add('is-owner-conflict');
      if(valid)candidate.classList.add('is-owner-conflict');
      setRosterStatus('같은 본캐·부캐 관계가 이미 이 포스에 있어 다른 자리로 옮길 수 없습니다.','error');
      return;
    }
    if(valid){
      if(hasRelationshipConflict(drag.sourceKey,targetKey)){
        drag.blockedByRelationship=true;
        candidate.classList.add('is-owner-conflict');
        candidate.closest('[data-roster-force-card]')?.classList.add('is-owner-conflict');
        setRosterStatus('같은 본캐·부캐 관계가 이미 이 포스에 있어 다른 자리로 옮길 수 없습니다.','error');
        return;
      }
      rosterState.dragTarget=candidate;
      candidate.classList.add(candidate.classList.contains('is-empty')?'is-drop-target':'is-swap-target');
    }
  }

  function cleanupPointerDrag(returned=false){
    if(rosterState.dragTimer)window.clearTimeout(rosterState.dragTimer);
    rosterState.dragTimer=0;clearDragForceTimer();
    rosterState.dragTarget?.classList.remove('is-drop-target','is-swap-target');
    clearRelationshipWarnings();
    document.querySelectorAll('.is-drag-source').forEach(node=>node.classList.toggle('is-returning',returned));
    rosterState.dragGhost?.remove();
    rosterState.dragGhost=null;rosterState.dragTarget=null;rosterState.drag=null;
    ensureRosterModal().classList.remove('is-dragging');
    if(returned)window.setTimeout(()=>document.querySelectorAll('.is-returning').forEach(node=>node.classList.remove('is-returning')),220);
  }

  function bindPointerDrag(modal){
    if(modal.dataset.rosterPointerBound)return;
    modal.dataset.rosterPointerBound='1';
    modal.addEventListener('pointerdown',event=>{
      const source=event.target.closest?.('[data-roster-draggable]');
      if(!source||event.target.closest('button')||rosterState.busy||rosterState.leaseLost||event.button>0)return;
      rosterState.drag={pointerId:event.pointerId,pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,sourceKey:source.dataset.slotKey,active:false,preparing:false,dwellTeamNo:0};
      rosterState.dragTimer=window.setTimeout(()=>preparePointerDrag(event.clientX,event.clientY),260);
    });
    document.addEventListener('pointermove',event=>{
      const drag=rosterState.drag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      drag.lastX=event.clientX;drag.lastY=event.clientY;
      const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
      if(!drag.active){
        if(distance>10&&!drag.preparing){cleanupPointerDrag();return;}
      }
      if(drag.active){event.preventDefault();updateDragTarget(event.clientX,event.clientY);}
    },{passive:false});
    const finish=event=>{
      const drag=rosterState.drag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      const active=drag.active;
      const sourceKey=drag.sourceKey;
      const targetKey=rosterState.dragTarget?.dataset.slotKey||'';
      const blockedByRelationship=drag.blockedByRelationship===true;
      cleanupPointerDrag(active&&!targetKey);
      if(active){
        rosterState.suppressClickUntil=Date.now()+500;
        if(targetKey)moveDraft(sourceKey,targetKey);
        else if(blockedByRelationship)setRosterStatus('같은 본캐·부캐 관계가 이미 이 포스에 있어 원래 자리로 돌아왔습니다.','error');
        else setRosterStatus('유효한 슬롯에 놓이지 않아 원래 자리로 돌아왔습니다.','');
      }
    };
    document.addEventListener('pointerup',finish);
    document.addEventListener('pointercancel',finish);
  }

  function ensureQuickPopover(){
    let popover=document.getElementById('sanctuaryQuickAddPopover');
    if(popover)return popover;
    popover=document.createElement('section');
    popover.id='sanctuaryQuickAddPopover';
    popover.className='sanctuary-quick-add';
    popover.setAttribute('aria-hidden','true');
    popover.innerHTML='<div class="sanctuary-quick-add-card" role="dialog" aria-modal="false" aria-labelledby="sanctuaryQuickAddTitle">'
      +'<header><div><small>QUICK PARTY ADD</small><strong id="sanctuaryQuickAddTitle">캐릭터 간편 추가</strong></div><button type="button" data-quick-action="close" aria-label="닫기">×</button></header>'
      +'<div id="sanctuaryQuickAddBody"></div><footer id="sanctuaryQuickAddStatus" aria-live="polite"></footer></div>';
    document.body.appendChild(popover);
    popover.addEventListener('pointerdown',event=>{
      const row=event.target.closest?.('[data-quick-row]');
      if(row&&row.classList.contains('is-disabled')){activateQuickRow(row.dataset.quickRow);event.preventDefault();}
    },true);
    popover.addEventListener('click',event=>{
      const action=event.target.closest?.('[data-quick-action]');
      if(action)handleQuickAction(action);
    });
    popover.addEventListener('input',event=>{
      if(event.target.id==='sanctuaryQuickScope'){
        updateQuickScopeSlider(event.target,Number(event.target.value));
        return;
      }
      if(event.target.id==='sanctuaryQuickName')rosterState.quickName=event.target.value;
      const row=event.target.closest?.('[data-quick-row]');if(row)activateQuickRow(row.dataset.quickRow);
    });
    popover.addEventListener('change',event=>{
      if(event.target.id==='sanctuaryQuickScope'){
        commitQuickScope(Number(event.target.value));
        return;
      }
      const row=event.target.closest?.('[data-quick-row]');if(row)activateQuickRow(row.dataset.quickRow);
      if(event.target.id==='sanctuaryQuickClass')rosterState.quickClass=event.target.value;
    });
    popover.addEventListener('keydown',event=>{
      if(event.target.id==='sanctuaryQuickScope'&&['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const current=quickScopeIndex();
        const next=event.key==='Home'?0:event.key==='End'?2:Math.max(0,Math.min(2,current+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)));
        commitQuickScope(next);
        return;
      }
      if(event.key==='Enter'&&event.target.id==='sanctuaryQuickName'){event.preventDefault();quickSearch('name');}
    });
    return popover;
  }

  function quickClassOptions(){
    return (currentEditor().classOptions||[]).map(value=>'<option value="'+html(value)+'">'+html(value)+'</option>').join('');
  }

  function quickScopeIndex(scope=rosterState.quickScope){
    const index=QUICK_SCOPES.indexOf(String(scope||'').toUpperCase());
    return index>=0?index:2;
  }

  function updateQuickScopeSlider(input,value){
    if(!input)return;
    const position=Math.max(0,Math.min(2,Number(value)||0));
    const nearest=Math.round(position);
    input.style.setProperty('--quick-scope-progress',(position*50)+'%');
    input.setAttribute('aria-valuetext',QUICK_SCOPE_LABELS[QUICK_SCOPES[nearest]]+' 검색');
    input.closest('[data-quick-scope-control]')?.querySelectorAll('[data-quick-scope]').forEach(button=>{
      button.classList.toggle('is-active',button.dataset.quickScope===QUICK_SCOPES[nearest]);
      button.setAttribute('aria-pressed',button.dataset.quickScope===QUICK_SCOPES[nearest]?'true':'false');
    });
  }

  function commitQuickScope(value,{announce=true}={}){
    const index=Math.max(0,Math.min(2,Math.round(Number(value)||0)));
    const next=QUICK_SCOPES[index];
    const changed=rosterState.quickScope!==next;
    rosterState.quickScope=next;
    if(changed)rosterState.quickResults=[];
    if(changed)renderQuickPopover();
    const input=document.getElementById('sanctuaryQuickScope');
    if(input){input.value=String(index);input.classList.add('is-snapping');updateQuickScopeSlider(input,index);window.setTimeout(()=>input.classList.remove('is-snapping'),180);}
    if(changed&&navigator.vibrate)navigator.vibrate(8);
    if(announce)setQuickStatus(QUICK_SCOPE_LABELS[next]+' 검색 범위를 선택했습니다.','');
    if(changed)requestAnimationFrame(positionQuickPopover);
  }

  function quickScopeMarkup(){
    const selected=quickScopeIndex();
    return '<section class="sanctuary-quick-scope" data-quick-scope-control aria-label="검색 범위">'
      +'<strong>검색 범위</strong><input id="sanctuaryQuickScope" type="range" min="0" max="2" step="0.01" value="'+selected+'" style="--quick-scope-progress:'+(selected*50)+'%" aria-label="검색 범위" aria-valuetext="'+QUICK_SCOPE_LABELS[QUICK_SCOPES[selected]]+' 검색">'
      +'<div>'+QUICK_SCOPES.map(scope=>'<button type="button" class="'+(rosterState.quickScope===scope?'is-active':'')+'" data-quick-action="scope" data-quick-scope="'+scope+'" aria-pressed="'+(rosterState.quickScope===scope?'true':'false')+'">'+QUICK_SCOPE_LABELS[scope]+'</button>').join('')+'</div></section>';
  }

  function quickResultAllowed(item){
    if(rosterState.quickScope==='LEGION'){
      const legion=item.isLegionMember===true||item.is_legion_member===true||item.legionMember===true||!!String(item.legionName||item.legion_name||'').trim();
      if(!legion)return false;
    }
    if(rosterState.quickScope==='WAITLIST'){
      const status=String(item.waitlistStatus||item.waitlist_status||item.registrationStatus||item.registration_status||'').toUpperCase();
      const candidates=typeof waitlistCandidates==='function'?waitlistCandidates():[];
      const candidateId=Number(item.characterMasterId||item.character_master_id||0);
      const candidateName=String(item.characterName||item.character_name||'').trim().toLocaleLowerCase();
      const localMatch=candidates.some(candidate=>Number(candidate.characterMasterId||0)===candidateId||(candidateName&&String(candidate.name||'').trim().toLocaleLowerCase()===candidateName));
      const waitlisted=item.isWaitlisted===true||item.is_waitlisted===true||item.waitlistEntryId||item.waitlist_entry_id||/WAIT|대기/.test(status)||localMatch;
      if(!waitlisted)return false;
    }
    return true;
  }

  function quickResultMarkup(item,index){
    const assigned=item.alreadyAssigned===true||item.already_assigned===true;
    const addExisting=item.addExistingAllowed===true||item.add_existing_allowed===true;
    const addNew=item.addNewAllowed===true||item.add_new_allowed===true;
    const relation=item.isMain===true?'본캐':(item.mainCharacterName?'부캐 · '+item.mainCharacterName:'관계 미확인');
    return '<article class="sanctuary-quick-result'+(assigned?' is-assigned':'')+'"><div><strong>'+html(item.characterName||item.character_name)+'</strong><span>'+html(item.className||item.class_name||'직업 미확인')+' · '+html(relation)+'</span></div>'
      +(addExisting||addNew?'<button type="button" data-quick-action="add" data-result-index="'+index+'" data-operation="'+(addExisting?'ADD_EXISTING':'ADD_NEW')+'">추가</button>':'<button type="button" disabled>추가 불가</button>')+'</article>';
  }

  function renderQuickPopover(){
    const popover=ensureQuickPopover();
    const selected=rosterState.selectedSlot||{};
    const body=document.getElementById('sanctuaryQuickAddBody');
    const nameDisabled=rosterState.quickActiveRow&&rosterState.quickActiveRow!=='name';
    const conditionDisabled=rosterState.quickActiveRow&&rosterState.quickActiveRow!=='condition';
    const results=rosterState.quickResults.length?'<div class="sanctuary-quick-results">'+rosterState.quickResults.map(quickResultMarkup).join('')+'</div>':'';
    body.innerHTML='<p class="sanctuary-quick-target">'+html(selected.forceName||'포스')+' · '+html(selected.partyNo)+'파티 '+html(selected.slotNo)+'번</p>'
      +'<div class="sanctuary-quick-controls">'+quickScopeMarkup()
      +'<div class="sanctuary-quick-row'+(nameDisabled?' is-disabled':'')+'" data-quick-row="name" aria-disabled="'+(nameDisabled?'true':'false')+'"><input id="sanctuaryQuickName" type="search" autocomplete="off" value="'+html(rosterState.quickName)+'" placeholder="캐릭터 이름" '+(nameDisabled?'disabled':'')+'><button type="button" data-quick-action="search-name" '+(nameDisabled?'disabled':'')+'>해당 캐릭터로 검색</button><button type="button" data-quick-action="reset-name">초기화</button></div>'
      +'<div class="sanctuary-quick-row'+(conditionDisabled?' is-disabled':'')+'" data-quick-row="condition" aria-disabled="'+(conditionDisabled?'true':'false')+'"><select id="sanctuaryQuickClass" '+(conditionDisabled?'disabled':'')+'><option value="">전체 클래스</option>'+quickClassOptions()+'</select><button type="button" data-quick-action="search-condition" '+(conditionDisabled?'disabled':'')+'>이 조건으로 검색</button><button type="button" data-quick-action="reset-condition">초기화</button></div></div>'+results;
    const classSelect=document.getElementById('sanctuaryQuickClass');if(classSelect)classSelect.value=rosterState.quickClass;
    popover.classList.toggle('is-busy',rosterState.busy);
  }

  function positionQuickPopover(){
    const popover=ensureQuickPopover();
    const card=popover.querySelector('.sanctuary-quick-add-card');
    const point=rosterState.quickPoint||{x:innerWidth/2,y:innerHeight/2};
    const gap=14,margin=10;
    let left=point.x+gap,top=point.y-18;
    const rect=card.getBoundingClientRect();
    if(left+rect.width>innerWidth-margin)left=Math.max(margin,point.x-rect.width-gap);
    top=Math.max(margin,Math.min(top,innerHeight-rect.height-margin));
    card.style.left=left+'px';card.style.top=top+'px';
  }

  function activateQuickRow(row){
    if(!['name','condition'].includes(row)||rosterState.quickActiveRow===row)return;
    rosterState.quickActiveRow=row;rosterState.quickResults=[];renderQuickPopover();
    requestAnimationFrame(()=>{positionQuickPopover();document.getElementById(row==='name'?'sanctuaryQuickName':'sanctuaryQuickClass')?.focus();});
  }

  function setQuickStatus(message,type=''){
    const status=document.getElementById('sanctuaryQuickAddStatus');if(!status)return;
    status.className=type;status.textContent=message||'';
  }

  function resetQuickRow(row){
    rosterState.quickResults=[];
    rosterState.quickScope='ALL';
    if(row==='name')rosterState.quickName='';
    if(row==='condition')rosterState.quickClass='';
    rosterState.quickActiveRow='';renderQuickPopover();setQuickStatus('');requestAnimationFrame(positionQuickPopover);
  }

  async function quickSearch(row){
    if(rosterState.busy||rosterState.leaseLost)return;
    activateQuickRow(row);
    const query=row==='name'?String(document.getElementById('sanctuaryQuickName')?.value||rosterState.quickName||'').trim():'';
    const className=row==='condition'?String(document.getElementById('sanctuaryQuickClass')?.value||rosterState.quickClass||'').trim():'';
    rosterState.quickName=query;rosterState.quickClass=className;
    if(row==='name'&&query.length<2){setQuickStatus('캐릭터 이름을 2자 이상 입력해 주세요.','error');return;}
    try{
      rosterState.busy=true;renderQuickPopover();setQuickStatus('Server에서 캐릭터를 검색하는 중...','pending');
      const result=await rosterAction('SEARCH',{editSessionId:currentLease().editSessionId,query:query||null,className:className||null,mainOnly:false,limit:30});
      rosterState.quickResults=(result.results||[]).filter(quickResultAllowed);
      renderQuickPopover();setQuickStatus(rosterState.quickResults.length+'명의 캐릭터를 찾았습니다.','success');
    }catch(error){rosterState.quickResults=[];renderQuickPopover();setQuickStatus(error.message||'캐릭터 검색에 실패했습니다.','error');}
    finally{rosterState.busy=false;renderQuickPopover();requestAnimationFrame(positionQuickPopover);}
  }

  async function quickAdd(action){
    const item=rosterState.quickResults[Number(action.dataset.resultIndex||-1)];
    const slot=rosterState.selectedSlot;
    if(!item||!slot||rosterState.busy)return;
    try{
      rosterState.busy=true;renderQuickPopover();setQuickStatus('Server와 Google Sheet에 반영하는 중...','pending');
      const result=await rosterAction('MUTATE',{editSessionId:currentLease().editSessionId,operation:String(action.dataset.operation||''),partyNo:slot.partyNo,slotNo:slot.slotNo,characterMasterId:Number(item.characterMasterId||item.character_master_id)});
      rosterState.changed=true;setQuickStatus(result.message||'성역 파티에 추가했습니다.','success');
      await refreshSanctuaryPageData();window.setTimeout(()=>closeQuickPopover({skipRelease:result.editClosed===true}),350);
    }catch(error){setQuickStatus(error.message||'캐릭터 추가에 실패했습니다.','error');}
    finally{rosterState.busy=false;renderQuickPopover();requestAnimationFrame(positionQuickPopover);}
  }

  function handleQuickAction(action){
    const command=action.dataset.quickAction;
    if(command==='close'){closeQuickPopover();return;}
    if(command==='scope'){commitQuickScope(quickScopeIndex(action.dataset.quickScope));return;}
    if(command==='search-name'){quickSearch('name');return;}
    if(command==='search-condition'){quickSearch('condition');return;}
    if(command==='reset-name'){resetQuickRow('name');return;}
    if(command==='reset-condition'){resetQuickRow('condition');return;}
    if(command==='add')quickAdd(action);
  }

  async function openQuickPopover(button,event){
    if(rosterState.busy||!canManageRoster())return;
    const force=button.closest('.force-card');
    const party=button.closest('.party-card');
    const sanctuaryId=String(force?.dataset.sanctuaryId||'').trim().toLowerCase();
    const teamNo=Number(force?.dataset.teamNo||0),partyNo=Number(party?.dataset.partyNo||0),slotNo=Number(button.dataset.slotNo||0);
    if(!sanctuaryId||!teamNo||!partyNo||!slotNo)return;
    button.disabled=true;button.classList.add('is-loading');
    try{
      const options=collectForceOptions();
      const editor=await rosterAction('OPEN',{sanctuaryId,teamNo});
      if(!editor?.ok)throw Object.assign(new Error(editor?.message||'간편 추가를 시작하지 못했습니다.'),{data:editor});
      adoptPrimaryEditor(editor);rosterState.forceOptions=options;
      rosterState.selectedSlot={teamNo,partyNo,slotNo,forceName:String(force.dataset.forceName||teamNo+'포스')};
      rosterState.quickMode=true;rosterState.quickPoint={x:event.clientX,y:event.clientY};rosterState.quickActiveRow='';rosterState.quickResults=[];rosterState.quickScope='ALL';rosterState.quickName='';rosterState.quickClass='';rosterState.leaseLost=false;rosterState.changed=false;
      const popover=ensureQuickPopover();renderQuickPopover();setQuickStatus('검색 조건을 선택해 주세요.','');
      popover.classList.add('open');popover.setAttribute('aria-hidden','false');startHeartbeat();
      requestAnimationFrame(()=>{positionQuickPopover();document.getElementById('sanctuaryQuickName')?.focus();});
    }catch(error){setInlineNotice(button,error?.data?.message||error.message||'간편 추가를 시작하지 못했습니다.');}
    finally{button.disabled=!canManageRoster();button.classList.remove('is-loading');}
  }

  async function closeQuickPopover({skipRelease=false}={}){
    const popover=document.getElementById('sanctuaryQuickAddPopover');
    if(!popover?.classList.contains('open'))return;
    stopHeartbeat();const editSessionId=anchorSessionId();const changed=rosterState.changed;
    popover.classList.remove('open');popover.setAttribute('aria-hidden','true');
    if(editSessionId&&!rosterState.leaseLost&&!skipRelease)rosterAction('RELEASE',{editSessionId,reason:'WEB_QUICK_ADD_CLOSED'}).catch(()=>{});
    rosterState.editor=null;rosterState.editors={};rosterState.baselineSlots={};rosterState.draftSlots={};rosterState.previewSlots={};rosterState.primaryTeamNo=0;rosterState.viewTeamNo=0;rosterState.anchorEditSessionId='';rosterState.editGroupId='';rosterState.groupLeases=[];rosterState.forceOptions=[];rosterState.targetErrors={};rosterState.selectedSlot=null;rosterState.quickMode=false;rosterState.quickPoint=null;rosterState.quickActiveRow='';rosterState.quickResults=[];rosterState.quickScope='ALL';rosterState.quickName='';rosterState.quickClass='';rosterState.busy=false;rosterState.changed=false;
    if(changed)refreshSanctuaryPageData();
  }

  async function openRoster(button){
    if(rosterState.busy||!canManageRoster())return;
    const options=collectForceOptions();
    const requested=Number(button.dataset.teamNo||0);
    const first=options.find(option=>Number(option.teamNo)===requested)||options[0]||{};
    const sanctuaryId=String(button.dataset.sanctuaryId||first.sanctuaryId||'').trim().toLowerCase();
    const teamNo=Number(requested||first.teamNo||0);
    if(!sanctuaryId||!teamNo)return;
    setInlineNotice(button,'','');
    button.disabled=true;
    button.classList.add('is-loading');
    try{
      const editor=await rosterAction('OPEN',{sanctuaryId,teamNo});
      if(!editor?.ok)throw Object.assign(new Error(editor?.message||'포스 편집을 시작하지 못했습니다.'),{data:editor});
      adoptPrimaryEditor(editor);
      rosterState.forceOptions=options;
      rosterState.selectedSlot=null;
      rosterState.panel='existing';
      rosterState.busy=false;
      rosterState.leaseLost=false;
      rosterState.openButton=button;
      rosterState.changed=false;
      rosterState.quickMode=false;
      resetAddPanel();
      const modal=ensureRosterModal();
      renderRoster();
      setRosterStatus('캐릭터를 길게 눌러 이동·맞교환한 뒤 변경사항을 저장해 주세요.','');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden','false');
      document.body.classList.add('sanctuary-roster-open');
      startHeartbeat();
    }catch(error){
      setInlineNotice(button,error?.data?.message||error.message||'포스 편집을 시작하지 못했습니다.');
    }finally{
      button.disabled=false;
      button.classList.remove('is-loading');
    }
  }

  async function heartbeat(){
    const editSessionId=anchorSessionId();
    if(!editSessionId||rosterState.busy||rosterState.leaseLost)return;
    try{
      const next=await rosterAction('HEARTBEAT',{editSessionId});
      if(next.editor&&!rosterState.editGroupId&&!hasDraft()){
        const savedView=rosterState.viewTeamNo;
        rosterState.editor=next.editor;
        registerEditor(next.editor);
        rosterState.viewTeamNo=savedView;
      }
      const expiresAt=next.expiresAt||next.lease?.expiresAt||currentLease().expiresAt;
      Object.values(rosterState.editors).forEach(editor=>{if(editor.lease)editor.lease.expiresAt=expiresAt;});
      const target=document.getElementById('sanctuaryRosterLease');
      if(target)target.textContent=leaseText();
    }catch(error){
      rosterState.leaseLost=true;
      stopHeartbeat();
      if(rosterState.quickMode){renderQuickPopover();setQuickStatus(error.message||'편집 권한이 만료되었습니다.','error');}
      else{renderRoster();setRosterStatus(error.message||'편집 권한이 만료되었습니다.','error');}
    }
  }

  function startHeartbeat(){
    stopHeartbeat();
    rosterState.heartbeatTimer=window.setInterval(heartbeat,25000);
  }
  function stopHeartbeat(){
    if(rosterState.heartbeatTimer)window.clearInterval(rosterState.heartbeatTimer);
    rosterState.heartbeatTimer=0;
  }

  async function closeRoster(){
    const modal=document.getElementById('sanctuaryRosterEditorModal');
    if(!modal||!modal.classList.contains('open'))return;
    if(hasDraft()&&!window.confirm('저장하지 않은 Draft 변경이 있습니다. 취소하고 닫으시겠습니까?'))return;
    stopHeartbeat();
    cleanupPointerDrag();
    const editSessionId=anchorSessionId();
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('sanctuary-roster-open');
    if(editSessionId&&!rosterState.leaseLost){
      rosterAction('RELEASE',{editSessionId,reason:'WEB_EDITOR_CLOSED'}).catch(()=>{});
    }
    const changed=rosterState.changed;
    rosterState.editor=null;
    rosterState.editors={};rosterState.baselineSlots={};rosterState.draftSlots={};rosterState.previewSlots={};
    rosterState.primaryTeamNo=0;rosterState.viewTeamNo=0;rosterState.anchorEditSessionId='';rosterState.editGroupId='';rosterState.groupLeases=[];rosterState.forceOptions=[];rosterState.targetErrors={};
    rosterState.selectedSlot=null;
    rosterState.openButton=null;
    resetAddPanel();
    if(changed)refreshSanctuaryPageData();
  }

  async function refreshSanctuaryPageData(){
    try{
      if(typeof fetchSanctuaryFresh==='function'&&typeof applySanctuaryData==='function'){
        const fresh=await fetchSanctuaryFresh();
        applySanctuaryData(fresh);
      }
    }catch(_error){}
  }

  async function refreshEditor(){
    const editSessionId=anchorSessionId();
    if(!editSessionId)return;
    setRosterStatus('최신 포스 정보를 확인하는 중...','pending');
    try{
      await heartbeat();
      if(rosterState.leaseLost)return;
      renderRoster();
      setRosterStatus('포스 편집 잠금을 유지하고 있습니다.','success');
    }catch(error){setRosterStatus(error.message||String(error),'error');}
  }

  async function searchExisting(mainOnly){
    if(rosterState.busy||rosterState.leaseLost)return;
    const input=document.getElementById(mainOnly?'sanctuaryRosterMainSearch':'sanctuaryRosterSearchInput');
    const query=String(input?.value||'').trim();
    const className=mainOnly?'':String(document.getElementById('sanctuaryRosterClassSelect')?.value||'').trim();
    if(query.length<2&&!className){setRosterStatus('이름 2자 이상 또는 클래스를 선택해 주세요.','error');input?.focus();return;}
    try{
      setRosterBusy(true,mainOnly?'연결할 본캐를 조회하는 중...':'Server에서 캐릭터를 조회하는 중...');
      const result=await rosterAction('SEARCH',{editSessionId:currentLease().editSessionId,query:query||null,className:className||null,mainOnly:mainOnly===true,limit:20});
      if(mainOnly)rosterState.mainResults=result.results||[];
      else rosterState.searchResults=result.results||[];
      setRosterStatus((result.resultCount||0)+'명의 캐릭터를 찾았습니다.','success');
    }catch(error){
      if(mainOnly)rosterState.mainResults=[];else rosterState.searchResults=[];
      setRosterStatus(error.message||'캐릭터 조회에 실패했습니다.','error');
    }finally{setRosterBusy(false);renderRoster();}
  }

  async function lookupOfficial(){
    if(rosterState.busy||rosterState.leaseLost)return;
    const serverId=Number(document.getElementById('sanctuaryRosterServerSelect')?.value||0);
    const characterName=String(document.getElementById('sanctuaryRosterOfficialName')?.value||'').trim();
    if(!rosterState.raceId){setRosterStatus('종족을 선택해 주세요.','error');return;}
    if(!serverId){setRosterStatus('서버를 선택해 주세요.','error');return;}
    if(characterName.length<2){setRosterStatus('캐릭터 이름을 2자 이상 입력해 주세요.','error');return;}
    try{
      setRosterBusy(true,'PLAYNC 공식 캐릭터를 조회하는 중...');
      rosterState.officialResult=await rosterAction('OFFICIAL_LOOKUP',{editSessionId:currentLease().editSessionId,raceId:rosterState.raceId,serverId,characterName});
      rosterState.relationType='';
      rosterState.selectedMain=null;
      rosterState.mainResults=[];
      setRosterStatus(rosterState.officialResult.message||'캐릭터가 공식 확인되었습니다.','success');
    }catch(error){
      rosterState.officialResult=null;
      const retry=Number(error?.data?.retryAfterSeconds||0);
      setRosterStatus((error.message||'공식 조회에 실패했습니다.')+(retry?' · 약 '+retry+'초 후 재시도':'') ,'error');
    }finally{setRosterBusy(false);renderRoster();}
  }

  async function runMutation(payload,successMessage){
    if(rosterState.busy||rosterState.leaseLost)return;
    if(hasDraft()||rosterState.editGroupId){setRosterStatus('이동 Draft를 저장하거나 취소한 뒤 구성원을 추가·제외해 주세요.','error');return;}
    try{
      setRosterBusy(true,'Server와 Google Sheet에 반영하는 중...');
      const result=await rosterAction('MUTATE',Object.assign({editSessionId:currentLease().editSessionId},payload));
      rosterState.changed=true;
      if(result.editClosed===true||!result.editor){
        rosterState.leaseLost=true;
        setRosterStatus(result.message||successMessage,'success');
        await refreshSanctuaryPageData();
        window.setTimeout(closeRoster,900);
        return;
      }
      adoptPrimaryEditor(result.editor);
      rosterState.selectedSlot=null;
      resetAddPanel();
      rosterState.leaseLost=false;
      startHeartbeat();
      setRosterStatus(result.message||successMessage,'success');
      await refreshSanctuaryPageData();
    }catch(error){
      const code=String(error?.code||error?.data?.code||'');
      if(/LEASE|EXPIRED|STALE/.test(code)){
        rosterState.leaseLost=true;
        stopHeartbeat();
      }
      setRosterStatus(error.message||'구성원 변경에 실패했습니다.','error');
    }finally{setRosterBusy(false);renderRoster();}
  }

  async function addSearchResult(action){
    const item=rosterState.searchResults[Number(action.dataset.resultIndex||-1)];
    const slot=rosterState.selectedSlot;
    if(!item||!slot)return;
    await runMutation({
      operation:String(action.dataset.operation||''),partyNo:slot.partyNo,slotNo:slot.slotNo,
      characterMasterId:Number(item.characterMasterId||item.character_master_id)
    },'성역 파티에 추가했습니다.');
  }

  async function addOfficialExisting(action){
    const character=rosterState.officialResult?.character||{};
    const slot=rosterState.selectedSlot;
    if(!character.characterMasterId||!slot)return;
    await runMutation({operation:String(action.dataset.operation||''),partyNo:slot.partyNo,slotNo:slot.slotNo,characterMasterId:Number(character.characterMasterId)},'성역 파티에 추가했습니다.');
  }

  async function addOfficial(){
    const result=rosterState.officialResult;
    const slot=rosterState.selectedSlot;
    if(!result?.candidateId||!slot||!rosterState.relationType)return;
    if(rosterState.relationType==='ALT'&&!rosterState.selectedMain){setRosterStatus('연결할 기존 본캐를 선택해 주세요.','error');return;}
    await runMutation({
      partyNo:slot.partyNo,slotNo:slot.slotNo,officialCandidateId:result.candidateId,
      relationType:rosterState.relationType,
      mainCharacterId:rosterState.relationType==='ALT'?Number(rosterState.selectedMain.characterMasterId||rosterState.selectedMain.character_master_id):null
    },'신규 캐릭터를 list와 성역 파티에 추가했습니다.');
  }

  async function removeMember(action){
    if(hasDraft()||rosterState.editGroupId){setRosterStatus('이동 Draft를 저장하거나 취소한 뒤 편성에서 제외해 주세요.','error');return;}
    const partyNo=Number(action.dataset.partyNo||0);
    const slotNo=Number(action.dataset.slotNo||0);
    const characterMasterId=Number(action.dataset.characterId||0);
    const characterName=String(action.dataset.characterName||'캐릭터');
    if(!characterMasterId||!window.confirm(characterName+'을 현재 성역 편성에서 제외하시겠습니까?'))return;
    await runMutation({operation:'REMOVE',partyNo,slotNo,expectedCharacterMasterId:characterMasterId},'성역 편성에서 제외했습니다.');
  }

  async function handleRosterAction(action){
    if(rosterState.busy)return;
    const command=action.dataset.rosterAction;
    if(command==='close'){closeRoster();return;}
    if(command==='refresh'){refreshEditor();return;}
    if(command==='save-draft'){saveDraft();return;}
    if(command==='cancel-draft'){cancelDraft();return;}
    if(command==='view-force'){openDraftTarget(Number(action.dataset.targetTeamNo));return;}
    if(command==='move-menu'){openMoveMenu(action.dataset.slotKey);return;}
    if(command==='close-move-menu'){rosterState.moveMenuSource='';renderRoster();return;}
    if(command==='move-to'){moveDraft(rosterState.moveMenuSource,action.dataset.slotKey);return;}
    if(command==='select-slot'){
      if(hasDraft()||rosterState.editGroupId){setRosterStatus('이동 Draft를 저장하거나 취소한 뒤 구성원을 추가해 주세요.','error');return;}
      rosterState.selectedSlot={partyNo:Number(action.dataset.partyNo),slotNo:Number(action.dataset.slotNo)};
      rosterState.panel='existing';resetAddPanel();renderRoster();
      requestAnimationFrame(()=>document.getElementById('sanctuaryRosterSearchInput')?.focus());return;
    }
    if(command==='close-add'){rosterState.selectedSlot=null;resetAddPanel();renderRoster();return;}
    if(command==='show-existing'){rosterState.panel='existing';rosterState.officialResult=null;renderRoster();return;}
    if(command==='show-new'){rosterState.panel='new';rosterState.searchResults=[];renderRoster();return;}
    if(command==='search'){searchExisting(false);return;}
    if(command==='search-main'){searchExisting(true);return;}
    if(command==='add-search-result'){addSearchResult(action);return;}
    if(command==='remove'){removeMember(action);return;}
    if(command==='race'){
      rosterState.raceId=Number(action.dataset.raceId);rosterState.officialResult=null;rosterState.relationType='';rosterState.selectedMain=null;renderRoster();return;
    }
    if(command==='official-lookup'){lookupOfficial();return;}
    if(command==='reset-official'){rosterState.officialResult=null;rosterState.relationType='';rosterState.selectedMain=null;rosterState.mainResults=[];renderRoster();return;}
    if(command==='relation-main'){rosterState.relationType='MAIN';rosterState.selectedMain=null;rosterState.mainResults=[];renderRoster();return;}
    if(command==='relation-alt'){rosterState.relationType='ALT';rosterState.selectedMain=null;rosterState.mainResults=[];renderRoster();requestAnimationFrame(()=>document.getElementById('sanctuaryRosterMainSearch')?.focus());return;}
    if(command==='choose-main'){
      rosterState.selectedMain=rosterState.mainResults[Number(action.dataset.resultIndex||-1)]||null;renderRoster();return;
    }
    if(command==='clear-main'){rosterState.selectedMain=null;rosterState.mainResults=[];renderRoster();return;}
    if(command==='add-official-existing'){addOfficialExisting(action);return;}
    if(command==='add-official')addOfficial();
  }

  function bindRoster(){
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-roster-edit]');
      if(button){event.preventDefault();event.stopPropagation();openRoster(button);return;}
      const forceEdit=event.target.closest('#forceEditBtn');
      if(forceEdit){event.preventDefault();openRoster(forceEdit);return;}
      const quick=event.target.closest('[data-sanctuary-quick-add]');
      if(quick&&!quick.disabled){event.preventDefault();event.stopPropagation();openQuickPopover(quick,event);}
    });
    document.addEventListener('pointerdown',event=>{
      const popover=document.getElementById('sanctuaryQuickAddPopover');
      if(!popover?.classList.contains('open')||popover.contains(event.target)||event.target.closest?.('[data-sanctuary-quick-add]'))return;
      closeQuickPopover();
    });
    window.addEventListener('kinojo:auth-changed',refreshRosterButtons);
    window.addEventListener('resize',()=>{if(document.getElementById('sanctuaryQuickAddPopover')?.classList.contains('open'))positionQuickPopover();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(document.getElementById('sanctuaryRosterEditorModal')?.classList.contains('open')||document.getElementById('sanctuaryQuickAddPopover')?.classList.contains('open')))heartbeat();});
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(document.getElementById('sanctuaryQuickAddPopover')?.classList.contains('open'))closeQuickPopover();else if(document.getElementById('sanctuaryRosterEditorModal')?.classList.contains('open'))closeRoster();});
    refreshRosterButtons();
  }

  const api=window.KinojoSanctuaryEditor||{};
  api.openRoster=openRoster;
  api.closeRoster=closeRoster;
  api.openQuickPopover=openQuickPopover;
  api.closeQuickPopover=closeQuickPopover;
  api.refreshRosterButtons=refreshRosterButtons;
  api.canManageRoster=canManageRoster;
  window.KinojoSanctuaryEditor=api;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindRoster);
  else bindRoster();
})();
