/*
 * ARCANA CTA MODULE
 * 독립 CTA 컴포넌트.
 * 회전형 스피너 금지. idle/hover/loading 모두 막대 길이가 변하는 파동형 CTA만 관리한다.
 * 추천 엔진은 이 모듈에 상태 전환만 요청하고 DOM/CSS를 직접 조작하지 않는다.
 */
window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cta = {
  lineCount: 144,
  minLoadingMs: 4200,
  messageStepMs: 720,
  _loadingStartedAt: 0,
  _messageTimer: null,
  _messageIndex: 0,
  _messages: [],

  init() {
    const layer = ArcanaApp.cta.getLayer();
    if (!layer) return;

    if (layer.dataset.ctaReady !== '1') {
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
      text.setAttribute('aria-live', 'polite');
      text.innerHTML = '<strong>추천 준비</strong><small>조건을 확인하면 분석을 시작할게요.</small>';

      layer.appendChild(halo);
      layer.appendChild(ring);
      layer.appendChild(text);
    }

    ArcanaApp.cta.setIdle();
  },

  getPanel() {
    return document.querySelector('[data-panel-key="recommendArcanaCards"]');
  },

  getLayer() {
    return document.querySelector('.arcana-cta-wave-layer');
  },

  getTextNode() {
    const layer = ArcanaApp.cta.getLayer();
    return layer ? layer.querySelector('.arcana-cta-analysis-text') : null;
  },

  hasOwnedArcana() {
    const owned = (ArcanaApp.state && ArcanaApp.state.ownedCards) || {};
    return Object.values(owned).some(levelMap => levelMap && Object.values(levelMap).some(value => Number(value) > 0));
  },

  hasSavedRings() {
    const rings = (ArcanaApp.state && (ArcanaApp.state.ringOptions || ArcanaApp.state.equipmentOptions)) || {};
    return Object.values(rings).some(optionList => Array.isArray(optionList) && optionList.some(Boolean));
  },

  hasTargetSkills() {
    const skills = (ArcanaApp.state && ArcanaApp.state.selectedTargetSkills) || [];
    return Array.isArray(skills) && skills.length > 0;
  },

  buildLoadingMessages() {
    const hasOwned = ArcanaApp.cta.hasOwnedArcana();
    const hasRings = ArcanaApp.cta.hasSavedRings();
    const hasAnySavedData = hasOwned || hasRings;

    const messages = [
      ['아르카나 정보를 읽고 있어요', hasOwned ? '저장된 보유 아르카나를 먼저 확인합니다.' : '저장된 보유 아르카나가 있는지 확인합니다.'],
      ['요청한 스킬 레벨을 확인했어요', ArcanaApp.cta.hasTargetSkills() ? '16/20 목표를 나누어 계산할게요.' : '목표 스킬 정보를 다시 확인하고 있어요.'],
      ['반지 옵션을 확인하고 있어요', hasRings ? '저장된 반지 옵션은 현실 데이터로 유지합니다.' : '저장된 반지 옵션이 없으면 필요한 만큼만 자동 활용합니다.']
    ];

    if (hasAnySavedData) {
      messages.push(['저장한 내용을 바탕으로 추천할게요', '현재 세팅을 최대한 유지하면서 부족분만 계산합니다.']);
    } else {
      messages.push(['따로 저장하신 내용이 없어요', '전체 아르카나를 기준으로 계산을 시작합니다.']);
      messages.push(['최적 세팅으로 추천해드릴게요', '모든 아르카나 후보를 비교해 현실적인 조합을 찾습니다.']);
    }

    messages.push(['제작 난이도를 함께 고려하고 있어요', 'Lv4와 반지 사용을 최소화하는 방향으로 정리합니다.']);
    return messages;
  },

  setText(title, description) {
    const text = ArcanaApp.cta.getTextNode();
    if (!text) return;
    text.classList.remove('is-changing');
    // reflow로 문구 전환 애니메이션을 안정적으로 재시작한다.
    void text.offsetWidth;
    text.classList.add('is-changing');
    text.innerHTML = `<strong>${ArcanaApp.cta.escapeHtml(title)}</strong><small>${ArcanaApp.cta.escapeHtml(description || '')}</small>`;
  },

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  clearMessageTimer() {
    if (ArcanaApp.cta._messageTimer) {
      window.clearInterval(ArcanaApp.cta._messageTimer);
      ArcanaApp.cta._messageTimer = null;
    }
  },

  startMessageSequence(messages) {
    ArcanaApp.cta.clearMessageTimer();
    ArcanaApp.cta._messages = messages && messages.length ? messages : ArcanaApp.cta.buildLoadingMessages();
    ArcanaApp.cta._messageIndex = 0;

    const show = () => {
      const message = ArcanaApp.cta._messages[ArcanaApp.cta._messageIndex % ArcanaApp.cta._messages.length];
      ArcanaApp.cta.setText(message[0], message[1]);
      ArcanaApp.cta._messageIndex += 1;
    };

    show();
    ArcanaApp.cta._messageTimer = window.setInterval(show, ArcanaApp.cta.messageStepMs);
  },

  setIdle() {
    const panel = ArcanaApp.cta.getPanel();
    ArcanaApp.cta.clearMessageTimer();
    if (!panel) return;
    panel.classList.remove('is-cta-loading', 'is-cta-complete', 'is-cta-error');
    panel.dataset.ctaState = 'idle';
    ArcanaApp.cta.setText('추천 준비', '조건을 확인하면 분석을 시작할게요.');
  },

  setLoading(options = {}) {
    const panel = ArcanaApp.cta.getPanel();
    if (!panel) return;
    panel.classList.remove('is-cta-complete', 'is-cta-error');
    panel.classList.add('is-cta-loading');
    panel.dataset.ctaState = 'loading';
    ArcanaApp.cta._loadingStartedAt = Date.now();
    ArcanaApp.cta.startMessageSequence(options.messages || ArcanaApp.cta.buildLoadingMessages());
  },

  async waitForMinimumDuration(minMs) {
    const startedAt = ArcanaApp.cta._loadingStartedAt || Date.now();
    const minimum = Number(minMs || ArcanaApp.cta.minLoadingMs || 4200);
    const elapsed = Date.now() - startedAt;
    const remain = Math.max(0, minimum - elapsed);
    if (remain > 0) {
      await new Promise(resolve => window.setTimeout(resolve, remain));
    }
  },

  async finishAfterMinimumDelay(success = true, minMs) {
    await ArcanaApp.cta.waitForMinimumDuration(minMs);
    if (success) {
      ArcanaApp.cta.setSuccess();
    } else {
      ArcanaApp.cta.setError();
    }
  },

  setSuccess() {
    const panel = ArcanaApp.cta.getPanel();
    ArcanaApp.cta.clearMessageTimer();
    if (!panel) return;
    panel.classList.remove('is-cta-loading', 'is-cta-error');
    panel.classList.add('is-cta-complete');
    panel.dataset.ctaState = 'complete';
    ArcanaApp.cta.setText('추천 결과가 준비됐어요', '분석 탭과 추천 가이드를 확인해보세요.');
    window.setTimeout(() => ArcanaApp.cta.setIdle(), 680);
  },

  setError() {
    const panel = ArcanaApp.cta.getPanel();
    ArcanaApp.cta.clearMessageTimer();
    if (!panel) return;
    panel.classList.remove('is-cta-loading', 'is-cta-complete');
    panel.classList.add('is-cta-error');
    panel.dataset.ctaState = 'error';
    ArcanaApp.cta.setText('추천 계산을 멈췄어요', '입력값을 확인한 뒤 다시 시도해주세요.');
    window.setTimeout(() => ArcanaApp.cta.setIdle(), 1200);
  }
};
