(function (A) {
  'use strict';
  const form = document.getElementById('adminBgmUpload');
  if (!form) return;
  const list = document.getElementById('adminBgmList');
  const reload = document.getElementById('adminBgmReload');
  const status = document.getElementById('adminBgmStatus');
  const lyricDialog = document.getElementById('adminBgmLyricsDialog');
  const lyricForm = document.getElementById('adminBgmLyricsForm');
  const lyricStatus = document.getElementById('adminBgmLyricsStatus');
  const lyricSave = lyricForm.querySelector('[type=submit]');
  const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg' };
  const coverInput = document.getElementById('adminBgmCoverFile');
  const instInput = document.getElementById('adminBgmInstFile');
  let busy = false, lyricEditor = null, coverTrackId = null, instTrackId = null;
  const show = (message, tone = '') => { status.textContent = message; status.className = 'admin-statusline ' + tone; };

  async function request(action, payload, file) {
    const session = window.KinojoAuthSessionCore?.getToken();
    if (!session) throw new Error('관리자 계정으로 다시 로그인해 주세요.');
    const client = window.KinojoSupabaseClientCore;
    const config = await client.ensureConfig();
    const headers = new Headers(client.headers(config));
    headers.set('x-kinojo-session', session);
    const coverUpload = action === 'cover-upload';
    if (coverUpload) {
      headers.set('content-type', 'image/webp');
    } else if (file) {
      headers.set('content-type', mime[payload.extension]);
      if (payload.title) headers.set('x-bgm-title', encodeURIComponent(payload.title));
      headers.set('x-bgm-extension', payload.extension);
    }
    const isRead = action === 'lyrics';
    if (isRead) headers.delete('x-kinojo-session');
    const url = config.url + '/functions/v1/kinojo-home-bgm?action=' + action + (payload?.id ? '&id=' + encodeURIComponent(payload.id) : '');
    const response = await fetch(url, {
      method: isRead ? 'GET' : 'POST', headers, body: isRead ? undefined : file || JSON.stringify(payload || {}),
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
        + '<label>목록 순서<input class="admin-input" name="order" type="number" required min="0" max="9999" value="' + Number(track.sort_order) + '"' + (ready ? '' : ' disabled') + '></label>'
        + (ready ? '<label style="grid-column:1/-1">YouTube 영상 주소<input class="admin-input" name="youtubeUrl" type="url" maxlength="1024" placeholder="https://youtu.be/…" value="' + (track.youtube_id ? 'https://www.youtube.com/watch?v=' + A.esc(track.youtube_id) : '') + '"></label>' : '') + '</div>'
        + '<div class="admin-row-actions"><span class="admin-pill ' + (ready ? 'ok' : 'info') + '">' + (ready ? '공개' : track.state === 'DELETING' ? '삭제 재시도 필요' : '업로드 미완료') + '</span>'
        + (ready ? '<button class="admin-btn" type="submit">저장</button>' : '')
        + (ready ? '<button class="admin-btn" type="button" data-lyrics="' + (track.hasLyrics === true ? 'saved' : 'empty') + '">' + (track.hasLyrics === true ? '가사 수정' : '가사 등록') + '</button>' : '')
        + (ready ? '<button class="admin-btn" type="button" data-cover-edit>커버 이미지</button>' : '')
        + (ready ? '<button class="admin-btn" type="button" data-inst-edit>' + (track.inst_version ? '반주 교체' : '반주 추가') + '</button>' : '')
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
  function setLyricStatus(message, tone = '') {
    lyricStatus.textContent = message;
    lyricStatus.className = 'admin-statusline ' + tone;
  }
  function lockLyrics(locked) {
    lyricSave.disabled = locked;
    lyricForm.elements.lyrics.disabled = locked;
    lyricForm.elements.lrcFile.disabled = locked;
  }
  async function openLyrics(button) {
    if (busy || lyricDialog.open) return;
    const row = button.closest('[data-track]');
    const editor = { id: row.dataset.track, saving: false };
    lyricEditor = editor;
    lyricForm.reset();
    document.getElementById('adminBgmLyricsTrack').textContent = row.elements.title.defaultValue;
    const hasLyrics = button.dataset.lyrics === 'saved';
    lockLyrics(hasLyrics);
    setLyricStatus(hasLyrics ? '가사를 불러오는 중…' : '');
    lyricDialog.showModal();
    if (!hasLyrics) return;
    try {
      const result = await request('lyrics', { id: editor.id });
      if (lyricEditor !== editor) return;
      lyricForm.elements.lyrics.value = result.lyrics || '';
      lockLyrics(false);
      setLyricStatus('');
    } catch (error) {
      if (lyricEditor === editor) setLyricStatus('기존 가사를 불러올 수 없습니다. 닫고 다시 시도해 주세요.', 'error');
    }
  }
  lyricDialog.querySelector('[data-bgm-lyrics-close]').addEventListener('click', () => lyricDialog.close());
  lyricDialog.addEventListener('close', () => { if (!lyricDialog.open) lyricEditor = null; });
  lyricForm.elements.lrcFile.addEventListener('change', async () => {
    const editor = lyricEditor;
    const file = lyricForm.elements.lrcFile.files[0];
    if (!editor || !file) return;
    if (file.size > 24576 || !/\.lrc$/i.test(file.name)) return setLyricStatus('24 KiB 이하의 .lrc 파일만 가져올 수 있습니다.', 'error');
    try {
      const source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (lyricEditor !== editor || !lyricDialog.open || editor.saving) return;
      lyricForm.elements.lyrics.value = source;
      setLyricStatus('가져온 내용을 확인한 뒤 가사 저장을 눌러 주세요.');
    } catch { if (lyricEditor === editor) setLyricStatus('UTF-8로 저장된 LRC 파일을 선택해 주세요.', 'error'); }
  });
  lyricForm.addEventListener('submit', async event => {
    event.preventDefault();
    const editor = lyricEditor;
    if (!editor || editor.saving || lyricSave.disabled) return;
    const lyrics = lyricForm.elements.lyrics.value;
    if (new TextEncoder().encode(lyrics).length > 24576) return setLyricStatus('가사는 최대 24 KiB입니다.', 'error');
    editor.saving = true;
    lockLyrics(true);
    setLyricStatus('가사 저장 중…');
    try {
      await request('update-lyrics', { id: editor.id, lyrics });
      if (lyricEditor === editor) lyricDialog.close();
      try { await refresh(); show('가사를 저장했습니다.', 'ok'); }
      catch { show('가사를 저장했습니다. 목록 새로고침을 눌러 주세요.', 'ok'); }
    } catch (error) {
      if (lyricEditor === editor) {
        lockLyrics(false);
        setLyricStatus(error.message, 'error');
      }
    } finally { editor.saving = false; }
  });
  async function prepareCover(file) {
    if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('커버 이미지는 최대 10 MiB입니다.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('JPG, PNG 또는 WebP 이미지를 선택해 주세요.'); }
    const canvas = document.createElement('canvas');
    try {
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.83, 0.67, 0.5, 0.34]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob?.type === 'image/webp' && blob.size <= 128 * 1024) return blob;
      }
      throw new Error('커버를 변환할 수 없습니다. 더 작은 이미지를 선택해 주세요.');
    } finally { bitmap.close(); }
  }
  coverInput.addEventListener('change', () => {
    const file = coverInput.files[0];
    const id = coverTrackId;
    coverInput.value = '';
    coverTrackId = null;
    if (!file || !id) return;
    void perform(async () => {
      await request('cover-upload', { id }, await prepareCover(file));
      return '커버 이미지를 저장했습니다.';
    }, '커버 이미지 저장 중…');
  });
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
  function instExtension(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (!Object.hasOwn(mime, extension) || file.size < 1 || file.size > 6291456) {
      throw new Error('반주 파일은 6 MiB 이하의 MP3·M4A·OGG로 선택해 주세요.');
    }
    return extension;
  }
  instInput.addEventListener('change', () => {
    const file = instInput.files[0], id = instTrackId;
    instInput.value = '';
    instTrackId = null;
    if (!file || !id) return;
    void perform(async () => {
      await request('upload-inst', { id, extension: instExtension(file) }, file);
      await refresh().catch(() => {});
      return '반주 음원을 저장했습니다.';
    }, '반주 음원 업로드 중…');
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const file = form.elements.file.files[0];
    const extension = file?.name.split('.').pop().toLowerCase();
    const title = form.elements.title.value.trim() || file?.name.replace(/\.[^.]+$/, '').trim();
    if (!file || !Object.hasOwn(mime, extension) || file.size < 1 || file.size > 6291456 || !title || title.length > 100) {
      show('제목은 100자 이내, MP3·M4A·OGG 파일은 6 MiB 이내로 선택해 주세요.', 'error'); return;
    }
    const originalCover = form.elements.cover.files[0];
    const inst = form.elements.instrumental.files[0];
    void perform(async () => {
      const instExt = inst ? instExtension(inst) : '';
      const cover = originalCover ? await prepareCover(originalCover) : null;
      const { track } = await request('upload', { title, extension }, file);
      form.reset();
      const optional = [
        ...(cover ? [['커버 이미지', request('cover-upload', { id: track.id }, cover)]] : []),
        ...(inst ? [['반주 음원', request('upload-inst', { id: track.id, extension: instExt }, inst)]] : [])
      ];
      const results = await Promise.allSettled(optional.map(([, pending]) => pending));
      const missing = optional.filter((_, i) => results[i].status === 'rejected').map(([label]) => label);
      if (missing.length) {
        await refresh().catch(() => {});
        throw new Error('원곡은 업로드했습니다. 곡 목록에서 ' + missing.join(' 및 ') + ' 저장 여부를 확인해 주세요.');
      }
      try { await refresh(); } catch { return '업로드했습니다. 목록 새로고침을 눌러 주세요.'; }
      if (inst) return cover ? '원곡·반주·커버 이미지를 업로드했습니다.' : '원곡과 반주를 업로드했습니다.';
      return cover ? '음원과 커버 이미지를 업로드했습니다.' : '업로드 완료. 홈페이지에서 재생할 수 있습니다.';
    }, '음원 업로드 중…');
  });
  list.addEventListener('submit', event => {
    const row = event.target.closest('[data-track]');
    if (!row) return;
    event.preventDefault();
    void perform(async () => {
      const payload = { id: row.dataset.track, title: row.elements.title.value.trim(), sort_order: Number(row.elements.order.value) };
      const video = row.elements.youtubeUrl;
      if (video.value !== video.defaultValue) payload.youtubeUrl = video.value.trim();
      await request('update', payload);
      try { await refresh(); } catch { return '저장했습니다. 목록 새로고침을 눌러 주세요.'; }
      return '곡 정보를 저장했습니다.';
    }, '곡 정보 저장 중…');
  });
  list.addEventListener('click', event => {
    const instButton = event.target.closest('[data-inst-edit]');
    if (instButton && !busy) {
      instTrackId = instButton.closest('[data-track]').dataset.track;
      instInput.click();
      return;
    }
    const coverButton = event.target.closest('[data-cover-edit]');
    if (coverButton && !busy) {
      coverTrackId = coverButton.closest('[data-track]').dataset.track;
      coverInput.click();
      return;
    }
    const lyricButton = event.target.closest('[data-lyrics]');
    if (lyricButton) return void openLyrics(lyricButton);
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
