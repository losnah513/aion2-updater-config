/*
 * KINOJO Supabase Web Bridge
 * Role: GitHub Pages에서 Supabase REST API를 공통으로 사용하기 위한 1차 연결 파일.
 * 주의: publishable key만 사용. service_role/secret key/DB password 금지.
 */
(function(){
  'use strict';

  const DEFAULT_CONFIG = {
    enabled:false,
    url:'https://josvoltpktvwysrasffq.supabase.co',
    publishableKey:'PASTE_SUPABASE_PUBLISHABLE_KEY_HERE'
  };

  function getConfig(){
    const runtime = window.KINOJO_SUPABASE_CONFIG || {};
    const cfg = Object.assign({}, DEFAULT_CONFIG, runtime);
    cfg.url = String(cfg.url || '').replace(/\/$/, '');
    cfg.publishableKey = String(cfg.publishableKey || '').trim();
    cfg.enabled = !!(cfg.enabled && cfg.url && cfg.publishableKey && !/PASTE_|YOUR_/i.test(cfg.publishableKey));
    return cfg;
  }

  function headers(){
    const cfg = getConfig();
    return {
      apikey: cfg.publishableKey,
      authorization: 'Bearer ' + cfg.publishableKey,
      'content-type': 'application/json'
    };
  }

  function url(path, query){
    const cfg = getConfig();
    const qs = query ? (query.startsWith('?') ? query : '?' + query) : '';
    return cfg.url + '/rest/v1/' + path.replace(/^\//, '') + qs;
  }

  async function request(path, options){
    const cfg = getConfig();
    if (!cfg.enabled) throw new Error('Supabase 설정이 비활성화되어 있습니다.');
    const res = await fetch(url(path, options && options.query), {
      method: options && options.method || 'GET',
      headers: Object.assign(headers(), options && options.headers || {}),
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = text; }
    }
    if (!res.ok) throw new Error(data && (data.message || data.details) || text || ('HTTP ' + res.status));
    return data;
  }

  async function getLatestAnnouncements(limit){
    const q = 'select=*&is_active=eq.true&order=priority.desc,created_at.desc&limit=' + encodeURIComponent(limit || 5);
    return request('announcements', { query:q });
  }

  async function getLockStatus(){
    const rows = await request('crawl_locks', { query:'select=*&id=eq.global&limit=1' });
    return Array.isArray(rows) ? rows[0] : null;
  }

  window.KinojoSupabase = {
    version:'1.3.1.22-web-bridge-01',
    getConfig,
    request,
    getLatestAnnouncements,
    getLockStatus
  };
})();
