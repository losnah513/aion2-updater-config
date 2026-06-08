window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.state = {
  version: 'ARC-0.1.00',
  targetLevel: 20,
  devanionBonus: 4,
  maxTargetSkills: 7,
  maxCardLevel: 5,
  maxSlotLevel: 4,
  currentClassKey: 'gladiator',
  classList: [
    { key: 'gladiator', name: '검성' }
  ],
  activeSkills: [],
  passiveSkills: [],
  classSkills: {},
  arcanaTypes: ['성배', '양피지', '나침반', '종', '겨울', '천칭'],
  skillsByArcana: {},
  selectedTargetSkills: [],
  characterLevels: {},
  equipmentTypes: [
    { key: 'weapon', label: '무기', slots: 6 },
    { key: 'guarder', label: '가더', slots: 6 },
    { key: 'ring1', label: '반지1', slots: 6 },
    { key: 'ring2', label: '반지2', slots: 6 }
  ],
  selectedEquipmentKeys: [],
  equipmentOptions: {
    weapon: [],
    guarder: [],
    ring1: [],
    ring2: []
  },
  ringOptions: {
    ring1: [],
    ring2: []
  },
  ownedCards: {},
  recommendationCards: {}
};
