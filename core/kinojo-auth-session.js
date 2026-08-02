/*
 * KINOJO Auth Session Core
 * 책임: 브라우저 세션 저장/복원, 권한 기본 판정, auth-changed 이벤트.
 * DOM 생성과 Server 통신은 담당하지 않습니다.
 */
(function(){
  'use strict';
  const STORAGE_KEY='kinojo_login_session_v1';
  const ACCOUNT_KEY='kinojo_login_account_v1';
  const IDLE_LOGOUT_MS=10*60*1000;
  const IDLE_WARNING_MS=60*1000;
  const ACTIVITY_WRITE_THROTTLE_MS=15*1000;
  const AUTH_SCHEMA_VERSION='supabase-passkey-v4-20260625';
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_err){return null;}}
  function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function migrateAuthCacheIfNeeded(){try{const key='kinojo_auth_schema_version';if(localStorage.getItem(key)===AUTH_SCHEMA_VERSION)return;localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(ACCOUNT_KEY);localStorage.setItem(key,AUTH_SCHEMA_VERSION);}catch(_err){}}
  function emitAuthChanged(session,account){window.dispatchEvent(new CustomEvent('kinojo:auth-changed',{detail:{loggedIn:!!(session&&session.token),session:session||null,account:account||null}}));}
  function getSession(){const session=readJson(STORAGE_KEY);if(!session||!session.token)return null;const last=Number(session.lastActivityAt||0);if(!last){if(Number(session.expiresAt||0)&&Date.now()>Number(session.expiresAt)){clearStoredSession();return null;}session.lastActivityAt=Date.now();delete session.expiresAt;writeJson(STORAGE_KEY,session);return session;}if(Date.now()-last>=IDLE_LOGOUT_MS+IDLE_WARNING_MS){clearStoredSession();return null;}return session;}
  function getAccount(){return readJson(ACCOUNT_KEY);}
  function setStoredSession(session,account){const next=Object.assign({},session||{},{lastActivityAt:Date.now()});delete next.expiresAt;writeJson(STORAGE_KEY,next);writeJson(ACCOUNT_KEY,account||{});emitAuthChanged(next,account);return next;}
  function clearStoredSession(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(ACCOUNT_KEY);emitAuthChanged(null,null);}
  function isLoggedIn(){return !!getSession();}
  function getToken(){return getSession()?.token||'';}
  function roleOf(source){if(!source)return '';if(window.KinojoPermissions&&typeof window.KinojoPermissions.normalizeRole==='function'){const role=window.KinojoPermissions.normalizeRole(source);return role==='GUEST'?'':role;}const raw=String(source?.role||source?.roleLabel||source?.role_label||'').trim().toUpperCase().replace(/[\s-]+/g,'_');if(['MASTER','SUB_MASTER','MANAGER','STAFF','MEMBER'].includes(raw))return raw;const level=Number(source?.level||0);return level>=5?'MASTER':level>=4?'SUB_MASTER':level>=3?'MANAGER':level>=2?'STAFF':level>=1?'MEMBER':'';}
  function roleLabel(role){return ({MASTER:'Master',SUB_MASTER:'Sub Master',MANAGER:'Manager',STAFF:'Staff',MEMBER:'Member',GUEST:'Guest'}[role]||'Guest');}
  function canOpenManage(role){if(window.KinojoPermissions&&typeof window.KinojoPermissions.canOpenAdmin==='function')return window.KinojoPermissions.canOpenAdmin(role);return ['MASTER','SUB_MASTER','MANAGER','STAFF'].includes(role);}
  function getLevel(){const role=roleOf(getSession());return role==='MASTER'?5:role==='SUB_MASTER'?4:role==='MANAGER'?3:role==='STAFF'?2:role==='MEMBER'?1:0;}
  function isAdmin(){return canOpenManage(roleOf(getSession()));}
  function canManageAccounts(role){return ['MASTER','SUB_MASTER','MANAGER'].includes(String(role||''));}
  migrateAuthCacheIfNeeded();
  window.KinojoAuthSessionCore=Object.freeze({STORAGE_KEY,ACCOUNT_KEY,IDLE_LOGOUT_MS,IDLE_WARNING_MS,ACTIVITY_WRITE_THROTTLE_MS,readJson,writeJson,getSession,getAccount,setStoredSession,clearStoredSession,isLoggedIn,getToken,roleOf,roleLabel,canOpenManage,getLevel,isAdmin,canManageAccounts});
})();
