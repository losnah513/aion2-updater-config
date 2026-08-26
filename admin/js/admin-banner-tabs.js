/* KINOJO Admin banner management tabs v2026082608 */
(function(A){
'use strict';
if(!A)throw Error('KINOJO Admin shared module is required.');
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const pane=()=> $('[data-admin-pane="images"]');
function ensure(){
  const p=pane();if(!p)return;
  let nav=$('[data-banner-management-tabs]',p),main=$('[data-banner-management-panel="main"]',p),side=$('[data-banner-management-panel="side"]',p),events=$('[data-banner-management-panel="events"]',p),library=$('[data-banner-management-panel="library"]',p);
  if(!nav){
    nav=document.createElement('nav');nav.className='admin-subnav';nav.dataset.bannerManagementTabs='';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','이미지 관리 배너 종류');
    nav.innerHTML='<button class="active" id="adminBannerMainTab" data-admin-subtab="main" data-banner-management-tab="main" type="button" role="tab" aria-selected="true" aria-controls="adminBannerMainPanel">메인 배너</button><button id="adminBannerSideTab" data-admin-subtab="side" data-banner-management-tab="side" type="button" role="tab" aria-selected="false" aria-controls="adminBannerSidePanel" tabindex="-1">사이드 배너</button><button id="adminBannerEventsTab" data-admin-subtab="events" data-banner-management-tab="events" type="button" role="tab" aria-selected="false" aria-controls="adminBannerEventsPanel" tabindex="-1">이벤트 관리</button><button id="adminBannerLibraryTab" data-admin-subtab="library" data-banner-management-tab="library" type="button" role="tab" aria-selected="false" aria-controls="adminBannerLibraryPanel" tabindex="-1">이미지 라이브러리</button>';
    p.prepend(nav);
  }
  nav.dataset.adminSubnav='images';
  if(!main){main=document.createElement('div');main.className='admin-subpane active';main.id='adminBannerMainPanel';main.dataset.bannerManagementPanel='main';main.dataset.adminSubpane='main';main.setAttribute('role','tabpanel');main.setAttribute('aria-labelledby','adminBannerMainTab');nav.after(main)}
  if(!side){side=document.createElement('div');side.className='admin-subpane';side.id='adminBannerSidePanel';side.dataset.bannerManagementPanel='side';side.dataset.adminSubpane='side';side.setAttribute('role','tabpanel');side.setAttribute('aria-labelledby','adminBannerSideTab');side.hidden=true;main.after(side)}
  if(!events){events=document.createElement('div');events.className='admin-subpane';events.id='adminBannerEventsPanel';events.dataset.bannerManagementPanel='events';events.dataset.adminSubpane='events';events.setAttribute('role','tabpanel');events.setAttribute('aria-labelledby','adminBannerEventsTab');events.hidden=true;events.innerHTML='<div data-banner-events-admin></div>';side.after(events)}
  if(!library){library=document.createElement('div');library.className='admin-subpane';library.id='adminBannerLibraryPanel';library.dataset.bannerManagementPanel='library';library.dataset.adminSubpane='library';library.setAttribute('role','tabpanel');library.setAttribute('aria-labelledby','adminBannerLibraryTab');library.hidden=true;library.innerHTML='<div data-banner-asset-library></div><div data-banner-auto-pool></div>';events.after(library)}
  if(!$('[data-banner-asset-library]',library)){const root=document.createElement('div');root.dataset.bannerAssetLibrary='';library.appendChild(root)}
  if(!$('[data-banner-auto-pool]',library)){const root=document.createElement('div');root.dataset.bannerAutoPool='';library.appendChild(root)}
  main.dataset.adminSubpane='main';side.dataset.adminSubpane='side';events.dataset.adminSubpane='events';library.dataset.adminSubpane='library';
  const mainRoot=$('[data-main-banner-admin]',p),sideRoot=$('[data-side-banner-admin]',p);if(mainRoot&&mainRoot.parentElement!==main)main.appendChild(mainRoot);if(sideRoot&&sideRoot.parentElement!==side)side.appendChild(sideRoot);
}
function active(){const value=$('[data-admin-subtab].active',pane()||document)?.dataset.adminSubtab;return ['main','side','events','library'].includes(value)?value:'main'}
function show(section,{focus=false,updateRoute=true,force=false}={}){
  ensure();const p=pane();if(!p)return;const next=['side','events','library'].includes(section)?section:'main';
  if(A.switchSubtab)A.switchSubtab('images',next,{updateRoute,force});
  else{
    $$('[data-admin-subtab]',p).forEach(button=>{const on=button.dataset.adminSubtab===next;button.classList.toggle('active',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1});
    $$('[data-admin-subpane]',p).forEach(panel=>{const on=panel.dataset.adminSubpane===next;panel.classList.toggle('active',on);panel.hidden=!on});
    if(next==='side')A.loadSideBannerManagement?.(force);else if(next==='events')A.loadBannerEventManagement?.(force);else if(next==='library'){A.loadBannerAssetLibrary?.(force);A.loadBannerAutoPool?.(force)}else A.loadMainBannerManagement?.(force);
  }
  if(focus)queueMicrotask(()=>($(`[data-admin-subtab="${next}"]`,$('#adminTopSubnav'))||$(`[data-admin-subtab="${next}"]`,p))?.focus());
}
ensure();
const p=pane();if(p)new MutationObserver(()=>ensure()).observe(p,{childList:true});
document.addEventListener('keydown',event=>{const button=event.target.closest?.('[data-admin-subtab][data-banner-management-tab]');if(!button)return;const order=['main','side','events','library'],current=order.indexOf(button.dataset.adminSubtab);let next=null;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=order[(current+1)%order.length];else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=order[(current-1+order.length)%order.length];else if(event.key==='Home')next=order[0];else if(event.key==='End')next=order[order.length-1];if(next){event.preventDefault();show(next,{focus:true})}});
Object.assign(A,{ensureBannerManagementTabs:ensure,switchBannerManagementTab:show,getBannerManagementTab:active});
})(window.KinojoAdmin);
