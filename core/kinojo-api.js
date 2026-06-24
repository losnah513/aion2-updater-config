/*
 * KINOJO API ENGINE
 * Role: Apps Script/Web API 호출 공통 래퍼.
 * Rule: 각 페이지가 fetch를 직접 늘리지 않고 이 파일을 통해 GET/POST/action 호출을 공유합니다.
 */
(function(){
  'use strict';
  const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';

  function getBaseUrl(){
    const param = new URLSearchParams(location.search || '').get('api');
    if(param) return param;
    try{ if(typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) return WEB_APP_URL; }catch(_err){}
    return DEFAULT_WEB_APP_URL;
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
      catch(_err){ data = { ok:false, message:text }; }
    }
    if(!res.ok){
      const msg = data?.message || data?.error || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
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

  function getAction(action, params){
    return getJson(getBaseUrl(), Object.assign({ action, t:Date.now() }, params || {}));
  }

  function postAction(action, body){
    return postJson(getBaseUrl(), Object.assign({ action }, body || {}));
  }

  window.KinojoApi = {
    version:'1.3.1.17',
    ready:true,
    DEFAULT_WEB_APP_URL,
    getBaseUrl,
    withQuery,
    request,
    getJson,
    postJson,
    getAction,
    postAction
  };
})();
