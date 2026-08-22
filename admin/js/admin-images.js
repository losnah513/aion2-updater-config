/* KINOJO Admin image-management shell v2026082203 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');

  const isMaster=()=>A.isMaster?.()===true;

  function imageRouteActive(){
    return String(location.hash||'').replace(/^#/,'').split('/')[0]==='images';
  }

  function ensureImageManagementShell(){
    const nav=document.querySelector('.admin-nav');
    if(nav&&!nav.querySelector('[data-admin-tab="images"]')){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.adminTab='images';
      button.setAttribute('data-admin-master-only','');
      button.textContent='🖼 이미지 관리';
      const meter=nav.querySelector('[data-admin-tab="meter"]');
      nav.insertBefore(button,meter||nav.querySelector('[data-admin-tab="system"]')||null);
    }

    const main=document.querySelector('.admin-main');
    if(main&&!main.querySelector('[data-admin-pane="images"]')){
      const pane=document.createElement('section');
      pane.className='admin-pane';
      pane.dataset.adminPane='images';
      pane.setAttribute('data-admin-master-only','');
      pane.innerHTML='<section class="admin-card"><div class="admin-card-head"><div><h2>이미지 관리</h2><p>메인 배너와 PC 좌·우 배너 이미지를 관리합니다.</p></div></div><div class="admin-empty">이미지 관리 기능은 다음 단계에서 연결됩니다.</div></section>';
      const meter=main.querySelector('[data-admin-pane="meter"]');
      main.insertBefore(pane,meter||main.querySelector('[data-admin-pane="system"]')||null);
    }
  }

  function guardImageRoute(){
    if(isMaster()||!imageRouteActive())return false;
    history.replaceState(null,'',location.pathname+location.search+'#dashboard');
    if(typeof A.switchTab==='function')A.switchTab('dashboard',{updateRoute:true});
    return true;
  }

  function syncImageLocationLabel(){
    const label=document.querySelector('#adminCurrentLocation');
    const pane=document.querySelector('[data-admin-pane="images"]');
    if(label&&pane?.classList.contains('active')&&label.textContent!=='[이미지 관리]')label.textContent='[이미지 관리]';
  }

  ensureImageManagementShell();
  guardImageRoute();

  const locationLabel=document.querySelector('#adminCurrentLocation');
  if(locationLabel)new MutationObserver(syncImageLocationLabel).observe(locationLabel,{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',()=>{if(!guardImageRoute())queueMicrotask(syncImageLocationLabel);});
  document.addEventListener('click',event=>{if(event.target.closest('[data-admin-tab="images"]'))queueMicrotask(syncImageLocationLabel);});

  Object.assign(A,{ensureImageManagementShell});
})(window.KinojoAdmin);
