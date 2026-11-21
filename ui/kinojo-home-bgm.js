(function () {
  'use strict';
  if (window !== window.top) return;
  if (document.querySelector('[data-home-bgm]')) return;
  const template = document.createElement('template');
  template.innerHTML = `<section class="kinojo-home-bgm" data-home-bgm aria-label="배경 음악">
  <div class="kinojo-bgm-lyrics">
    <p data-bgm-lyrics data-bgm-lyric-line aria-label="현재 가사" hidden></p>
    <p data-bgm-lyric-secondary lang="ko" hidden></p>
  </div>
  <div class="kinojo-bgm-inner">
    <button class="kinojo-bgm-list" type="button" data-bgm-list aria-label="곡 목록" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h13v2H3zm0 5h13v2H3zm0 5h8v2H3zm15-9h3v10a3.5 3.5 0 1 1-2-3.15V8h-1z"/></svg></button>
    <div class="kinojo-bgm-track"><strong data-bgm-title aria-live="polite">BGM 목록 불러오는 중…</strong><small data-bgm-time>0:00 / 0:00</small><input data-bgm-seek type="range" min="0" max="1" step="0.1" value="0" aria-label="재생 위치" disabled></div>
    <div class="kinojo-bgm-track-tools">
      <button class="kinojo-bgm-like" type="button" data-bgm-like aria-label="좋아요" aria-pressed="false" disabled>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 4.2-8.8 9.3-8.8 9.3S3.2 12.8 3.2 8.6a4.65 4.65 0 0 1 8.8-2.1 4.65 4.65 0 0 1 8.8 2.1Z"/></svg><span data-bgm-like-count aria-hidden="true">—</span>
      </button>
      <span class="kinojo-bgm-play-count" data-bgm-play-count hidden></span>
      <button class="kinojo-bgm-full-lyrics" type="button" data-bgm-full-lyrics aria-label="전체 가사" title="전체 가사" aria-haspopup="dialog" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h6l4 4v14H6V3h2Zm5 0v5h5M9 12h6m-6 4h6"/></svg></button>
      <button class="kinojo-bgm-vocals" type="button" data-bgm-vocals aria-label="보컬" aria-pressed="true" title="보컬 켜짐" disabled>보컬</button>
      <button class="kinojo-bgm-video" type="button" data-bgm-video aria-label="YouTube 영상 재생" title="등록된 영상이 없습니다" aria-haspopup="dialog" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M2 8a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4zm8 0v8l6-4z"/></svg></button>
    </div>
    <div class="kinojo-bgm-transport">
      <div class="kinojo-bgm-controls">
        <button type="button" data-bgm-shuffle aria-label="셔플" aria-pressed="false" disabled><svg class="bgm-stroke-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.5 0 3-1.7 4.5-4m3-4C15 7.7 16.5 6 18 6h3m-4-4 4 4-4 4"/></svg></button>
        <button type="button" data-bgm-repeat aria-label="반복" disabled><svg class="bgm-stroke-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-13a3 3 0 0 0-3 3v2m12-9 4 4-4 4M4 17h13a3 3 0 0 0 3-3v-2M8 13l-4 4 4 4"/></svg><span class="bgm-repeat-one" aria-hidden="true">1</span></button>
        <button type="button" data-bgm-previous aria-label="이전 곡" title="이전 곡" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h3v16H4zm16 0v16L8 12z"/></svg></button>
        <button type="button" data-bgm-play data-playing="false" aria-label="재생" disabled><svg class="bgm-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg><svg class="bgm-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg></button>
        <button type="button" data-bgm-next aria-label="다음 곡" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16l12-8zm13 0h3v16h-3z"/></svg></button>
      </div>
      <div class="kinojo-bgm-volume">
        <button type="button" data-bgm-mute aria-label="음소거" aria-pressed="false" title="음소거"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="bgm-volume-waves" d="M15 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/><path class="bgm-volume-cross" d="m15 9 6 6m0-6-6 6"/></svg></button>
        <input type="range" data-bgm-volume min="0" max="100" step="1" value="100" aria-label="볼륨">
      </div>
    </div>
    <small class="kinojo-bgm-status" data-bgm-status role="status"></small>
  </div>
  <audio preload="none"></audio>
  <dialog class="kinojo-bgm-dialog kinojo-bgm-cover-dialog" data-bgm-dialog aria-labelledby="bgm-list-heading">
    <header><h2 id="bgm-list-heading">곡 목록</h2><form method="dialog"><button type="submit" data-bgm-close aria-label="곡 목록 닫기">×</button></form></header>
    <div class="kinojo-bgm-tracks" data-bgm-tracks></div>
    <div class="kinojo-bgm-cover-nav" data-bgm-cover-nav hidden>
      <button type="button" data-bgm-cover-back aria-label="목록에서 이전 곡 보기">‹</button>
      <span data-bgm-cover-count aria-live="polite"></span>
      <button type="button" data-bgm-cover-forward aria-label="목록에서 다음 곡 보기">›</button>
    </div>
  </dialog>
  <dialog class="kinojo-bgm-dialog kinojo-bgm-video-dialog" data-bgm-video-dialog aria-labelledby="bgm-video-heading">
    <header><h2 id="bgm-video-heading"></h2><form method="dialog"><button type="submit" aria-label="영상 닫기" autofocus>×</button></form></header>
    <div class="kinojo-bgm-video-frame"></div>
    <a target="_blank" rel="noopener noreferrer">YouTube에서 보기</a>
  </dialog>
  <dialog class="kinojo-bgm-dialog kinojo-bgm-lyrics-dialog" data-bgm-lyrics-dialog aria-labelledby="bgm-full-lyrics-heading">
    <header><h2 id="bgm-full-lyrics-heading">전체 가사</h2><form method="dialog"><button type="submit" aria-label="전체 가사 닫기" autofocus>×</button></form></header>
    <div class="kinojo-bgm-lyrics-body"><h3 data-bgm-lyrics-title></h3><p data-bgm-lyrics-status role="status"></p><ol data-bgm-lyrics-text role="list" hidden></ol><p data-bgm-plain-lyrics hidden></p></div>
  </dialog>
</section>`;
  const root = template.content.firstElementChild;
  document.body.append(root);
  function reportSize() {
    document.documentElement.style.setProperty('--kinojo-bgm-bar-height', Math.ceil(root.getBoundingClientRect().height) + 'px');
    window.dispatchEvent(new Event('kinojo:bgm-size-changed'));
  }
  reportSize();
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(root);
  const title = root.querySelector('[data-bgm-title]');
  const play = root.querySelector('[data-bgm-play]');
  const next = root.querySelector('[data-bgm-next]');
  const previous = root.querySelector('[data-bgm-previous]');
  const mute = root.querySelector('[data-bgm-mute]');
  const volume = root.querySelector('[data-bgm-volume]');
  const like = root.querySelector('[data-bgm-like]');
  const likeCount = root.querySelector('[data-bgm-like-count]');
  const playCount = root.querySelector('[data-bgm-play-count]');
  const shuffleButton = root.querySelector('[data-bgm-shuffle]');
  const repeatButton = root.querySelector('[data-bgm-repeat]');
  const seek = root.querySelector('[data-bgm-seek]');
  const time = root.querySelector('[data-bgm-time]');
  const status = root.querySelector('[data-bgm-status]');
  const audio = root.querySelector('audio');
  const listButton = root.querySelector('[data-bgm-list]');
  const dialog = root.querySelector('[data-bgm-dialog]');
  const list = root.querySelector('[data-bgm-tracks]');
  const coverNav = root.querySelector('[data-bgm-cover-nav]');
  const coverCount = coverNav.querySelector('[data-bgm-cover-count]');
  let coverOrder = [], coverIndex = 0, covers = {}, coverTouch;
  const lyricLine = root.querySelector('[data-bgm-lyric-line]');
  const lyricSecondary = root.querySelector('[data-bgm-lyric-secondary]');
  const lyricsButton = root.querySelector('[data-bgm-full-lyrics]');
  const vocalsButton = root.querySelector('[data-bgm-vocals]');
  const videoButton = root.querySelector('[data-bgm-video]');
  const videoDialog = root.querySelector('[data-bgm-video-dialog]');
  const videoFrame = videoDialog.querySelector('.kinojo-bgm-video-frame');
  const videoHeading = videoDialog.querySelector('h2');
  const videoLink = videoDialog.querySelector('a');
  const lyricsDialog = root.querySelector('[data-bgm-lyrics-dialog]');
  const lyricsTitle = root.querySelector('[data-bgm-lyrics-title]');
  const lyricsStatus = root.querySelector('[data-bgm-lyrics-status]');
  const lyricsText = root.querySelector('[data-bgm-lyrics-text]');
  const plainLyricsText = root.querySelector('[data-bgm-plain-lyrics]');
  const backTracks = [], forwardTracks = [];
  let tracks = [], queue = [], index = 0, loading = false, failed = false, generation = 0;
  let catalog = [], vocalsOn = true, resumePosition = 0;
  let config, client, lyricRequest, cues = [], activeCue = -1, lyricSpans = [], lyricFrame = 0;
  let lyricsState = 'idle', plainLyrics = '', modalCue = -1, modalRows = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowCovers = window.matchMedia('(max-width: 600px)');
  let autoPending = /^\/(?:m\/)?(?:index\.html|home\.html)?$/.test(location.pathname);
  const current = () => queue[index];
  const emptyMessage = () => vocalsOn ? '등록된 곡이 없습니다' : '등록된 반주곡이 없습니다';
  const repeatLabels = { off: '반복 끄기', all: '전체 반복', one: '한 곡 반복' };
  const likesPending = new Map();
  let likeState, likeTimer;
  let playSeconds = 0, playReported = false, playSample;
  let shuffleOn = true, repeatMode = 'all';
  try {
    const modes = JSON.parse(localStorage.getItem('kinojo-bgm-playback-modes'));
    if (typeof modes?.shuffle === 'boolean') shuffleOn = modes.shuffle;
    if (Object.hasOwn(repeatLabels, modes?.repeat)) repeatMode = modes.repeat;
  } catch { /* Playback controls still work when storage is unavailable. */ }
  function saveModes() {
    try { localStorage.setItem('kinojo-bgm-playback-modes', JSON.stringify({ shuffle: shuffleOn, repeat: repeatMode })); }
    catch { /* Preferences are optional. */ }
  }
  const audioSettingsKey = 'kinojo-bgm-volume';
  let volumeLevel = 100, muted = false;
  try {
    const settings = JSON.parse(localStorage.getItem(audioSettingsKey));
    if (Number.isInteger(settings?.level) && settings.level >= 0 && settings.level <= 100) volumeLevel = settings.level;
    muted = settings?.muted === true;
  } catch { /* Playback still works when storage is unavailable. */ }
  function canSetVolume() {
    try {
      if (CSS.supports('selector(audio:volume-locked)') && audio.matches(':volume-locked')) return false;
      const initial = audio.volume;
      audio.volume = 0.5;
      const supported = audio.volume === 0.5;
      audio.volume = initial;
      return supported;
    } catch { return false; }
  }
  const volumeAdjustable = canSetVolume();
  volume.disabled = !volumeAdjustable;
  if (!volumeAdjustable) {
    volume.title = '기기의 볼륨 버튼을 사용해 주세요';
    mute.parentElement.title = volume.title;
  }
  function applyVolume() {
    if (volumeAdjustable) audio.volume = volumeLevel / 100;
    audio.muted = muted;
    volume.value = volumeLevel;
    volume.setAttribute('aria-valuetext', volumeLevel + '%');
    mute.setAttribute('aria-pressed', String(muted));
    mute.title = muted ? '음소거 해제' : '음소거';
    mute.dataset.silent = String(muted || volumeAdjustable && volumeLevel === 0);
  }
  function saveVolume() {
    applyVolume();
    try { localStorage.setItem(audioSettingsKey, JSON.stringify({ level: volumeLevel, muted })); }
    catch { /* The current document still retains its volume. */ }
  }
  applyVolume();
  function renderModes() {
    shuffleButton.disabled = repeatButton.disabled = !current();
    shuffleButton.setAttribute('aria-pressed', String(shuffleOn));
    shuffleButton.title = shuffleOn ? '셔플 켜짐' : '셔플 꺼짐';
    repeatButton.dataset.mode = repeatMode;
    repeatButton.title = repeatLabels[repeatMode];
    repeatButton.setAttribute('aria-label', '반복 모드, 현재 ' + repeatLabels[repeatMode]);
    next.disabled = tracks.length < 2 || (!forwardTracks.length && repeatMode === 'off' && index + 1 === queue.length);
    previous.disabled = !current() || (!backTracks.length && index === 0);
  }
  function renderLike() {
    const { count, liked, available, failed } = likeState || {};
    likeCount.textContent = Number.isSafeInteger(count) ? count.toLocaleString('ko-KR') : '—';
    like.disabled = !current() || available === false || liked === true || likesPending.has(current().id);
    like.setAttribute('aria-pressed', String(liked === true));
    like.title = liked ? '오늘 이미 좋아요를 눌렀습니다' : available === false ? '접속 IP를 확인할 수 없습니다' :
      failed ? '좋아요를 불러오거나 저장하지 못했습니다. 다시 시도해 주세요.' : '좋아요 · 같은 IP에서 곡마다 하루 한 번';
    like.setAttribute('aria-label', Number.isSafeInteger(count)
      ? (liked ? '오늘 좋아요 누름, ' : '좋아요, ') + likeCount.textContent + '개'
      : '좋아요');
    if (failed) like.setAttribute('aria-description', like.title);
    else like.removeAttribute('aria-description');
  }
  async function requestLikes(track, method, signal) {
    const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=likes&id=' + encodeURIComponent(track.id), {
      method, headers: client.headers(config), signal, cache: 'no-store'
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error('likes');
    return result;
  }
  function applyLike(state, result) {
    Object.assign(state, result, { failed: false });
    clearTimeout(likeTimer);
    if (Number.isFinite(result.resetAfterMs)) {
      likeTimer = setTimeout(refreshLikes, Math.max(1000, result.resetAfterMs + 250));
    }
  }
  async function refreshLikes() {
    const track = current(), state = likeState;
    if (!track || state.reading || likesPending.has(track.id)) return;
    state.reading = true;
    try {
      const result = await requestLikes(track, 'GET', AbortSignal.any([state.controller.signal, AbortSignal.timeout(10000)]));
      if (state === likeState && !likesPending.has(track.id)) applyLike(state, result);
    } catch {
      if (state === likeState && !likesPending.has(track.id)) {
        state.failed = true;
        if (state.liked) {
          clearTimeout(likeTimer);
          likeTimer = setTimeout(refreshLikes, 30000);
        }
      }
    } finally {
      state.reading = false;
      if (state === likeState) renderLike();
    }
  }
  async function voteLike() {
    if (like.disabled) return;
    const track = current(), state = likeState;
    const pending = requestLikes(track, 'POST', AbortSignal.timeout(10000));
    likesPending.set(track.id, pending);
    renderLike();
    try {
      const result = await pending;
      if (current() === track) {
        // Ignore any initial GET that might have read the count before this vote committed.
        likeState.controller.abort();
        likeState = { controller: new AbortController() };
        applyLike(likeState, result);
      }
    } catch {
      if (current() === track) likeState.failed = true;
    } finally {
      likesPending.delete(track.id);
      if (current() === track) {
        renderLike();
        if (likeState !== state && likeState.count === undefined) void refreshLikes();
      }
    }
  }
  function selectLikes() {
    clearTimeout(likeTimer);
    likeState?.controller.abort();
    likeState = { controller: new AbortController() };
    renderLike();
    void refreshLikes();
  }
  const clock = (value) => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
  function renderPlayCount() {
    const count = current()?.playCount;
    playCount.hidden = !Number.isSafeInteger(count) || count < 0;
    if (playCount.hidden) return;
    const unit = count >= 10000 ? 10000 : count >= 1000 ? 1000 : 1;
    playCount.textContent = unit === 1 ? count + '회 재생' :
      (Math.floor(count / (unit / 10)) / 10).toFixed(1) + (unit === 10000 ? '만' : '천') + ' 회 재생';
    playCount.title = count.toLocaleString('ko-KR') + '회 재생';
  }
  async function recordPlay(track) {
    try {
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=record-play&id=' + encodeURIComponent(track.id), {
        method: 'POST', headers: client.headers(config), keepalive: true, signal: AbortSignal.timeout(8000)
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !Number.isSafeInteger(result.playCount) || result.playCount < 0) return;
      track.playCount = Math.max(track.playCount ?? 0, result.playCount);
      if (track === current()) renderPlayCount();
    } catch { /* A response can be lost after the increment, so do not repeat it. */ }
  }
  function resetPlayCount() {
    playSeconds = 0;
    playReported = false;
    playSample = undefined;
  }
  function markPlaySample() {
    if (!playReported && !audio.paused && !audio.seeking && audio.readyState >= 2) {
      playSample = { position: audio.currentTime, at: performance.now() };
    }
  }
  function measurePlay() {
    const track = current();
    if (!track || playReported || !playSample || audio.seeking) return;
    const position = audio.currentTime, at = performance.now();
    const elapsed = (at - playSample.at) / 1000;
    const played = (position - playSample.position) / audio.playbackRate;
    playSample = { position, at };
    // Ignore playhead jumps and count only elapsed time backed by advancing audio.
    if (played > 0 && played <= elapsed + 0.35) playSeconds += Math.min(played, elapsed);
    if (playSeconds >= 10) {
      playReported = true;
      playSample = undefined;
      void recordPlay(track);
    }
  }
  function stopPlaySample() {
    measurePlay();
    playSample = undefined;
  }
  function progress() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = duration <= 0;
    seek.max = duration || 1;
    seek.value = Math.min(duration, audio.currentTime);
    time.textContent = clock(audio.currentTime) + ' / ' + clock(duration);
    seek.setAttribute('aria-valuetext', time.textContent);
  }
  function button() {
    const playing = !audio.paused && !audio.ended;
    play.dataset.playing = String(playing);
    play.setAttribute('aria-label', failed ? 'BGM 목록 다시 불러오기' : playing ? '일시정지' : '재생');
  }
  function shuffle(exceptFirst) {
    const order = tracks.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[0] === exceptFirst) {
      const j = 1 + Math.floor(Math.random() * (order.length - 1));
      [order[0], order[j]] = [order[j], order[0]];
    }
    return order;
  }
  function resetCoverOrder() {
    const before = backTracks.at(-1);
    const after = forwardTracks.at(-1);
    const active = current();
    coverOrder = [...queue];
    if (coverOrder.length > 2 && active) {
      for (const [neighbor, shift] of [[before, 0], [after, 1]]) {
        if (!neighbor || neighbor === active || !coverOrder.includes(neighbor)) continue;
        coverOrder.splice(coverOrder.indexOf(neighbor), 1);
        coverOrder.splice(coverOrder.indexOf(active) + shift, 0, neighbor);
      }
    }
    coverIndex = Math.max(0, coverOrder.indexOf(active));
  }
  function renderList(focusCenter = false) {
    if (!dialog.open) return;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    list.replaceChildren();
    coverNav.hidden = coverOrder.length < 2;
    if (!coverOrder.length) {
      const empty = document.createElement('p');
      empty.textContent = loading ? '곡 목록 불러오는 중…' : failed ? '곡 목록을 불러오지 못했습니다.' : emptyMessage();
      list.append(empty);
      return;
    }
    coverCount.textContent = (coverIndex + 1) + ' / ' + coverOrder.length;
    for (const [offset, position] of [[-1, 'left'], [0, 'center'], [1, 'right']]) {
      if (coverOrder.length === 1 && offset || coverOrder.length === 2 && offset === -1) continue;
      const track = coverOrder[(coverIndex + offset + coverOrder.length) % coverOrder.length];
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.bgmTrack = track.id;
      item.dataset.coverPosition = position;
      if (track === current()) item.setAttribute('aria-current', 'true');
      const artwork = document.createElement('span');
      artwork.className = 'kinojo-bgm-cover-art';
      artwork.setAttribute('aria-hidden', 'true');
      const fallback = document.createElement('span');
      fallback.textContent = '♫';
      artwork.append(fallback);
      setCoverArtwork(artwork, track.id);
      const label = document.createElement('span');
      label.textContent = track.title;
      item.append(artwork, label);
      list.append(item);
      if ((focusCenter && offset === 0) || (!focusCenter && track.id === focused?.dataset.bgmTrack)) {
        item.focus({ preventScroll: true });
      }
    }
  }
  function setCoverArtwork(artwork, id) {
    const version = covers[id];
    const oldImage = artwork.querySelector('img');
    if (oldImage?.dataset.version === version) return;
    oldImage?.remove();
    if (!version) return;
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.dataset.version = version;
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = config.url + '/functions/v1/kinojo-home-bgm?action=cover&id=' + id + '&v=' + version;
    artwork.append(image);
  }
  async function loadCovers() {
    if (!config || !tracks.length) return;
    try {
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=covers', {
        headers: client.headers(config), signal: AbortSignal.timeout(8000), cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !result.covers) return;
      covers = Object.fromEntries(tracks.flatMap(track => {
        const version = result.covers[track.id];
        return typeof version === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(version)
          ? [[track.id, version]] : [];
      }));
      if (!dialog.open) return;
      for (const card of list.querySelectorAll('[data-bgm-track]')) {
        setCoverArtwork(card.querySelector('.kinojo-bgm-cover-art'), card.dataset.bgmTrack);
      }
    } catch { /* Track selection remains available. */ }
  }
  function animateCoverMove(previous, step) {
    const stage = list.getBoundingClientRect();
    const vertical = narrowCovers.matches;
    const distance = step * (vertical ? stage.height : stage.width) * 0.24;
    const slots = { left: -1, center: 0, right: 1 };
    const timing = { duration: 300, easing: 'cubic-bezier(0.22, 0.7, 0.25, 1)' };
    const arriving = [...list.querySelectorAll('[data-bgm-track]')].map(card => ({
      card, rect: card.getBoundingClientRect()
    }));
    for (const { card, rect } of arriving) {
      const old = previous.get(card.dataset.bgmTrack);
      const keepsMoving = old && slots[card.dataset.coverPosition] - slots[old.card.dataset.coverPosition] === -step;
      const source = keepsMoving ? old.rect : null;
      if (keepsMoving) {
        previous.delete(card.dataset.bgmTrack);
        const loadedImage = old.card.querySelector('img');
        const newImage = card.querySelector('img');
        if (loadedImage?.naturalWidth && loadedImage.dataset.version === newImage?.dataset.version) {
          newImage.replaceWith(loadedImage);
        }
      }
      const x = source ? source.left - rect.left : vertical ? 0 : distance;
      const y = source ? source.top - rect.top : vertical ? distance : 0;
      const scale = source && !vertical ? ' scale(' + source.width / rect.width + ',' + source.height / rect.height + ')' : '';
      card.animate([
        { transform: 'translate(' + x + 'px,' + y + 'px)' + scale, transformOrigin: 'top left', opacity: source ? 1 : 0 },
        { transform: 'none', transformOrigin: 'top left', opacity: 1 }
      ], timing);
    }
    for (const { card, rect } of previous.values()) {
      card.getAnimations().forEach(animation => animation.cancel());
      delete card.dataset.bgmTrack;
      card.removeAttribute('aria-current');
      card.inert = true;
      card.setAttribute('aria-hidden', 'true');
      card.classList.add('kinojo-bgm-cover-exit');
      Object.assign(card.style, {
        left: (rect.left - stage.left) + 'px', top: (rect.top - stage.top) + 'px',
        width: rect.width + 'px', height: rect.height + 'px',
      });
      list.append(card);
      card.animate([
        { transform: 'none', opacity: 1 },
        { transform: (vertical ? 'translateY(' : 'translateX(') + -distance + 'px)', opacity: 0 },
      ], timing).addEventListener('finish', () => card.remove(), { once: true });
    }
  }
  function browseCovers(step, focusCenter = false) {
    if (coverOrder.length < 2) return;
    const animated = !reducedMotion.matches && typeof list.animate === 'function';
    const previous = animated ? new Map([...list.querySelectorAll('[data-bgm-track]')].map(card => [
      card.dataset.bgmTrack, { card, rect: card.getBoundingClientRect() }
    ])) : null;
    coverIndex = (coverIndex + step + coverOrder.length) % coverOrder.length;
    renderList(focusCenter || list.contains(document.activeElement));
    if (previous?.size) animateCoverMove(previous, step);
  }
  const hangul = /\p{Script=Hangul}/u;
  function separateTranslation(segments) {
    const lyric = segments.map(segment => segment.text).join('');
    const match = lyric.match(/\s+[(（]([^()（）]*\p{Script=Hangul}[^()（）]*)[)）]$/u);
    if (!match) return { segments, lyric };
    const original = lyric.slice(0, match.index);
    if (hangul.test(original) || !/\p{Script=Latin}/u.test(original)) return { segments, lyric };
    let remaining = original.length;
    const primary = [];
    for (const segment of segments) {
      if (remaining <= 0) break;
      primary.push({ start: segment.start, text: segment.text.slice(0, remaining) });
      remaining -= segment.text.length;
    }
    return { segments: primary, lyric: original, translation: match[1].trim() };
  }
  function parseLrc(source) {
    const offset = Number(source.match(/^\s*\[offset\s*:\s*([+-]?\d{1,6})\]/im)?.[1] || 0) / 1000;
    const at = match => Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || 0));
    const rows = new Map();
    for (const line of source.split(/\r?\n/)) {
      const prefix = line.match(/^\s*(?:\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\])+/)?.[0];
      if (!prefix) continue;
      const times = [...prefix.matchAll(/\[(\d+):([0-5]\d)(?:\.(\d{1,3}))?\]/g)];
      const text = line.slice(prefix.length).trim();
      const marks = [...text.matchAll(/<(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?>/g)];
      for (const time of times) {
        const origin = at(time) + offset;
        const segments = [];
        let start = Math.max(0, origin), cursor = 0;
        for (const mark of marks) {
          const word = text.slice(cursor, mark.index);
          if (word) segments.push({ start, text: word });
          start = Math.max(start, at(mark) + offset + at(time) - at(times[0]));
          cursor = mark.index + mark[0].length;
        }
        const tail = text.slice(cursor);
        if (tail) segments.push({ start, text: tail });
        rows.set(Math.max(0, origin), { start: Math.max(0, origin), ...separateTranslation(segments) });
      }
    }
    const sequence = [...rows.values()].sort((a, b) => a.start - b.start);
    if (!sequence.some(cue => cue.segments.length)) return [];
    if (!sequence[0].segments.length) sequence[0].start = 0;
    else if (sequence[0].start > 0) sequence.unshift({ start: 0, segments: [] });
    const first = sequence.findIndex(cue => cue.segments.length);
    const last = sequence.findLastIndex(cue => cue.segments.length);
    return sequence.map((cue, i) => cue.segments.length ? cue : {
      ...cue, instrumental: i < first ? '<전주 중>' : i > last ? '<후주 중>' : '<간주 중>'
    }).filter((cue, i, rows) => !cue.instrumental || cue.instrumental !== rows[i - 1]?.instrumental);
  }
  function lyricWords(cue) {
    return (cue?.segments || []).map(segment => {
      const span = document.createElement('span');
      span.setAttribute('data-bgm-lyric-word', '');
      span.textContent = segment.text;
      return span;
    });
  }
  function followModalCue(position) {
    if (!lyricsDialog.open || position === modalCue) return;
    modalRows[modalCue]?.row.removeAttribute('aria-current');
    modalCue = position;
    const row = modalRows[position]?.row;
    if (!row) return;
    row.setAttribute('aria-current', 'true');
    const rowBox = row.getBoundingClientRect();
    const dialogTop = lyricsDialog.getBoundingClientRect().top;
    const headerHeight = lyricsDialog.querySelector('header').offsetHeight;
    const center = (lyricsDialog.clientHeight + headerHeight) / 2;
    const top = lyricsDialog.scrollTop + rowBox.top - dialogTop + rowBox.height / 2 - center;
    lyricsDialog.scrollTo({ top, behavior: reducedMotion.matches || audio.paused || audio.seeking ? 'auto' : 'smooth' });
  }
  function paintLyrics() {
    const now = audio.currentTime;
    let lo = 0, hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cues[mid].start <= now) lo = mid + 1;
      else hi = mid;
    }
    const position = lo - 1, cue = cues[position];
    if (activeCue !== position) {
      activeCue = position;
      lyricSpans = lyricWords(cue);
      lyricLine.toggleAttribute('data-bgm-instrumental', Boolean(cue?.instrumental));
      lyricLine.replaceChildren(...(cue?.instrumental ? [cue.instrumental] : lyricSpans));
      const translation = cue?.translation;
      const nextLyric = cue?.lyric && hangul.test(cue.lyric) && !cues.some(line => line.translation)
        ? cues.slice(position + 1).find(next => !next.instrumental)?.lyric
        : '';
      lyricSecondary.textContent = translation || nextLyric || '';
      lyricSecondary.hidden = !lyricSecondary.textContent;
      lyricSecondary.toggleAttribute('data-bgm-lyric-preview', Boolean(nextLyric));
      lyricSecondary.setAttribute('aria-label', translation ? '한국어 번역' : '다음 가사');
    }
    lyricLine.hidden = !cue;
    followModalCue(position);
    if (!cue || cue.instrumental) return;
    const modalSpans = lyricsDialog.open ? modalRows[position]?.spans : null;
    const end = cues[position + 1]?.start ?? (Number.isFinite(audio.duration) ? audio.duration : cue.start + 4);
    cue.segments.forEach((segment, i) => {
      const until = cue.segments[i + 1]?.start ?? end;
      const fraction = Math.min(1, Math.max(0, (now - segment.start) / Math.max(0.05, until - segment.start)));
      const fill = (fraction * 100).toFixed(1) + '%';
      lyricSpans[i].style.setProperty('--bgm-fill', fill);
      modalSpans?.[i]?.style.setProperty('--bgm-fill', fill);
    });
  }
  function lyricTick() {
    lyricFrame = 0;
    paintLyrics();
    if (cues.length && !audio.paused && !audio.ended) lyricFrame = requestAnimationFrame(lyricTick);
  }
  function updateLyrics() {
    if (lyricFrame) cancelAnimationFrame(lyricFrame);
    lyricTick();
  }
  function resetLyrics() {
    lyricRequest?.abort();
    lyricRequest = null;
    lyricsState = 'idle';
    plainLyrics = '';
    cues = [];
    activeCue = -1;
    lyricSpans = [];
    lyricLine.replaceChildren();
    lyricLine.removeAttribute('data-bgm-instrumental');
    lyricSecondary.textContent = '';
    lyricSecondary.hidden = true;
    updateLyrics();
  }
  function renderLyricsDialog() {
    if (!lyricsDialog.open) return;
    const track = current();
    lyricsTitle.textContent = track?.title || '';
    modalCue = -1;
    modalRows = cues.map(cue => {
      const row = document.createElement('li');
      row.setAttribute('data-bgm-lyrics-row', '');
      const spans = lyricWords(cue);
      if (cue.instrumental) {
        row.setAttribute('data-bgm-instrumental', '');
        row.textContent = cue.instrumental;
      } else {
        row.append(...spans);
        if (cue.translation) {
          const translation = document.createElement('span');
          translation.setAttribute('data-bgm-lyric-translation', '');
          translation.lang = 'ko';
          translation.textContent = cue.translation;
          row.append(translation);
        }
      }
      return {row, spans};
    });
    lyricsText.replaceChildren(...modalRows.map(item => item.row));
    lyricsText.hidden = !modalRows.length;
    plainLyricsText.hidden = !plainLyrics;
    plainLyricsText.replaceChildren();
    if (plainLyrics) {
      for (const [index, line] of plainLyrics.split('\n').entries()) {
        if (index) plainLyricsText.append(document.createElement('br'));
        plainLyricsText.append(line);
      }
    }
    const hasLyrics = Boolean(modalRows.length || plainLyrics);
    lyricsStatus.hidden = hasLyrics;
    lyricsStatus.textContent = hasLyrics ? '' : lyricsState === 'error' ? '가사를 불러오지 못했습니다. 창을 다시 열어 주세요.' :
      track?.hasLyrics && lyricsState !== 'ready' ? '가사를 불러오는 중…' : '등록된 가사가 없습니다.';
    paintLyrics();
  }
  async function loadLyrics(track) {
    if (!track?.hasLyrics || lyricRequest || lyricsState === 'ready') return;
    const controller = new AbortController();
    lyricRequest = controller;
    lyricsState = 'loading';
    renderLyricsDialog();
    try {
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=lyrics&id=' + track.id, {
        headers: client.headers(config), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store'
      });
      const result = await response.json();
      if (lyricRequest !== controller) return;
      if (!response.ok || result.ok !== true) throw new Error('lyrics');
      const source = typeof result.lyrics === 'string' ? result.lyrics : '';
      cues = parseLrc(source);
      plainLyrics = cues.length ? '' : source.trim();
      lyricsState = 'ready';
      updateLyrics();
    } catch {
      if (lyricRequest === controller) lyricsState = 'error';
    } finally {
      if (lyricRequest === controller) {
        lyricRequest = null;
        renderLyricsDialog();
      }
    }
  }
  function select(i, position = 0, sameTrack = false) {
    if (sameTrack) stopPlaySample();
    else resetPlayCount();
    resumePosition = position;
    generation++;
    resetLyrics();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    index = i;
    title.textContent = current()?.title || emptyMessage();
    selectLikes();
    renderPlayCount();
    renderModes();
    play.disabled = tracks.length === 0;
    status.textContent = '';
    progress();
    button();
    resetCoverOrder();
    renderList();
    if (dialog.open) void loadCovers();
    lyricsButton.disabled = !current();
    videoButton.disabled = !current()?.youtubeId;
    videoButton.title = videoButton.disabled ? '등록된 영상이 없습니다' : 'YouTube 영상 재생';
    renderLyricsDialog();
    if (lyricsDialog.open) void loadLyrics(current());
  }
  function stopAutoplay() {
    autoPending = false;
    document.removeEventListener('click', onHomeClick, true);
    window.removeEventListener('kinojo:bgm-frame-activation', onFrameActivation);
  }
  function onFrameActivation() {
    if (autoPending && audio.paused && navigator.userActivation?.isActive) void start(true);
  }
  function onHomeClick(event) {
    if (!autoPending || !event.isTrusted || !audio.paused || event.target.closest?.('[data-home-bgm] :is(button,input,dialog):not([data-bgm-list])')) return;
    // Call play directly in the click/tap handler while user activation is available.
    void start(true);
  }
  async function start(automatic = false) {
    const track = current();
    if (!track) return;
    const attempt = ++generation;
    status.textContent = '';
    if (!audio.getAttribute('src') || audio.error) audio.src = vocalsOn ? track.url : track.instUrl;
    try {
      await audio.play();
      if (attempt === generation) {
        stopAutoplay();
        void loadLyrics(track);
      }
    } catch (error) {
      if (attempt !== generation) return;
      if (automatic && autoPending && error?.name === 'NotAllowedError') {
        status.textContent = '화면을 누르면 BGM 재생을 시작합니다.';
        document.addEventListener('click', onHomeClick, true);
        window.addEventListener('kinojo:bgm-frame-activation', onFrameActivation);
      } else {
        stopAutoplay();
        status.textContent = '재생할 수 없습니다. 다시 재생하거나 다음 곡을 선택해 주세요.';
      }
    }
    button();
  }
  function rememberBack(track) {
    if (track) backTracks.push(track);
    if (backTracks.length > 100) backTracks.shift();
  }
  function advance(continuePlaying) {
    const track = current();
    if (!track) return;
    let target = queue.indexOf(forwardTracks.pop());
    if (target < 0) {
      target = index + 1;
      if (target === queue.length) {
        if (repeatMode === 'off') return;
        queue = shuffleOn ? shuffle(track) : tracks;
        target = 0;
      }
    }
    if (queue[target] !== track) rememberBack(track);
    select(target);
    if (continuePlaying) void start();
  }
  async function load() {
    if (loading) return;
    loading = true;
    play.disabled = true;
    title.textContent = '곡 목록 불러오는 중…';
    status.textContent = '';
    try {
      client = window.KinojoSupabaseClientCore;
      config = await client.ensureConfig();
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=playlist', {
        headers: client.headers(config), signal: AbortSignal.timeout(12000), cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !Array.isArray(result.tracks)) throw new Error('playlist');
      catalog = result.tracks.filter(t => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(t.id) &&
        ['mp3', 'm4a', 'ogg'].includes(t.extension) && typeof t.title === 'string').map(t => ({
        id: t.id,
        title: t.title,
        hasLyrics: t.hasLyrics === true,
        playCount: t.playCount,
        youtubeId: typeof t.youtubeId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(t.youtubeId) ? t.youtubeId : null,
        url: config.url + '/storage/v1/object/public/kinojo-home-bgm/' + t.id + '.' + t.extension,
        instUrl: (t.instSlot === 1 || t.instSlot === 2) && typeof t.instVersion === 'string'
          ? config.url + '/storage/v1/object/public/kinojo-home-bgm/' + t.id + '.inst-' + t.instSlot + '?v=' + encodeURIComponent(t.instVersion)
          : null
      }));
      tracks = vocalsOn ? catalog : catalog.filter(t => t.instUrl);
      failed = false;
      vocalsButton.disabled = catalog.length === 0;
      queue = shuffleOn ? shuffle() : tracks;
      backTracks.length = forwardTracks.length = 0;
      select(0);
      if (autoPending && tracks.length) void start(true);
    } catch {
      failed = true;
      title.textContent = 'BGM 목록을 불러오지 못했습니다';
      play.disabled = false;
      button();
    } finally { loading = false; renderList(); }
  }
  like.addEventListener('click', voteLike);
  vocalsButton.addEventListener('click', () => {
    const track = current();
    const playing = !audio.paused && !audio.ended;
    const position = audio.ended ? 0 : audio.currentTime || resumePosition;
    stopAutoplay();
    vocalsOn = !vocalsOn;
    vocalsButton.setAttribute('aria-pressed', String(vocalsOn));
    vocalsButton.title = vocalsOn ? '보컬 켜짐' : '보컬 꺼짐 · 반주만 재생';
    tracks = vocalsOn ? catalog : catalog.filter(t => t.instUrl);
    queue = shuffleOn ? shuffle() : tracks;
    backTracks.length = forwardTracks.length = 0;
    const sameTrack = Boolean(track && queue.includes(track));
    select(sameTrack ? queue.indexOf(track) : 0, sameTrack ? position : 0, sameTrack);
    if (playing && current()) void start();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && current()) void refreshLikes();
  });
  shuffleButton.addEventListener('click', () => {
    const track = current();
    shuffleOn = !shuffleOn;
    queue = shuffleOn ? [track, ...shuffle().filter(item => item !== track)] : tracks;
    index = queue.indexOf(track);
    forwardTracks.length = 0;
    saveModes();
    renderModes();
  });
  repeatButton.addEventListener('click', () => {
    repeatMode = { off: 'all', all: 'one', one: 'off' }[repeatMode];
    saveModes();
    renderModes();
  });
  play.addEventListener('click', () => {
    if (failed) return void load();
    stopAutoplay();
    if (!audio.paused) { generation++; audio.pause(); }
    else void start();
  });
  mute.addEventListener('click', () => {
    muted = !muted;
    saveVolume();
  });
  volume.addEventListener('input', () => {
    volumeLevel = volume.valueAsNumber;
    if (volumeLevel > 0) muted = false;
    saveVolume();
  });
  videoButton.addEventListener('click', () => {
    const track = current();
    if (!track?.youtubeId || videoDialog.open) return;
    stopAutoplay();
    generation++;
    audio.pause();
    status.textContent = '';

    videoHeading.textContent = track.title;
    videoLink.href = 'https://www.youtube.com/watch?v=' + track.youtubeId;
    videoDialog.showModal();

    const frame = document.createElement('iframe');
    frame.title = track.title + ' · YouTube';
    frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = 'https://www.youtube.com/embed/' + track.youtubeId + '?autoplay=1&rel=0';
    videoFrame.replaceChildren(frame);
  });
  videoDialog.addEventListener('close', () => {
    if (videoDialog.open) return;
    videoFrame.replaceChildren();
    videoButton.focus();
  });
  lyricsButton.addEventListener('click', () => {
    lyricsDialog.showModal();
    renderLyricsDialog();
    void loadLyrics(current());
  });
  lyricsDialog.addEventListener('close', () => {
    if (lyricsDialog.open) return;
    modalCue = -1;
    modalRows = [];
    lyricsText.replaceChildren();
    lyricsButton.focus();
  });
  previous.addEventListener('click', () => {
    const keepPlaying = autoPending || (!audio.paused && !audio.ended);
    stopAutoplay();
    const target = backTracks.length ? queue.indexOf(backTracks.pop()) : index - 1;
    if (target < 0) return;
    forwardTracks.push(current());
    select(target);
    if (keepPlaying) void start();
  });
  next.addEventListener('click', () => {
    const continuePlaying = autoPending || (!audio.paused && !audio.ended);
    stopAutoplay();
    advance(continuePlaying);
  });
  listButton.addEventListener('click', () => {
    resetCoverOrder();
    dialog.showModal();
    renderList(true);
    void loadCovers();
  });
  coverNav.querySelector('[data-bgm-cover-back]').addEventListener('click', () => browseCovers(-1));
  coverNav.querySelector('[data-bgm-cover-forward]').addEventListener('click', () => browseCovers(1));
  dialog.addEventListener('keydown', event => {
    const backward = narrowCovers.matches ? 'ArrowUp' : 'ArrowLeft';
    const forward = narrowCovers.matches ? 'ArrowDown' : 'ArrowRight';
    if (event.key !== backward && event.key !== forward) return;
    event.preventDefault();
    browseCovers(event.key === backward ? -1 : 1, true);
  });
  list.addEventListener('touchstart', event => {
    coverTouch = event.touches.length === 1 ? event.touches[0] : null;
  }, { passive: true });
  list.addEventListener('touchend', event => {
    if (!coverTouch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - coverTouch.clientX;
    const dy = event.changedTouches[0].clientY - coverTouch.clientY;
    coverTouch = null;
    const distance = narrowCovers.matches ? dy : dx;
    const crossDistance = narrowCovers.matches ? dx : dy;
    if (Math.abs(distance) < 36 || Math.abs(distance) < Math.abs(crossDistance)) return;
    if (event.cancelable) event.preventDefault();
    browseCovers(distance < 0 ? 1 : -1);
  }, { passive: false });
  list.addEventListener('touchcancel', () => { coverTouch = null; });
  dialog.addEventListener('click', event => {
    if (narrowCovers.matches && event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => listButton.focus());
  list.addEventListener('click', event => {
    const id = event.target.closest('[data-bgm-track]')?.dataset.bgmTrack;
    const track = tracks.find(item => item.id === id);
    if (!track) return;
    stopAutoplay();
    if (track !== current()) {
      rememberBack(current());
      forwardTracks.length = 0;
      queue = shuffleOn ? [track, ...shuffle().filter(item => item !== track)] : tracks;
      select(queue.indexOf(track));
    }
    if (audio.paused || audio.ended) void start();
    dialog.close();
  });
  seek.addEventListener('input', () => {
    if (!seek.disabled) {
      stopPlaySample();
      audio.currentTime = Number(seek.value);
    }
  });
  for (const name of ['playing', 'seeked']) audio.addEventListener(name, markPlaySample);
  for (const name of ['pause', 'waiting', 'ended']) audio.addEventListener(name, stopPlaySample);
  for (const name of ['seeking', 'emptied', 'error']) {
    audio.addEventListener(name, () => { playSample = undefined; });
  }
  audio.addEventListener('timeupdate', measurePlay);
  audio.addEventListener('loadedmetadata', () => {
    if (!resumePosition) return;
    const position = resumePosition;
    resumePosition = 0;
    if (position < audio.duration) audio.currentTime = position;
  });
  for (const name of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) audio.addEventListener(name, progress);
  for (const name of ['play', 'pause', 'ended']) audio.addEventListener(name, button);
  for (const name of ['playing', 'pause', 'seeking', 'seeked', 'durationchange', 'timeupdate']) audio.addEventListener(name, updateLyrics);
  audio.addEventListener('playing', () => { root.dataset.bgmFlow = 'on'; });
  for (const name of ['waiting', 'pause', 'ended', 'emptied', 'error']) {
    audio.addEventListener(name, () => { delete root.dataset.bgmFlow; });
  }
  audio.addEventListener('ended', () => {
    resetPlayCount();
    if (repeatMode === 'one') {
      audio.currentTime = 0;
      void start();
    } else advance(true);
  });
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) status.textContent = '음원을 불러오지 못했습니다. 재생 또는 다음 곡을 눌러 주세요.';
  });
  if (document.readyState === 'complete') void load();
  else window.addEventListener('load', load, { once: true });
})();
