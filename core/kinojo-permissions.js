/*
 * KINOJO PERMISSIONS ENGINE
 * Role: 회원 등급/권한 판단 공통 규칙.
 */
(function(){
  'use strict';
  const ROLE_LEVEL = { GUEST:0, MEMBER:1, MANAGER:3, SUB_MASTER:4, MASTER:5 };
  const labels = { 0:'관람객', 1:'참여자', 2:'팀원', 3:'팀장', 4:'운영진', 5:'관리자' };
  function normalizeRole(source){
    const raw = String(source?.role || source || '').toUpperCase();
    if(raw === 'MASTER' || raw === 'SUB_MASTER' || raw === 'MANAGER' || raw === 'MEMBER') return raw;
    const level = typeof source === 'object' ? Number(source?.level || 0) : Number(source || 0);
    if(level >= 5) return 'MASTER';
    if(level >= 4) return 'SUB_MASTER';
    if(level >= 3) return 'MANAGER';
    if(level >= 1) return 'MEMBER';
    return 'GUEST';
  }
  function levelOf(source){ return ROLE_LEVEL[normalizeRole(source)] || 0; }
  function hasLevel(source, requiredLevel){ return levelOf(source) >= Number(requiredLevel || 0); }
  function canManage(source){ return hasLevel(source, 3); }
  function canEditSanctuary(account){
    if(canManage(account)) return true;
    const perms = String(account?.permissions || account?.permission || '');
    return /(^|[,\s])sanctuary_edit($|[,\s])/.test(perms);
  }
  function canReact(account){ return hasLevel(account, 1); }
  window.KinojoPermissions = { version:'1.3.1.17', labels, normalizeRole, levelOf, hasLevel, canManage, canEditSanctuary, canReact };
})();
