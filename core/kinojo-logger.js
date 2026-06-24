/* KINOJO LOGGER ENGINE - 운영 로그 공통 보조 */
(function(){
  'use strict';
  function log(action, detail){
    if(window.KinojoDebug?.enabled) console.info('[KINOJO LOG]', action, detail || {});
  }
  function warn(action, detail){ console.warn('[KINOJO WARN]', action, detail || {}); }
  window.KinojoLogger = { version:'1.3.1.17', log, warn };
})();
