/*
 * KINOJO API ENGINE
 * Role: Server Engine 우선 / Apps Script legacy API 호출 공통 래퍼.
 * Rule: 각 페이지가 fetch를 직접 늘리지 않고 이 파일을 통해 GET/POST/action 호출을 공유합니다.
 */
(function(){
  'use strict';
  const DEFAULT_WEB_APP_URL = '';

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
    return getJson(getBaseUrl(), Object.assign({ action, t:Date.now() }, params || {}));
  }

  async function postAction(action, body){
    if(window.KinojoSupabase && typeof window.KinojoSupabase.webAction === 'function'){
      const data = await window.KinojoSupabase.webAction(action, body || {});
      if(data) return data;
    }
    return postJson(getBaseUrl(), Object.assign({ action }, body || {}));
  }

  window.KinojoApi = {
    version:'1.3.1.18-server-engine-bridge',
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
