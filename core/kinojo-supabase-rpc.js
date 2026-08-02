/*
 * KINOJO Supabase RPC Core
 * 책임: PostgREST RPC 호출 계약과 응답 오류 표준화.
 */
(function(){
  'use strict';
  const client=window.KinojoSupabaseClientCore;
  if(!client) throw new Error('KinojoSupabaseClientCore가 먼저 로드되어야 합니다.');
  const {ensureConfig,headers}=client;
  function buildRpcUrl(cfg, fn){
    return cfg.url + '/rest/v1/rpc/' + String(fn || '').replace(/^\//, '');
  }

  async function rpc(fn, params){
    const cfg = await ensureConfig();
    const res = await fetch(buildRpcUrl(cfg, fn), {
      method:'POST',
      headers:Object.assign(headers(cfg), { Prefer:'return=representation' }),
      body:JSON.stringify(params || {}),
      cache:'no-store'
    });
    const text = await res.text();
    let data = null;
    if(text){
      try{ data = JSON.parse(text); }catch(_err){ data = text; }
    }
    if(!res.ok) throw new Error(data && (data.message || data.details || data.hint) || text || ('HTTP ' + res.status));
    return data;
  }
  window.KinojoSupabaseRpcCore=Object.freeze({buildRpcUrl,rpc});
})();
