(function(){
  'use strict';
  function node(target){return typeof target==='string'?document.querySelector(target):target}
  function shellReady(){document.body.classList.add('kinojo-page-shell-ready');document.body.classList.remove('kinojo-page-booting')}
  function region(target,label){const el=node(target);if(!el)return null;el.classList.add('kinojo-staged-region','is-region-loading');el.classList.remove('is-region-ready');el.setAttribute('aria-busy','true');if(label)el.dataset.loadingLabel=String(label);return el}
  function ready(target){const el=node(target);if(!el)return;el.classList.remove('is-region-loading');el.classList.add('is-region-ready');el.setAttribute('aria-busy','false')}
  function failed(target){const el=node(target);if(!el)return;el.classList.remove('is-region-loading');el.classList.add('is-region-ready','is-region-error');el.setAttribute('aria-busy','false')}
  window.KinojoStagedLoading={shellReady,region,ready,failed};
  const reveal=()=>requestAnimationFrame(()=>requestAnimationFrame(shellReady));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reveal,{once:true});else reveal();
})();
