const ARC_VERSION = 'ARC-0.2.02';
const ARC_TARGET_LEVEL = 20;
const ARC_BASE_SKILL_LEVEL = 10;
const ARC_DEVANION_BONUS = 4;
const ARC_MAX_SLOT_LEVEL = 4;
const ARC_MAX_CARD_LEVEL = 5;
const ARC_ARCANA_TYPES = ['성배', '양피지', '나침반', '종', '겨울', '천칭'];
const ARC_OWNED_CARD_PROPERTY_KEY = 'ARCANA_OWNED_CARDS';
const ARC_CLASS_SHEET_PREFIX = 'skill_db_';

const ARC_CLASS_DISPLAY_ORDER = [
  '수호성',
  '검성',
  '살성',
  '궁성',
  '마도성',
  '정령성',
  '치유성',
  '호법성'
];

const ARC_CLASS_LIST_FALLBACK = [
  { key: 'templar', name: '수호성', sheetNames: ['skill_db_templar', 'skill_db_guardian'] },
  { key: 'gladiator', name: '검성', sheetNames: ['skill_db_gladiator', 'skill_db_gladiatior'] },
  { key: 'assassin', name: '살성', sheetNames: ['skill_db_assassin'] },
  { key: 'ranger', name: '궁성', sheetNames: ['skill_db_ranger'] },
  { key: 'sorcerer', name: '마도성', sheetNames: ['skill_db_sorcerer'] },
  { key: 'elementalist', name: '정령성', sheetNames: ['skill_db_elementalist', 'skill_db_spiritmaster'] },
  { key: 'cleric', name: '치유성', sheetNames: ['skill_db_cleric'] },
  { key: 'chanter', name: '호법성', sheetNames: ['skill_db_chanter'] }
];
