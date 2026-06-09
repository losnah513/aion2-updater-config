window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.state = {
  version: 'ARC-0.2.03',
  targetLevel: 20,
  baseSkillLevel: 10,
  devanionBonus: 4,
  maxTargetSkills: 7,
  maxCardLevel: 5,
  maxSlotLevel: 4,
  currentClassKey: '',
  pendingClassKey: '',
  hasSelectedClass: false,
  hasSeenClassShowcase: false,
  showcaseSelectedKey: '',
  classList: [],
  activeSkills: [],
  passiveSkills: [],
  classSkills: {},
  arcanaTypes: ['성배', '양피지', '나침반', '종', '겨울', '천칭'],
  skillsByArcana: {},
  selectedTargetSkills: [],
  characterLevels: {},
  equipmentTypes: [
    { key: 'ring1', label: '반지1', slots: 6 },
    { key: 'ring2', label: '반지2', slots: 6 }
  ],
  selectedEquipmentKeys: [],
  equipmentOptions: {
    ring1: [],
    ring2: []
  },
  ringOptions: {
    ring1: [],
    ring2: []
  },
  ownedCards: {},
  recommendationCards: {},
  recommendationMeta: null,
  recommendationGenerated: false,
  recommendationTab: 'cards'
};
