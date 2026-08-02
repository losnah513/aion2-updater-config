/*
 * KINOJO Auth Service Core
 * 책임: PASS KEY 로그인과 회원 코드/계정 관리 Server 호출.
 */
(function(){
  'use strict';
  function bridge(){const api=window.KinojoSupabase;if(!api)throw new Error('KinojoSupabase가 먼저 로드되어야 합니다.');return api;}
  async function ensureReady(){const api=bridge();if(typeof api.ensureReady==='function')await api.ensureReady();else if(typeof api.loadRemoteConfig==='function')await api.loadRemoteConfig();return api;}
  async function verifyPassKey(code){const api=await ensureReady();return api.verifyPassKey(code);}
  async function publicCodeRequest(command,body){const api=await ensureReady();return api.publicCodeRequest(command,body);}
  async function adminAccount(command,body){const api=await ensureReady();return api.adminAccount(command,body);}
  window.KinojoAuthService=Object.freeze({ensureReady,verifyPassKey,publicCodeRequest,adminAccount});
})();
