/*
 * KINOJO Supabase RPC Core
 * 책임: PostgREST RPC 호출 계약과 응답 오류 표준화.
 * Phase 1-C-2: 323 관리자 Actor 경계를 사용하는 RPC는 브라우저 원문 PASS KEY 대신 현재 Server-issued kws_ 세션을 전송합니다.
 */
(function(){
  'use strict';
  const client=window.KinojoSupabaseClientCore;
  if(!client) throw new Error('KinojoSupabaseClientCore가 먼저 로드되어야 합니다.');
  const {ensureConfig,headers}=client;
  const SESSION_KEY='kinojo_login_session_v1';
  const SERVER_SESSION_TOKEN_PATTERN=/^kws_[A-Za-z0-9_-]{40,80}$/;
  const SERVER_SESSION_ADMIN_RPCS=new Set([
    'kinojo_admin_event_notice_delete',
    'kinojo_admin_event_notice_list',
    'kinojo_admin_event_notice_save',
    'kinojo_admin_notice_create',
    'kinojo_admin_notice_disable',
    'kinojo_admin_notice_list',
    'kinojo_admin_notice_restore',
    'kinojo_admin_notice_update',
    'kinojo_admin_retry_failed_targets_v277',
    'kinojo_admin_sanctuary_profile_diagnostic_252',
    'kinojo_admin_visitor_dashboard_266',
    'kinojo_admin_visitor_history_266',
    'kinojo_code_request_approve',
    'kinojo_code_request_list',
    'kinojo_code_request_reject'
  ]);

  function buildRpcUrl(cfg, fn){
    return cfg.url + '/rest/v1/rpc/' + String(fn || '').replace(/^\//, '');
  }

  function currentServerSessionToken(){
    let session=null;
    try{
      const core=window.KinojoAuthSessionCore;
      if(core&&typeof core.getSession==='function') session=core.getSession();
      else session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    }catch(_err){ session=null; }
    const token=String(session&&session.token||'').trim();
    return SERVER_SESSION_TOKEN_PATTERN.test(token)?token:'';
  }

  function sessionScopedParams(fn, params){
    const body=params&&typeof params==='object'&&!Array.isArray(params)?Object.assign({},params):{};
    const rpcName=String(fn||'').trim();
    if(!SERVER_SESSION_ADMIN_RPCS.has(rpcName)) return body;
    if(!Object.prototype.hasOwnProperty.call(body,'p_pass_key')) return body;
    const sessionToken=currentServerSessionToken();
    if(sessionToken) body.p_pass_key=sessionToken;
    return body;
  }

  async function rpc(fn, params){
    const cfg = await ensureConfig();
    const res = await fetch(buildRpcUrl(cfg, fn), {
      method:'POST',
      headers:Object.assign(headers(cfg), { Prefer:'return=representation' }),
      body:JSON.stringify(sessionScopedParams(fn, params)),
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
