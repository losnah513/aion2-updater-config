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
