/*
 * ARCANA CTA MODULE
 * 독립 CTA 컴포넌트.
 * 회전형/오브형 CTA 금지.
 * 중심 원을 기준으로 바깥쪽으로 길어지는 방사형 막대 CTA만 관리한다.
 */
window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cta = {
  lineCount: 144,
  minLoadingMs: 5200,
  messageStepMs: 920,
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
      layer.appendChild(ArcanaApp.cta.createWaveSvg());
    }

    ArcanaApp.cta.setIdle();
  },

  createWaveSvg() {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.classList.add('arcana-cta-wave-svg');
    svg.setAttribute('viewBox', '-160 -160 320 320');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const softRing = document.createElementNS(svgNs, 'circle');
    softRing.classList.add('arcana-cta-soft-ring');
    softRing.setAttribute('cx', '0');
    softRing.setAttribute('cy', '0');
    softRing.setAttribute('r', '64');
    svg.appendChild(softRing);

    const innerRing = document.createElementNS(svgNs, 'circle');
    innerRing.classList.add('arcana-cta-inner-ring');
    innerRing.setAttribute('cx', '0');
    innerRing.setAttribute('cy', '0');
    innerRing.setAttribute('r', '65');
    svg.appendChild(innerRing);

    const lineGroup = document.createElementNS(svgNs, 'g');
    lineGroup.classList.add('arcana-cta-wave-lines');
    svg.appendChild(lineGroup);

    const count = ArcanaApp.cta.lineCount;
    const innerRadius = 70;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const degree = (360 * index) / count;
      // 불규칙한 외곽 파도 형태를 만들기 위해 여러 주기의 파형을 합성한다.
      const organic =
        Math.sin(angle * 3.0 + 0.35) * 10 +
        Math.sin(angle * 7.0 - 1.1) * 7 +
        Math.sin(angle * 11.0 + 1.7) * 4;
      const long = Math.max(36, Math.min(72, 52 + organic));
      const hover = Math.max(30, long - 10);
      const mid = Math.max(20, long - 22);
      const soft = Math.max(16, long - 30);
      const idle = Math.max(10, long - 38);
      const outerRadius = innerRadius + long;
      const x1 = Math.cos(angle) * innerRadius;
      const y1 = Math.sin(angle) * innerRadius;
      const x2 = Math.cos(angle) * outerRadius;
      const y2 = Math.sin(angle) * outerRadius;

      const line = document.createElementNS(svgNs, 'line');
      line.classList.add('arcana-cta-wave-line');
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
      line.style.setProperty('--idle', idle.toFixed(1));
      line.style.setProperty('--soft', soft.toFixed(1));
      line.style.setProperty('--mid', mid.toFixed(1));
      line.style.setProperty('--hover', hover.toFixed(1));
      line.style.setProperty('--long', long.toFixed(1));
      line.style.setProperty('--delay', `${-(index % 48) * 0.035}s`);
      line.style.setProperty('--tone', `${185 + ((degree + index * 3) % 170)}deg`);
      line.style.setProperty('--alpha', `${0.28 + ((index * 13) % 38) / 100}`);
      lineGroup.appendChild(line);
    }

    return svg;
  },

  getPanel() {
    return document.querySelector('[data-panel-key="recommendArcanaCards"]');
  },

  getLayer() {
    return document.querySelector('.arcana-cta-wave-layer');
  },

  getButton() {
    return document.getElementById('arcanaRunSimulation');
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
      ['정보 확인중', hasOwned ? '저장된 아르카나를 읽고 있어요.' : '아르카나 정보를 확인하고 있어요.'],
      ['목표 확인중', ArcanaApp.cta.hasTargetSkills() ? '요청한 16/20레벨 목표를 계산해요.' : '요청한 스킬 레벨을 확인하고 있어요.'],
      ['반지 확인중', hasRings ? '저장된 반지 옵션을 유지해요.' : '부족한 만큼만 반지를 계산해요.']
    ];

    if (hasAnySavedData) {
      messages.push(['저장 기준 분석중', '저장한 내용을 바탕으로 추천해요.']);
    } else {
      messages.push(['전체 기준 분석중', '저장된 내용이 없어 전체 후보를 비교해요.']);
      messages.push(['최적 세팅 탐색중', '모든 아르카나를 기준으로 추천해요.']);
    }

    messages.push(['난이도 계산중', '필요한 4레벨은 우선 활용해요.']);
    return messages;
  },

  setButtonText(title, description) {
    const button = ArcanaApp.cta.getButton();
    if (!button) return;
    const safeTitle = ArcanaApp.cta.escapeHtml(title || '추천 시작');
    const safeDesc = ArcanaApp.cta.escapeHtml(description || '클릭하여 분석을 시작하세요');
    button.innerHTML = `<span class="arcana-cta-main">${safeTitle}</span><span class="arcana-cta-sub">${safeDesc}</span>`;
    button.setAttribute('aria-label', `${title || '추천 시작'} ${description || ''}`.trim());
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
      ArcanaApp.cta.setButtonText(message[0], message[1]);
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
    ArcanaApp.cta.setButtonText('추천 시작', '클릭하여 분석을 시작하세요');
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
    const minimum = Number(minMs || ArcanaApp.cta.minLoadingMs || 5200);
    const elapsed = Date.now() - startedAt;
    const remain = Math.max(0, minimum - elapsed);
    if (remain > 0) {
      await new Promise(resolve => window.setTimeout(resolve, remain));
    }
  },

  async finishAfterMinimumDelay(success = true, minMs) {
    await ArcanaApp.cta.waitForMinimumDuration(minMs);
    success ? ArcanaApp.cta.setSuccess() : ArcanaApp.cta.setError();
  },

  setSuccess() {
    const panel = ArcanaApp.cta.getPanel();
    ArcanaApp.cta.clearMessageTimer();
    if (!panel) return;
    panel.classList.remove('is-cta-loading', 'is-cta-error');
    panel.classList.add('is-cta-complete');
    panel.dataset.ctaState = 'complete';
    ArcanaApp.cta.setButtonText('준비 완료', '결과를 확인해보세요');
    window.setTimeout(() => ArcanaApp.cta.setIdle(), 700);
  },

  setError() {
    const panel = ArcanaApp.cta.getPanel();
    ArcanaApp.cta.clearMessageTimer();
    if (!panel) return;
    panel.classList.remove('is-cta-loading', 'is-cta-complete');
    panel.classList.add('is-cta-error');
    panel.dataset.ctaState = 'error';
    ArcanaApp.cta.setButtonText('계산 중단', '입력값을 확인해주세요');
    window.setTimeout(() => ArcanaApp.cta.setIdle(), 1400);
  }
};
