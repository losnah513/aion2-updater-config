function ARC_normalizeSkillName(value) {
  return String(value || '').trim();
}

function ARC_toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
