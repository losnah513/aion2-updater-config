/*
 * sanctuary-editor.js - KINOJO Sanctuary Server Engine editor
 * Role: 성역 페이지의 수정하기 버튼을 실제 시트 저장 기능과 연결합니다.
 * - Supabase sanctuary_slots 기준 슬롯 데이터를 편집합니다.
 * - 팀명, 대표자, 팀 색상은 sanctuary_teams 메타 서버에 저장합니다.
 */
(function(){
  const CLASS_OPTIONS = ['', '검성', '수호성', '살성', '궁성', '정령성', '마도성', '치유성', '호법성', '권성'];

  function apiUrl(){ return ''; }

  function currentSanctuaryId(){
    try{ if(typeof currentId !== 'undefined' && currentId) return currentId; }catch(_err){}
    return new URLSearchParams(location.search).get('id') || 'rudra';
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

  function ensureModal(){
    let modal = document.getElementById('sanctuaryEditorModal');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'sanctuaryEditorModal';
    modal.className = 'sanctuary-editor-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="sanctuary-editor-card" role="dialog" aria-modal="true" aria-labelledby="sanctuaryEditorTitle">'
      + '<div class="sanctuary-editor-head">'
      + '<div><div class="tip-kicker">SANCTUARY EDIT</div><h2 id="sanctuaryEditorTitle">성역 서버 수정</h2></div>'
      + '<button class="sanctuary-editor-close" type="button" aria-label="닫기">×</button>'
      + '</div>'
      + '<div class="sanctuary-editor-help">캐릭터명 / 직업 / 전투력 / 본캐명을 수정하면 Supabase 성역 슬롯에 저장됩니다.</div>'
      + '<div class="sanctuary-editor-body" id="sanctuaryEditorBody"></div>'
      + '<div class="sanctuary-editor-foot">'
      + '<span class="sanctuary-editor-status" id="sanctuaryEditorStatus"></span>'
      + '<button class="edit-btn" id="sanctuaryEditorReloadBtn" type="button">새로고침</button>'
      + '<button class="edit-btn sanctuary-editor-save" id="sanctuaryEditorSaveBtn" type="button">서버에 저장</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target === modal) close(); });
    modal.querySelector('.sanctuary-editor-close')?.addEventListener('click', close);
    modal.querySelector('#sanctuaryEditorSaveBtn')?.addEventListener('click', save);
    modal.querySelector('#sanctuaryEditorReloadBtn')?.addEventListener('click', () => { close(); reloadFresh(); });
    return modal;
  }

  function renderTeam(team){
    const members = [];
    (team.parties || []).forEach(p => (p.slots || []).forEach(s => { if(s.name) members.push(s.name); }));
    const leaderOptions = ['<option value="">대표 미설정</option>'].concat(members.map(name => '<option value="' + esc(name) + '" ' + (name === team.leaderCharacter ? 'selected' : '') + '>' + esc(name) + '</option>')).join('');
    const parties = (team.parties || []).map(party => renderParty(team, party)).join('');
    return '<section class="sanctuary-editor-team" data-editor-team="' + esc(team.teamNo) + '">'
      + '<div class="sanctuary-editor-team-head">'
      + '<div class="sanctuary-editor-team-title">' + esc(team.teamNo) + '팀</div>'
      + '<label>팀명<input data-team-field="teamName" value="' + esc(team.nameMode === 'manual' ? team.teamName : '') + '" placeholder="비우면 자동 팀명" /></label>'
      + '<label>대표자<select data-team-field="leaderCharacter">' + leaderOptions + '</select></label>'
      + '<label>색상<input data-team-field="customColor" type="color" value="' + esc(team.customColor || '#8b5cf6') + '" /></label>'
      + '</div>'
      + parties
      + '</section>';
  }

  function renderParty(team, party){
    return '<div class="sanctuary-editor-party" data-editor-party="' + esc(party.partyNo) + '">'
      + '<div class="sanctuary-editor-party-title">' + esc(team.teamNo) + '-' + esc(party.partyNo) + ' 파티</div>'
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

  function open(){
    const modal = ensureModal();
    const body = modal.querySelector('#sanctuaryEditorBody');
    const status = modal.querySelector('#sanctuaryEditorStatus');
    const source = data();
    if(!token()){
      toast('관리자 로그인 후 사용할 수 있습니다.');
      return;
    }
    if(!source || !source.teams){
      toast('성역 데이터를 먼저 불러와야 합니다.');
      return;
    }
    body.innerHTML = source.teams.length ? source.teams.map(renderTeam).join('') : '<div class="empty-main">수정할 팀 데이터가 없습니다.</div>';
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
    modal.querySelectorAll('[data-editor-team]').forEach(teamEl => {
      const teamNo = Number(teamEl.dataset.editorTeam || 0);
      const teamName = String(teamEl.querySelector('[data-team-field="teamName"]')?.value || '').trim();
      const leaderCharacter = String(teamEl.querySelector('[data-team-field="leaderCharacter"]')?.value || '').trim();
      const customColor = String(teamEl.querySelector('[data-team-field="customColor"]')?.value || '').trim();
      teamMeta.push({ teamNo, teamName, nameMode: teamName ? 'manual' : 'auto', leaderCharacter, customColor });
      teamEl.querySelectorAll('[data-editor-party]').forEach(partyEl => {
        const partyNo = Number(partyEl.dataset.editorParty || 0);
        partyEl.querySelectorAll('[data-editor-slot]').forEach(slotEl => {
          updates.push({
            teamNo,
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
      try{ sessionStorage.removeItem('kinojo_sanctuary_cache_v2026062703_' + currentSanctuaryId()); }catch(_err){}
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
      btn.textContent = '성역 서버 수정';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        open();
      }, true);
    }
    document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  window.KinojoSanctuaryEditor = { open, close, save, bind };
})();
