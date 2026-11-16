(function () {
  'use strict';
  if (window !== window.top) return;
  if (document.querySelector('[data-home-bgm]')) return;
  const template = document.createElement('template');
  template.innerHTML = `<section class="kinojo-home-bgm" data-home-bgm aria-label="배경 음악">
  <div class="kinojo-bgm-lyrics" data-bgm-lyrics aria-label="현재 가사" hidden><p data-bgm-lyric-line></p></div>
  <div class="kinojo-bgm-inner">
    <button class="kinojo-bgm-list" type="button" data-bgm-list aria-label="곡 목록" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h13v2H3zm0 5h13v2H3zm0 5h8v2H3zm15-9h3v10a3.5 3.5 0 1 1-2-3.15V8h-1z"/></svg></button>
    <div class="kinojo-bgm-track"><strong data-bgm-title aria-live="polite">BGM 목록 불러오는 중…</strong><small data-bgm-time>0:00 / 0:00</small><input data-bgm-seek type="range" min="0" max="1" step="0.1" value="0" aria-label="재생 위치" disabled></div>
    <div class="kinojo-bgm-controls">
      <button type="button" data-bgm-play data-playing="false" aria-label="재생" disabled><svg class="bgm-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg><svg class="bgm-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg></button>
      <button type="button" data-bgm-next aria-label="다음 곡" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16l12-8zm13 0h3v16h-3z"/></svg></button>
    </div>
    <small class="kinojo-bgm-status" data-bgm-status role="status"></small>
  </div>
  <audio preload="none"></audio>
  <dialog class="kinojo-bgm-dialog" data-bgm-dialog aria-labelledby="bgm-list-heading">
    <header><h2 id="bgm-list-heading">곡 목록</h2><form method="dialog"><button type="submit" data-bgm-close aria-label="곡 목록 닫기">×</button></form></header>
    <div class="kinojo-bgm-tracks" data-bgm-tracks></div>
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
  const seek = root.querySelector('[data-bgm-seek]');
  const time = root.querySelector('[data-bgm-time]');
  const status = root.querySelector('[data-bgm-status]');
  const audio = root.querySelector('audio');
  const listButton = root.querySelector('[data-bgm-list]');
  const dialog = root.querySelector('[data-bgm-dialog]');
  const list = root.querySelector('[data-bgm-tracks]');
  const lyricPanel = root.querySelector('[data-bgm-lyrics]');
  const lyricLine = root.querySelector('[data-bgm-lyric-line]');
  let tracks = [], queue = [], index = 0, loading = false, failed = false, generation = 0;
  let config, client, lyricRequest, cues = [], activeCue = -1, lyricSpans = [], lyricFrame = 0;
  let autoPending = /^\/(?:m\/)?(?:index\.html|home\.html)?$/.test(location.pathname);
  const current = () => queue[index];
  const clock = (value) => {
    const seconds = Math.max(0, Math.floor(value || 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };
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
  function renderList() {
    if (!dialog.open) return;
    const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.bgmTrack : null;
    list.replaceChildren();
    if (!tracks.length) {
      const empty = document.createElement('p');
      empty.textContent = loading ? '곡 목록 불러오는 중…' : failed ? '곡 목록을 불러오지 못했습니다.' : '등록된 곡이 없습니다.';
      list.append(empty);
      return;
    }
    for (const track of tracks) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.bgmTrack = track.id;
      item.textContent = track.title;
      if (track === current()) item.setAttribute('aria-current', 'true');
      list.append(item);
      if (track.id === focusedId) item.focus({ preventScroll: true });
    }
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
        rows.set(Math.max(0, origin), { start: Math.max(0, origin), segments });
      }
    }
    return [...rows.values()].sort((a, b) => a.start - b.start);
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
      lyricSpans = (cue?.segments || []).map(segment => {
        const span = document.createElement('span');
        span.textContent = segment.text;
        return span;
      });
      lyricLine.replaceChildren(...lyricSpans);
    }
    lyricPanel.hidden = !lyricSpans.length;
    if (!cue) return;
    const end = cues[position + 1]?.start ?? (Number.isFinite(audio.duration) ? audio.duration : cue.start + 4);
    cue.segments.forEach((segment, i) => {
      const until = cue.segments[i + 1]?.start ?? end;
      const fraction = Math.min(1, Math.max(0, (now - segment.start) / Math.max(0.05, until - segment.start)));
      lyricSpans[i].style.setProperty('--bgm-fill', (fraction * 100).toFixed(1) + '%');
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
    cues = [];
    activeCue = -1;
    lyricSpans = [];
    lyricLine.replaceChildren();
    updateLyrics();
  }
  async function loadLyrics(track) {
    if (!track.hasLyrics || lyricRequest) return;
    const controller = new AbortController();
    lyricRequest = controller;
    try {
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=lyrics&id=' + track.id, {
        headers: client.headers(config), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store'
      });
      const result = await response.json();
      if (lyricRequest !== controller || !response.ok || result.ok !== true || typeof result.lyrics !== 'string') return;
      cues = parseLrc(result.lyrics);
      updateLyrics();
    } catch { /* A lyrics request failure does not interrupt the audio. */ }
  }
  function select(i) {
    generation++;
    resetLyrics();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    index = i;
    title.textContent = current()?.title || '등록된 곡이 없습니다';
    next.disabled = tracks.length < 2;
    play.disabled = tracks.length === 0;
    status.textContent = '';
    progress();
    button();
    renderList();
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
    if (!autoPending || !event.isTrusted || !audio.paused || event.target.closest?.('[data-bgm-play],[data-bgm-next],[data-bgm-dialog]')) return;
    // Call play directly in the click/tap handler while user activation is available.
    void start(true);
  }
  async function start(automatic = false) {
    const track = current();
    if (!track) return;
    const attempt = ++generation;
    status.textContent = '';
    if (!audio.getAttribute('src') || audio.error) audio.src = track.url;
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
  function advance(continuePlaying) {
    if (!queue.length) return;
    if (index + 1 < queue.length) select(index + 1);
    else {
      queue = shuffle(current());
      select(0);
    }
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
      tracks = result.tracks.filter(t => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(t.id) &&
        ['mp3', 'm4a', 'ogg'].includes(t.extension) && typeof t.title === 'string').map(t => ({
        id: t.id,
        title: t.title,
        hasLyrics: t.hasLyrics === true,
        url: config.url + '/storage/v1/object/public/kinojo-home-bgm/' + t.id + '.' + t.extension
      }));
      failed = false;
      queue = shuffle();
      select(0);
      if (autoPending && tracks.length) void start(true);
    } catch {
      failed = true;
      title.textContent = 'BGM 목록을 불러오지 못했습니다';
      play.disabled = false;
      button();
    } finally { loading = false; renderList(); }
  }
  play.addEventListener('click', () => {
    if (failed) return void load();
    stopAutoplay();
    if (!audio.paused) { generation++; audio.pause(); }
    else void start();
  });
  next.addEventListener('click', () => {
    const continuePlaying = autoPending || (!audio.paused && !audio.ended);
    stopAutoplay();
    advance(continuePlaying);
  });
  listButton.addEventListener('click', () => {
    dialog.showModal();
    renderList();
    (list.querySelector('[aria-current]') || dialog.querySelector('[data-bgm-close]')).focus();
  });
  dialog.addEventListener('close', () => listButton.focus());
  list.addEventListener('click', event => {
    const id = event.target.closest('[data-bgm-track]')?.dataset.bgmTrack;
    const track = tracks.find(item => item.id === id);
    if (!track) return;
    stopAutoplay();
    if (track !== current()) {
      queue = [track, ...shuffle().filter(item => item !== track)];
      select(0);
    }
    if (audio.paused || audio.ended) void start();
    dialog.close();
  });
  seek.addEventListener('input', () => {
    if (!seek.disabled) audio.currentTime = Number(seek.value);
  });
  for (const name of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) audio.addEventListener(name, progress);
  for (const name of ['play', 'pause', 'ended']) audio.addEventListener(name, button);
  for (const name of ['playing', 'pause', 'seeking', 'seeked', 'durationchange', 'timeupdate']) audio.addEventListener(name, updateLyrics);
  audio.addEventListener('ended', () => advance(true));
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) status.textContent = '음원을 불러오지 못했습니다. 재생 또는 다음 곡을 눌러 주세요.';
  });
  if (document.readyState === 'complete') void load();
  else window.addEventListener('load', load, { once: true });
})();
