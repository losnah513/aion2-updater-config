(function () {
  'use strict';
  const root = document.querySelector('[data-home-bgm]');
  if (!root) return;
  const title = root.querySelector('[data-bgm-title]');
  const play = root.querySelector('[data-bgm-play]');
  const next = root.querySelector('[data-bgm-next]');
  const seek = root.querySelector('[data-bgm-seek]');
  const time = root.querySelector('[data-bgm-time]');
  const status = root.querySelector('[data-bgm-status]');
  const audio = root.querySelector('audio');
  let tracks = [], index = 0, loading = false, failed = false, generation = 0;
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
  function select(i) {
    generation++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    index = i;
    title.textContent = tracks[index]?.title || '등록된 곡이 없습니다';
    next.disabled = tracks.length < 2;
    play.disabled = tracks.length === 0;
    status.textContent = '';
    progress();
    button();
  }
  async function start() {
    const track = tracks[index];
    if (!track) return;
    const attempt = ++generation;
    status.textContent = '';
    if (!audio.getAttribute('src') || audio.error) audio.src = track.url;
    try { await audio.play(); }
    catch {
      if (attempt === generation) status.textContent = '재생할 수 없습니다. 다시 재생하거나 다음 곡을 선택해 주세요.';
    }
    button();
  }
  function advance(continuePlaying) {
    if (!tracks.length) return;
    select((index + 1) % tracks.length);
    if (continuePlaying) void start();
  }
  async function load() {
    if (loading) return;
    loading = true;
    play.disabled = true;
    title.textContent = '곡 목록 불러오는 중…';
    status.textContent = '';
    try {
      const client = window.KinojoSupabaseClientCore;
      const config = await client.ensureConfig();
      const response = await fetch(config.url + '/functions/v1/kinojo-home-bgm?action=playlist', {
        headers: client.headers(config), signal: AbortSignal.timeout(12000), cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !Array.isArray(result.tracks)) throw new Error('playlist');
      tracks = result.tracks.filter(t => /^[0-9a-f-]{36}$/i.test(t.id) &&
        ['mp3', 'm4a', 'ogg'].includes(t.extension) && typeof t.title === 'string').map(t => ({
        title: t.title,
        url: config.url + '/storage/v1/object/public/kinojo-home-bgm/' + t.id + '.' + t.extension
      }));
      failed = false;
      select(0);
    } catch {
      failed = true;
      title.textContent = 'BGM 목록을 불러오지 못했습니다';
      play.disabled = false;
      button();
    } finally { loading = false; }
  }
  play.addEventListener('click', () => {
    if (failed) return void load();
    if (!audio.paused) { generation++; audio.pause(); }
    else void start();
  });
  next.addEventListener('click', () => advance(!audio.paused && !audio.ended));
  seek.addEventListener('input', () => {
    if (!seek.disabled) audio.currentTime = Number(seek.value);
  });
  for (const name of ['timeupdate', 'durationchange', 'loadedmetadata', 'emptied']) audio.addEventListener(name, progress);
  for (const name of ['play', 'pause', 'ended']) audio.addEventListener(name, button);
  audio.addEventListener('ended', () => advance(true));
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) status.textContent = '음원을 불러오지 못했습니다. 재생 또는 다음 곡을 눌러 주세요.';
  });
  if (document.readyState === 'complete') void load();
  else window.addEventListener('load', load, { once: true });
})();
