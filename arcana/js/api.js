window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.api = {
  jsonpIndex: 0,

  loadInitialData() {
    const apiUrl = ArcanaApp.config && ArcanaApp.config.apiUrl;

    if (!apiUrl) {
      return Promise.resolve(ArcanaApp.api.getFallbackData());
    }

    return ArcanaApp.api
      .requestJsonp('getInitialData')
      .then(data => {
        if (!data || data.ok === false) {
          throw new Error(data && data.message ? data.message : '초기 데이터를 불러오지 못했습니다.');
        }
        return data;
      })
      .catch(error => {
        console.warn('[Arcana] API 연결 실패. 임시 데이터로 실행합니다.', error);
        return ArcanaApp.api.getFallbackData();
      });
  },

  requestJsonp(action, params = {}) {
    return new Promise((resolve, reject) => {
      const apiUrl = ArcanaApp.config.apiUrl;
      const callbackName = `ARC_JSONP_CALLBACK_${Date.now()}_${ArcanaApp.api.jsonpIndex++}`;
      const script = document.createElement('script');
      const timeoutMs = ArcanaApp.config.requestTimeoutMs || 12000;
      const query = new URLSearchParams({ action, callback: callbackName, ...params });

      let finished = false;
      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('API 요청 시간이 초과되었습니다.'));
      }, timeoutMs);

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = payload => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('API 스크립트 로딩에 실패했습니다.'));
      };

      script.src = `${apiUrl}?${query.toString()}`;
      document.body.appendChild(script);
    });
  },

  saveOwnedCards(ownedCards) {
    localStorage.setItem('ARCANA_OWNED_CARDS', JSON.stringify(ownedCards || {}));
    return Promise.resolve({ ok: true, local: true });
  },

  loadOwnedCardsFromLocal() {
    return ArcanaApp.api.readLocalObject('ARCANA_OWNED_CARDS', {});
  },

  clearOwnedCards() {
    localStorage.removeItem('ARCANA_OWNED_CARDS');
  },

  saveCharacterLevels(levels) {
    localStorage.setItem('ARCANA_CHARACTER_LEVELS', JSON.stringify(levels || {}));
    return Promise.resolve({ ok: true, local: true });
  },

  loadCharacterLevelsFromLocal() {
    return ArcanaApp.api.readLocalObject('ARCANA_CHARACTER_LEVELS', {});
  },

  clearCharacterLevels() {
    localStorage.removeItem('ARCANA_CHARACTER_LEVELS');
  },

  saveEquipmentOptions(options) {
    localStorage.setItem('ARCANA_EQUIPMENT_OPTIONS', JSON.stringify(options || {}));
    return Promise.resolve({ ok: true, local: true });
  },

  loadEquipmentOptionsFromLocal() {
    const fallback = { ring1: [], ring2: [] };
    const equipment = ArcanaApp.api.readLocalObject('ARCANA_EQUIPMENT_OPTIONS', null);

    if (equipment) {
      return {
        ring1: equipment.ring1 || [],
        ring2: equipment.ring2 || []
      };
    }

    const oldRings = ArcanaApp.api.readLocalObject('ARCANA_RING_OPTIONS', fallback);
    return { ring1: oldRings.ring1 || [], ring2: oldRings.ring2 || [] };
  },

  clearEquipmentOptions() {
    localStorage.removeItem('ARCANA_EQUIPMENT_OPTIONS');
    localStorage.removeItem('ARCANA_RING_OPTIONS');
  },

  saveRingOptions(rings) {
    localStorage.setItem('ARCANA_RING_OPTIONS', JSON.stringify(rings || {}));
    return Promise.resolve({ ok: true, local: true });
  },

  loadRingOptionsFromLocal() {
    return ArcanaApp.api.readLocalObject('ARCANA_RING_OPTIONS', { ring1: [], ring2: [] });
  },

  clearRingOptions() {
    localStorage.removeItem('ARCANA_RING_OPTIONS');
  },

  readLocalObject(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  },

  mergeOwnedCards(serverOwnedCards) {
    const localOwnedCards = ArcanaApp.api.loadOwnedCardsFromLocal();
    return Object.keys(localOwnedCards).length > 0 ? localOwnedCards : (serverOwnedCards || {});
  },

  getFallbackData() {
    const active = [
      '예리한 일격', '절단의 맹타', '도약 찍기', '유린의 검',
      '내려찍기', '검기 난무', '발목 베기', '분쇄 파동',
      '돌진 일격', '공중 결박', '파멸의 맹타', '충격 해제'
    ];

    const arcanaSkills = {
      '성배': active,
      '양피지': ['예리한 일격', '도약 찍기', '내려찍기', '발목 베기', '공중 결박', '파멸의 맹타'],
      '나침반': ['절단의 맹타', '유린의 검', '분쇄 파동', '돌진 일격', '충격 해제', '파멸의 맹타'],
      '종': ['생존 자세', '보호의 갑옷', '피의 흡수', '약점 파악', '전투 본능'],
      '거울': ['생존 자세', '보호의 갑옷', '피의 흡수', '약점 파악', '전투 본능'],
      '천칭': active
    };

    return {
      ok: true,
      version: 'ARC-0.2.04',
      targetLevel: 20,
      baseSkillLevel: 10,
      devanionBonus: 4,
      maxCardLevel: 5,
      maxSlotLevel: 4,
      arcanaTypes: ['성배', '양피지', '나침반', '종', '거울', '천칭'],
      skillsByArcana: {},
      classList: ArcanaApp.classSelector ? ArcanaApp.classSelector.normalizeClassList() : [{ key: 'gladiator', name: '검성' }],
      classSkills: {
        gladiator: {
          active,
          passive: ['생존 자세', '보호의 갑옷', '피의 흡수', '약점 파악', '전투 본능'],
          arcanaSkills
        }
      },
      activeSkills: [],
      passiveSkills: [],
      ownedCards: ArcanaApp.api.loadOwnedCardsFromLocal(),
      source: 'fallback'
    };
  }
};
