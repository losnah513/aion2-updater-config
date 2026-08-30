(function(){
  'use strict';
  function node(target){return typeof target==='string'?document.querySelector(target):target}
  function attachPageSubbar(){
    const bar=document.querySelector('.kinojo-home-subbar,.hof-filter-bar,.ranking-toolbar,.schedule-page-bar,.sanctuary-page-bar,.sanctuary-management-page-bar,.meter-live-subbar');
    const topbar=document.querySelector('.kinojo-topbar');
    if(!bar||!topbar)return false;
    /* HOME ships the subbar in its final DOM position. Keep the legacy move as
       a compatibility fallback for older page templates only. */
    if(topbar.nextElementSibling!==bar&&!bar.classList.contains('kinojo-home-subbar'))topbar.insertAdjacentElement('afterend',bar);
    bar.classList.add('kinojo-attached-subbar');
    const sync=()=>{
      const topbarHeight=topbar.getBoundingClientRect().height||0;
      document.body.style.setProperty('padding-top',Math.ceil(topbarHeight)+'px','important');
      bar.style.setProperty('margin-top','0','important');
      document.documentElement.style.setProperty('--kinojo-attached-subbar-height',Math.ceil(bar.getBoundingClientRect().height)+'px');
    };
    sync();
    if('ResizeObserver' in window){const observer=new ResizeObserver(sync);observer.observe(bar);observer.observe(topbar)}
    return true;
  }
  function shellReady(){document.body.classList.add('kinojo-page-shell-ready');document.body.classList.remove('kinojo-page-booting')}
  function region(target,label){const el=node(target);if(!el)return null;el.classList.add('kinojo-staged-region','is-region-loading');el.classList.remove('is-region-ready');el.setAttribute('aria-busy','true');if(label)el.dataset.loadingLabel=String(label);return el}
  function ready(target){const el=node(target);if(!el)return;el.classList.remove('is-region-loading');el.classList.add('is-region-ready');el.setAttribute('aria-busy','false')}
  function failed(target){const el=node(target);if(!el)return;el.classList.remove('is-region-loading');el.classList.add('is-region-ready','is-region-error');el.setAttribute('aria-busy','false')}
  window.KinojoStagedLoading={shellReady,region,ready,failed};
  function attachPageSubbarWhenReady(attempt=0){if(attachPageSubbar()||attempt>=20)return;setTimeout(()=>attachPageSubbarWhenReady(attempt+1),50)}
  const reveal=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{attachPageSubbarWhenReady();shellReady()}));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reveal,{once:true});else reveal();
})();
