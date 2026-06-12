/*
 * ARCANA CTA MODULE
 * 회전형 스피너 금지. idle/hover/loading 모두 막대 파동형 CTA만 관리한다.
 */
window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cta = {
  lineCount: 144,

  init() {
    const layer = document.querySelector('.arcana-cta-wave-layer');
    if (!layer || layer.dataset.ctaReady === '1') return;

    layer.dataset.ctaReady = '1';
    layer.textContent = '';

    const halo = document.createElement('span');
    halo.className = 'arcana-cta-wave-halo';

    const ring = document.createElement('span');
    ring.className = 'arcana-cta-wave-lines';

    for (let index = 0; index < ArcanaApp.cta.lineCount; index += 1) {
      const line = document.createElement('i');
      const waveIndex = index % 36;
      line.style.setProperty('--i', String(index));
      line.style.setProperty('--angle', `${(360 / ArcanaApp.cta.lineCount) * index}deg`);
      line.style.setProperty('--delay', `${-waveIndex * 0.045}s`);
      line.style.setProperty('--tone', `${(index * 2.5) % 360}deg`);
      line.style.setProperty('--amp', `${0.68 + ((index * 7) % 31) / 100}`);
      ring.appendChild(line);
    }

    const text = document.createElement('span');
    text.className = 'arcana-cta-analysis-text';
    text.innerHTML = '<strong>분석 중...</strong><small>잠시만 기다려 주세요</small>';

    layer.appendChild(halo);
    layer.appendChild(ring);
    layer.appendChild(text);
    ArcanaApp.cta.setIdle();
  },

  getPanel() {
    return document.querySelector('[data-panel-key="recommendArcanaCards"]');
  },

  setIdle() {
    const panel = ArcanaApp.cta.getPanel();
    if (!panel) return;
    panel.classList.remove('is-cta-loading');
    panel.dataset.ctaState = 'idle';
  },

  setLoading() {
    const panel = ArcanaApp.cta.getPanel();
    if (!panel) return;
    panel.classList.add('is-cta-loading');
    panel.dataset.ctaState = 'loading';
  },

  setSuccess() {
    ArcanaApp.cta.setIdle();
  },

  setError() {
    ArcanaApp.cta.setIdle();
  }
};
