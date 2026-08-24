/* KINOJO Admin banner management tabs v2026082403 */
(function(A){
'use strict';
if(!A)throw Error('KINOJO Admin shared module is required.');
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const pane=()=> $('[data-admin-pane="images"]');
function ensure(){
  const p=pane();if(!p)return;
  let nav=$('[data-banner-management-tabs]',p),main=$('[data-banner-management-panel="main"]',p),side=$('[data-banner-management-panel="side"]',p);
  if(!nav){
    nav=document.createElement('nav');nav.className='admin-subnav';nav.dataset.bannerManagementTabs='';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','이미지 관리 배너 종류');
    nav.innerHTML='<button class="active" id="adminBannerMainTab" data-admin-subtab="main" data-banner-management-tab="main" type="button" role="tab" aria-selected="true" aria-controls="adminBannerMainPanel">메인 배너</button><button id="adminBannerSideTab" data-admin-subtab="side" data-banner-management-tab="side" type="button" role="tab" aria-selected="false" aria-controls="adminBannerSidePanel" tabindex="-1">사이드 배너</button>';
    p.prepend(nav);
  }
  nav.dataset.adminSubnav='images';
  if(!main){main=document.createElement('div');main.className='admin-subpane active';main.id='adminBannerMainPanel';main.dataset.bannerManagementPanel='main';main.dataset.adminSubpane='main';main.setAttribute('role','tabpanel');main.setAttribute('aria-labelledby','adminBannerMainTab');nav.after(main)}
  if(!side){side=document.createElement('div');side.className='admin-subpane';side.id='adminBannerSidePanel';side.dataset.bannerManagementPanel='side';side.dataset.adminSubpane='side';side.setAttribute('role','tabpanel');side.setAttribute('aria-labelledby','adminBannerSideTab');side.hidden=true;main.after(side)}
  main.dataset.adminSubpane='main';side.dataset.adminSubpane='side';
  const mainRoot=$('[data-main-banner-admin]',p),sideRoot=$('[data-side-banner-admin]',p);if(mainRoot&&mainRoot.parentElement!==main)main.appendChild(mainRoot);if(sideRoot&&sideRoot.parentElement!==side)side.appendChild(sideRoot);
}
function active(){return $('[data-admin-subtab].active',pane()||document)?.dataset.adminSubtab==='side'?'side':'main'}
function show(section,{focus=false,updateRoute=true,force=false}={}){
  ensure();const p=pane();if(!p)return;const next=section==='side'?'side':'main';
  if(A.switchSubtab)A.switchSubtab('images',next,{updateRoute,force});
  else{
    $$('[data-admin-subtab]',p).forEach(button=>{const on=button.dataset.adminSubtab===next;button.classList.toggle('active',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1});
    $$('[data-admin-subpane]',p).forEach(panel=>{const on=panel.dataset.adminSubpane===next;panel.classList.toggle('active',on);panel.hidden=!on});
    if(next==='side')A.loadSideBannerManagement?.(force);else A.loadMainBannerManagement?.(force);
  }
  if(focus)queueMicrotask(()=>($(`[data-admin-subtab="${next}"]`,$('#adminTopSubnav'))||$(`[data-admin-subtab="${next}"]`,p))?.focus());
}
ensure();
const p=pane();if(p)new MutationObserver(()=>ensure()).observe(p,{childList:true});
document.addEventListener('keydown',event=>{const button=event.target.closest?.('[data-admin-subtab][data-banner-management-tab]');if(!button)return;const order=['main','side'],current=order.indexOf(button.dataset.adminSubtab);let next=null;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=order[(current+1)%order.length];else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=order[(current-1+order.length)%order.length];else if(event.key==='Home')next=order[0];else if(event.key==='End')next=order[order.length-1];if(next){event.preventDefault();show(next,{focus:true})}});
Object.assign(A,{ensureBannerManagementTabs:ensure,switchBannerManagementTab:show,getBannerManagementTab:active});
})(window.KinojoAdmin);
