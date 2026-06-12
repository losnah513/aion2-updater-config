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

    return fallback;
  },

  clearEquipmentOptions() {
    localStorage.removeItem('ARCANA_EQUIPMENT_OPTIONS');
    localStorage.removeItem('ARCANA_RING_OPTIONS');
  },

  saveRingOptions(rings) {
    // legacy 호환 함수. 실제 저장 키는 ARCANA_EQUIPMENT_OPTIONS 하나로 통일한다.
    return ArcanaApp.api.saveEquipmentOptions(rings || {});
  },

  loadRingOptionsFromLocal() {
    // legacy ARCANA_RING_OPTIONS는 자동 복원하지 않는다.
    return ArcanaApp.api.loadEquipmentOptionsFromLocal();
  },

  clearRingOptions() {
    localStorage.removeItem('ARCANA_RING_OPTIONS');
    ArcanaApp.api.clearEquipmentOptions();
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
    const fallbackActiveByClass = {
      templar: ['맹렬한 일격', '연속 난타', '포획', '방패 강타', '심판', '섬광 난무', '쇠약의 맹타', '비호의 일격', '방패 돌격', '섬멸', '징벌', '충격 해제'],
      gladiator: ['예리한 일격', '절단의 맹타', '도약 찍기', '유린의 검', '내려찍기', '검기 난무', '발목 베기', '분쇄 파동', '돌진 일격', '공중 결박', '파멸의 맹타', '충격 해제'],
      assassin: ['암습', '기습', '연쇄 문양 각인', '문양 폭발', '살의', '그림자 낙하', '맹독의 칼날', '신속한 습격', '회피의 계약', '암살', '연막', '충격 해제'],
      ranger: ['강습 화살', '속사', '올가미 화살', '저격', '폭발 화살', '침묵 화살', '덫 설치', '회피 사격', '집중 사격', '관통 화살', '화살 폭풍', '충격 해제'],
      sorcerer: ['화염 화살', '빙결', '화염 폭발', '냉기 파동', '마력 폭발', '수면', '화염 난무', '얼음 창', '마력 집중', '공간 왜곡', '유성 낙하', '충격 해제'],
      elementalist: ['정령 소환', '불꽃 화살', '대지의 사슬', '정령 강화', '흡수의 기운', '폭풍의 정령', '공포', '정령 희생', '마력 회복', '원소 폭발', '정령 보호', '충격 해제'],
      cleric: ['징벌의 번개', '치유의 빛', '쾌유의 섬광', '정화', '신성한 일격', '보호막', '회복의 물결', '부활', '신성한 심판', '쾌속 치유', '구원의 손길', '충격 해제'],
      chanter: ['단죄의 일격', '격려의 주문', '철벽의 주문', '치유의 주문', '연속 타격', '수호의 진언', '진격의 주문', '마력 회복', '승리의 주문', '천벌', '풍요의 진언', '충격 해제']
    };

    const passive = [
      '생존 자세', '보호의 갑옷', '피의 흡수', '약점 파악', '전투 본능',
      '방어 숙련', '기민한 움직임', '마력 저항', '전장의 감각', '집중 강화'
    ];

    const pickByColumnIndex = (list, indexes) => indexes
      .map(index => list[index])
      .filter(Boolean);

    const makeArcanaSkills = active => ({
      // fallback 데이터도 class_skill_db의 공통 아르카나 규칙과 동일하게 유지한다.
      '성배': [...active, ...passive],
      '양피지': pickByColumnIndex(active, [0, 2, 4, 6, 9, 10]),
      '나침반': pickByColumnIndex(active, [1, 3, 5, 7, 8, 11]),
      '종': pickByColumnIndex(passive, [0, 2, 4, 6, 8]),
      '거울': pickByColumnIndex(passive, [1, 3, 5, 7, 9]),
      '천칭': [...active, ...passive]
    });

    const classSkills = {};
    Object.entries(fallbackActiveByClass).forEach(([key, active]) => {
      classSkills[key] = { active, passive, arcanaSkills: makeArcanaSkills(active) };
    });

    return {
      ok: true,
      version: 'ARC-0.3.00',
      targetLevel: 20,
      baseSkillLevel: 10,
      devanionBonus: 4,
      maxCardLevel: 5,
      maxSlotLevel: 4,
      arcanaTypes: ['성배', '양피지', '나침반', '종', '거울', '천칭'],
      skillsByArcana: {},
      classList: ArcanaApp.classSelector ? ArcanaApp.classSelector.normalizeClassList() : [{ key: 'gladiator', name: '검성' }],
      classSkills,
      activeSkills: [],
      passiveSkills: [],
      ownedCards: ArcanaApp.api.loadOwnedCardsFromLocal(),
      source: 'fallback'
    };
  }
};
