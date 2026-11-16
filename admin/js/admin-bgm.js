(function (A) {
  'use strict';
  const form = document.getElementById('adminBgmUpload');
  if (!form) return;
  const list = document.getElementById('adminBgmList');
  const reload = document.getElementById('adminBgmReload');
  const status = document.getElementById('adminBgmStatus');
  const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg' };
  let busy = false;
  const show = (message, tone = '') => { status.textContent = message; status.className = 'admin-statusline ' + tone; };

  async function request(action, payload, file) {
    const session = window.KinojoAuthSessionCore?.getToken();
    if (!session) throw new Error('관리자 계정으로 다시 로그인해 주세요.');
    const client = window.KinojoSupabaseClientCore;
    const config = await client.ensureConfig();
    const headers = new Headers(client.headers(config));
    headers.set('x-kinojo-session', session);
    if (file) {
      headers.set('content-type', mime[payload.extension]);
      headers.set('x-bgm-title', encodeURIComponent(payload.title));
      headers.set('x-bgm-extension', payload.extension);
    }
    const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=' + action, {
      method: 'POST', headers, body: file || JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(file ? 75000 : 25000)
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(result.message || 'BGM 요청을 처리하지 못했습니다.');
    return result;
  }
  function render(tracks) {
    list.innerHTML = tracks.length ? tracks.map(track => {
      const ready = track.state === 'READY';
      return '<form class="admin-row admin-bgm-row" data-track="' + A.esc(track.id) + '">'
        + '<div class="admin-bgm-fields"><label>곡 제목<input class="admin-input" name="title" required maxlength="100" value="' + A.esc(track.title) + '"' + (ready ? '' : ' disabled') + '></label>'
        + '<label>재생 순서<input class="admin-input" name="order" type="number" required min="0" max="9999" value="' + Number(track.sort_order) + '"' + (ready ? '' : ' disabled') + '></label></div>'
        + '<div class="admin-row-actions"><span class="admin-pill ' + (ready ? 'ok' : 'info') + '">' + (ready ? '공개' : track.state === 'DELETING' ? '삭제 재시도 필요' : '업로드 미완료') + '</span>'
        + (ready ? '<button class="admin-btn" type="submit">저장</button>' : '')
        + (track.canDelete ? '<button class="admin-btn" type="button" data-remove>' + (ready ? '삭제' : '파일 정리') + '</button>' : '')
        + '</div></form>';
    }).join('') : '<div class="admin-empty">등록된 곡이 없습니다.</div>';
  }
  async function refresh() {
    const { tracks } = await request('list');
    if (!Array.isArray(tracks)) throw new Error('BGM 목록을 확인할 수 없습니다.');
    render(tracks);
    return tracks.length;
  }
  async function perform(work, pending) {
    if (busy) return;
    busy = true;
    const controls = [reload, ...form.querySelectorAll('button'), ...list.querySelectorAll('button')];
    controls.forEach(button => { button.disabled = true; });
    show(pending);
    try { show(await work(), 'ok'); }
    catch (error) { show(error.name === 'TimeoutError' ? '요청 시간이 초과됐습니다. 목록에서 반영 여부를 확인해 주세요.' : error.message, 'error'); }
    finally { controls.forEach(button => { button.disabled = false; }); busy = false; }
  }
  function loadBgm() { return perform(async () => '등록곡 ' + await refresh() + ' / 20', '목록 불러오는 중…'); }
  reload.addEventListener('click', loadBgm);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const file = form.elements.file.files[0];
    const extension = file?.name.split('.').pop().toLowerCase();
    const title = form.elements.title.value.trim() || file?.name.replace(/\.[^.]+$/, '').trim();
    if (!file || !Object.hasOwn(mime, extension) || file.size < 1 || file.size > 6291456 || !title || title.length > 100) {
      show('제목은 100자 이내, MP3·M4A·OGG 파일은 6 MiB 이내로 선택해 주세요.', 'error'); return;
    }
    void perform(async () => {
      await request('upload', { title, extension }, file);
      form.reset();
      try { await refresh(); } catch { return '업로드했습니다. 목록 새로고침을 눌러 주세요.'; }
      return '업로드 완료. 홈페이지에서 재생할 수 있습니다.';
    }, '음원 업로드 중…');
  });
  list.addEventListener('submit', event => {
    const row = event.target.closest('[data-track]');
    if (!row) return;
    event.preventDefault();
    void perform(async () => {
      await request('update', { id: row.dataset.track, title: row.elements.title.value.trim(), sort_order: Number(row.elements.order.value) });
      try { await refresh(); } catch { return '저장했습니다. 목록 새로고침을 눌러 주세요.'; }
      return '곡 정보를 저장했습니다.';
    }, '곡 정보 저장 중…');
  });
  list.addEventListener('click', event => {
    const row = event.target.closest('[data-remove]')?.closest('[data-track]');
    if (!row || busy || !window.confirm('이 곡을 재생 목록에서 내리고 파일을 삭제할까요?')) return;
    void perform(async () => {
      try { await request('delete', { id: row.dataset.track }); }
      catch (error) { await refresh().catch(() => {}); throw error; }
      try { await refresh(); } catch { return '삭제했습니다. 목록 새로고침을 눌러 주세요.'; }
      return '곡을 삭제했습니다.';
    }, '음원 삭제 중…');
  });
  A.loadBgm = loadBgm;
})(window.KinojoAdmin);
