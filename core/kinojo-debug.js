/* KINOJO DEBUG ENGINE - 관리자 전용 진단 토글 */
(function(){
  'use strict';
  const enabled = /[?&]debug=1(&|$)/.test(location.search || '');
  function log(){ if(enabled) console.debug.apply(console, ['[KINOJO DEBUG]'].concat(Array.from(arguments))); }
  window.KinojoDebug = { version:'1.3.1.17', enabled, log };
})();
