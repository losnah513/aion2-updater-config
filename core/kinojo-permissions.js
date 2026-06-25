/*
 * KINOJO PERMISSIONS ENGINE
 * Role: 회원 등급/권한 판단 공통 규칙.
 * Note: level은 내부 비교용이며 UI에는 노출하지 않습니다.
 */
(function(){
  'use strict';

  const ROLE_LEVEL = {
    GUEST: 0,
    MEMBER: 1,
    STAFF: 2,
    MANAGER: 3,
    SUB_MASTER: 4,
    MASTER: 5
  };

  const ROLE_LABEL = {
    GUEST: 'Guest',
    MEMBER: 'Member',
    STAFF: 'Staff',
    MANAGER: 'Manager',
    SUB_MASTER: 'Sub Master',
    MASTER: 'Master'
  };

  const labels = Object.assign({}, ROLE_LABEL);

  function normalizeRole(source){
    const rawSource = (source && typeof source === 'object')
      ? (source.role || source.role_label || source.roleLabel || source.level || '')
      : source;
    const raw = String(rawSource || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

    if(raw === 'MASTER') return 'MASTER';
    if(raw === 'SUB_MASTER' || raw === 'SUBMASTER') return 'SUB_MASTER';
    if(raw === 'MANAGER' || raw === 'ADMIN') return 'MANAGER';
    if(raw === 'STAFF') return 'STAFF';
    if(raw === 'MEMBER' || raw === 'TESTER') return 'MEMBER';
    if(raw === 'GUEST' || raw === 'VISITOR') return 'GUEST';

    const level = (source && typeof source === 'object') ? Number(source.level || 0) : Number(source || 0);
    if(level >= 5) return 'MASTER';
    if(level >= 4) return 'SUB_MASTER';
    if(level >= 3) return 'MANAGER';
    if(level >= 2) return 'STAFF';
    if(level >= 1) return 'MEMBER';
    return 'GUEST';
  }

  function labelOf(source){ return ROLE_LABEL[normalizeRole(source)] || 'Guest'; }
  function levelOf(source){ return ROLE_LEVEL[normalizeRole(source)] || 0; }
  function hasLevel(source, requiredLevel){ return levelOf(source) >= Number(requiredLevel || 0); }
  function canManage(source){ return hasLevel(source, 3); }
  function canEditSanctuary(account){
    if(canManage(account)) return true;
    const perms = String(account?.permissions || account?.permission || '');
    return /(^|[,\s])sanctuary_edit($|[,\s])/.test(perms);
  }
  function canReact(account){ return hasLevel(account, 1); }
  function canCrawl(account){ return hasLevel(account, 1); }

  window.KinojoPermissions = {
    version:'1.3.1.26',
    ROLE_LEVEL,
    ROLE_LABEL,
    labels,
    normalizeRole,
    labelOf,
    levelOf,
    hasLevel,
    canManage,
    canEditSanctuary,
    canReact,
    canCrawl
  };
})();
