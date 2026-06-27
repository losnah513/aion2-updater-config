/*
 * KINOJO API ENGINE
 * Role: Server Engine 우선 / Apps Script legacy API 호출 공통 래퍼.
 * Rule: 각 페이지가 fetch를 직접 늘리지 않고 이 파일을 통해 GET/POST/action 호출을 공유합니다.
 */
(function(){
  'use strict';
  const DEFAULT_API_URL = '';

  function getBaseUrl(){
    // Server Engine 이관 후 GitHub Pages는 Apps Script URL로 fallback하지 않는다.
    // ?api= 값은 로컬 진단용으로만 허용하며, 기본 동작은 KinojoSupabase.webAction이다.
    const param = new URLSearchParams(location.search || '').get('api');
    if(param) return param;
    return DEFAULT_API_URL;
  }

  function withQuery(base, params){
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value])=>{
      if(value === undefined || value === null) return;
      q.set(key, String(value));
    });
    const qs = q.toString();
    if(!qs) return base;
    return base + (base.includes('?') ? '&' : '?') + qs;
  }

  async function request(url, options){
    const res = await fetch(url, Object.assign({ cache:'no-store' }, options || {}));
    let data = null;
    const text = await res.text();
    if(text){
      try{ data = JSON.parse(text); }
      catch(_err){
        data = {
          ok:false,
          message:/<!doctype html|<html[\s>]/i.test(text) ? '서버 응답을 JSON으로 해석하지 못했습니다.' : text,
          responseText:text,
          bodySample:text.slice(0,1200)
        };
      }
    }
    if(!res.ok){
      const msg = data?.message || data?.error || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      err.responseText = data?.responseText || text;
      throw err;
    }
    return data;
  }

  function getJson(url, params){
    return request(params ? withQuery(url, params) : url, { method:'GET' });
  }

  function postJson(url, body){
    return request(url, { method:'POST', body:JSON.stringify(body || {}) });
  }

  async function getAction(action, params){
    if(window.KinojoSupabase && typeof window.KinojoSupabase.webAction === 'function'){
      const data = await window.KinojoSupabase.webAction(action, params || {});
      if(data) return data;
    }
    const base = getBaseUrl();
    if(!base) throw new Error('Server Engine API가 준비되지 않았습니다. KinojoSupabase 연결을 확인해 주세요.');
    return getJson(base, Object.assign({ action, t:Date.now() }, params || {}));
  }

  async function postAction(action, body){
    if(window.KinojoSupabase && typeof window.KinojoSupabase.webAction === 'function'){
      const data = await window.KinojoSupabase.webAction(action, body || {});
      if(data) return data;
    }
    const base = getBaseUrl();
    if(!base) throw new Error('Server Engine API가 준비되지 않았습니다. KinojoSupabase 연결을 확인해 주세요.');
    return postJson(base, Object.assign({ action }, body || {}));
  }

  window.KinojoApi = {
    version:'1.3.1.32-server-engine-direct-2026062623',
    ready:true,
    DEFAULT_API_URL,
    getBaseUrl,
    withQuery,
    request,
    getJson,
    postJson,
    getAction,
    postAction
  };
})();
