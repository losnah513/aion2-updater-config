/*
 * KINOJO CACHE ENGINE
 * Role: 페이지별 임시 데이터 캐시/TTL 공통 관리.
 */
(function(){
  'use strict';
  const memory = new Map();
  const ttl = {
    sanctuary:60 * 1000,
    hall:5 * 60 * 1000,
    account:60 * 1000,
    tips:30 * 60 * 1000
  };
  function now(){ return Date.now(); }
  function pack(value, ttlMs){ return { value, expiresAt: ttlMs ? now() + Number(ttlMs) : 0 }; }
  function unpack(item){
    if(!item) return null;
    if(item.expiresAt && now() > Number(item.expiresAt)) return null;
    return item.value;
  }
  function set(key, value, ttlMs){ memory.set(String(key), pack(value, ttlMs)); return value; }
  function get(key){
    const k = String(key);
    const value = unpack(memory.get(k));
    if(value === null && memory.has(k)) memory.delete(k);
    return value;
  }
  function remove(key){ memory.delete(String(key)); }
  function clear(prefix){
    if(!prefix){ memory.clear(); return; }
    const p = String(prefix);
    Array.from(memory.keys()).forEach(key=>{ if(key.startsWith(p)) memory.delete(key); });
  }
  function storageKey(key){ return 'kinojo_cache_' + String(key); }
  function setSession(key, value, ttlMs){
    try{ sessionStorage.setItem(storageKey(key), JSON.stringify(pack(value, ttlMs))); }catch(_err){}
    return value;
  }
  function getSession(key){
    try{
      const k = storageKey(key);
      const item = JSON.parse(sessionStorage.getItem(k) || 'null');
      const value = unpack(item);
      if(value === null) sessionStorage.removeItem(k);
      return value;
    }catch(_err){ return null; }
  }
  window.KinojoCache = { version:'1.3.1.17', ttl, set, get, remove, clear, setSession, getSession, clearAll:()=>clear() };
})();
