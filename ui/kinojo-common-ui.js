/* KINOJO common UI v1.c2.03 / work 260606_01 */
(function(){
  const DOCS={
    about:{title:"사이트 소개",html:`<h3>KINOJO INFO</h3><p>키노조 인포는 AION2 키노조 관련 정보를 한곳에서 확인하기 위한 정보 허브입니다.</p><p>성역 파티 확인, 레기온 기록, 명예의 전당 등 필요한 기능을 순차적으로 제공합니다.</p>`},
    terms:{title:"이용약관",html:`<h3>이용 안내</h3><p>본 사이트는 키노조 관련 정보를 편리하게 확인하기 위한 비공식 정보 페이지입니다.</p><ul><li>사이트 정보의 무단 변조 또는 악의적 사용을 금지합니다.</li><li>표시되는 데이터는 참고용이며 최종 판단은 이용자 본인에게 있습니다.</li><li>서비스 구조는 사전 안내 없이 변경될 수 있습니다.</li></ul>`},
    privacy:{title:"개인정보처리방침",html:`<h3>개인정보 처리 안내</h3><p>본 사이트는 기본적인 정보 확인 기능을 중심으로 운영되며, 불필요한 개인정보 수집을 지양합니다.</p><ul><li>입력 정보는 사이트 운영 및 문의 확인 목적에 한해 사용됩니다.</li><li>불필요한 민감정보 입력은 권장하지 않습니다.</li><li>정책은 기능 추가에 따라 갱신될 수 있습니다.</li></ul>`},
    contact:{title:"아이디어 제안 및 건의",html:`<h3>문의 안내</h3><p>오류 제보, 기능 제안, 데이터 수정 요청은 아래 문의 채널로 전달해 주세요.</p><p><a href="https://discord.com/channels/939881585061277746/1512052370144493769" target="_blank" rel="noopener">디스코드 문의 채널 열기</a></p>`}
  };

  function pageInfo(){
    const path=location.pathname;
    if(path.includes('/hall-of-fame/'))return {key:'hall',label:'명예의 전당',root:'../'};
    if(path.includes('/sanctuary/'))return {key:'sanctuary',label:'성역',root:'../'};
    return {key:'home',label:'INFO HOME',root:'./'};
  }
  function q(s,root=document){return root.querySelector(s)}
  function detach(el){if(el&&el.parentNode)el.parentNode.removeChild(el);return el}
  function removeLegacy(){
    const legacyTop=q('.top-utility');
    const visit=legacyTop?q('#visitCard',legacyTop):q('#visitCard');
    const admin=legacyTop?q('.admin-menu-wrap',legacyTop):q('.admin-menu-wrap');
    const rescued={visit:detach(visit),admin:detach(admin)};
    if(legacyTop)legacyTop.remove();
    document.querySelectorAll('.side-drawer,.drawer-page-panel,.info-drawer,.info-drawer-overlay,.kinojo-common-drawer,.kinojo-side-panel').forEach(el=>el.remove());
    return rescued;
  }
  function makeTopbar(rescued,info){
    const bar=document.createElement('section');
    bar.className='kinojo-topbar';
    bar.setAttribute('aria-label','KINOJO INFO 공통 상단 메뉴');
    bar.innerHTML=`<button class="kinojo-menu-toggle" id="drawerToggleBtn" type="button" aria-label="메뉴 열기" aria-expanded="false"><span class="kinojo-plus" aria-hidden="true"></span></button><a class="kinojo-top-brand" href="${info.root}">KINOJO INFO</a><span class="kinojo-top-page" ${info.key==='sanctuary'?'id="syncChip"':''}>${info.key==='sanctuary'?'성역 데이터를 불러오는 중...':info.label}</span><div class="kinojo-top-tools" id="kinojoTopTools"></div>`;
    const tools=q('#kinojoTopTools',bar);
    if(rescued.visit)tools.appendChild(rescued.visit);
    if(rescued.admin)tools.appendChild(rescued.admin);
    document.body.insertBefore(bar,document.body.firstChild);
  }
  function makeDrawer(info){
    const isHall=info.key==='hall';
    const isSanctuary=info.key==='sanctuary';
    const home=info.root;
    const hallHref=isHall?'./':'hall-of-fame/';
    const prefix=isHall||isSanctuary?'../':'';
    const sanctuaryPrefix=isSanctuary?'./index.html':info.root+'sanctuary/index.html';
    const drawer=document.createElement('section');
    drawer.className='kinojo-common-drawer';
    drawer.id='sideDrawer';
    drawer.setAttribute('aria-hidden','true');
    drawer.innerHTML=`
      <div class="kinojo-drawer-panel" role="dialog" aria-modal="false" aria-labelledby="drawerTitle">
        <div class="kinojo-drawer-head">
          <a id="drawerTitle" class="kinojo-drawer-title" href="${home}">KINOJO INFO</a>
          <button class="kinojo-drawer-close" id="drawerCloseBtn" type="button" aria-label="메뉴 닫기">×</button>
        </div>
        <nav class="kinojo-drawer-nav" aria-label="KINOJO INFO 메뉴">
          <div class="kinojo-drawer-category">바로가기</div>
          <a href="${isHall?'./':prefix+hallHref}" ${isHall?'class="active" aria-disabled="true"':''}>명예의 전당</a>
          <a href="https://aion2.plaync.com/ko-kr/index?redirect=false" target="_blank" rel="noopener">아이온2 공식으로 이동</a>
          <a href="https://aion2.plaync.com/ko-kr/board/notice/list" target="_blank" rel="noopener">아이온2 공지로 이동</a>
          <div class="kinojo-drawer-divider"></div>
          <div class="kinojo-drawer-category">성역</div>
          <a href="${sanctuaryPrefix}?id=rudra" data-sanctuary-link="rudra">1. 심연의 재련: 루드라</a>
          <a href="${sanctuaryPrefix}?id=bagot" data-sanctuary-link="bagot">2. 침식의 정화소</a>
          <a href="${sanctuaryPrefix}?id=kaldrix" data-sanctuary-link="kaldrix">3. 무스펠의 성배</a>
          <div class="kinojo-drawer-divider"></div>
          <div class="kinojo-drawer-category">안내</div>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="about" data-drawer="about">사이트 소개</button>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="terms" data-drawer="terms">이용약관</button>
          <button class="kinojo-drawer-link drawer-page-link" type="button" data-page-panel="privacy" data-drawer="privacy">개인정보처리방침</button>
          <div class="kinojo-drawer-divider"></div>
          <button class="kinojo-drawer-action" id="drawerSuggestBtn" type="button" data-page-panel="contact" data-drawer="contact">아이디어 제안 및 건의</button>
        </nav>
      </div>
      <aside class="kinojo-side-panel" id="drawerPagePanel" aria-hidden="true">
        <div class="kinojo-panel-head">
          <strong class="kinojo-panel-title" id="drawerPageTitle">사이트 안내</strong>
          <button class="kinojo-panel-close" id="drawerPageCloseBtn" type="button" aria-label="닫기">×</button>
        </div>
        <div class="kinojo-panel-body" id="drawerPageBody"></div>
      </aside>`;
    document.body.appendChild(drawer);
  }
  function openSideDrawer(){
    const drawer=q('#sideDrawer');const btn=q('#drawerToggleBtn');
    if(!drawer)return;
    drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');
    document.body.classList.add('kinojo-drawer-open','drawer-open');
    if(btn)btn.setAttribute('aria-expanded','true');
  }
  function closeSideDrawer(){
    const drawer=q('#sideDrawer');const btn=q('#drawerToggleBtn');
    const panel=q('#drawerPagePanel');
    if(drawer){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');}
    if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-drawer-open','drawer-open');
    if(btn)btn.setAttribute('aria-expanded','false');
  }
  function openDrawerPagePanel(type){
    const data=DOCS[type]||DOCS.about;
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');const title=q('#drawerPageTitle');const body=q('#drawerPageBody');
    if(!drawer||!panel)return;
    if(!drawer.classList.contains('open'))openSideDrawer();
    if(title)title.textContent=data.title;
    if(body)body.innerHTML=data.html;
    panel.classList.add('open');panel.setAttribute('aria-hidden','false');
  }
  function closeDrawerPagePanel(){const panel=q('#drawerPagePanel');if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');}}
  function bind(){
    q('#drawerToggleBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openSideDrawer();});
    q('#drawerCloseBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeSideDrawer();});
    q('#drawerPageCloseBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeDrawerPagePanel();});
    q('#sideDrawer')?.addEventListener('click',e=>{if(e.target.id==='sideDrawer')closeSideDrawer();});
    document.addEventListener('click',e=>{
      const btn=e.target.closest('[data-page-panel],[data-drawer]');
      if(!btn)return;
      const type=btn.dataset.pagePanel||btn.dataset.drawer;
      if(!type)return;
      e.preventDefault();e.stopPropagation();
      if(type==='contact'&&typeof window.openSuggestionPanel==='function'){
        window.openSuggestionPanel();
        return;
      }
      openDrawerPagePanel(type);
    },true);
    document.querySelectorAll('.common-footer').forEach(footer=>{
      footer.classList.add('kinojo-common-footer-bound');
      footer.querySelectorAll('a[href*="about.html"],a[href*="terms.html"],a[href*="privacy.html"],a[href*="contact.html"]').forEach(a=>{
        const href=a.getAttribute('href')||'';
        let type=href.includes('terms')?'terms':href.includes('privacy')?'privacy':href.includes('contact')?'contact':'about';
        a.setAttribute('href','#');a.dataset.pagePanel=type;
      });
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=q('#drawerPagePanel');if(p?.classList.contains('open'))return closeDrawerPagePanel();const d=q('#sideDrawer');if(d?.classList.contains('open'))return closeSideDrawer();}});
  }
  const rescued=removeLegacy();
  const info=pageInfo();
  makeTopbar(rescued,info);
  makeDrawer(info);
  bind();
  window.KinojoCommonUI={openSideDrawer,closeSideDrawer,openDrawerPagePanel,closeDrawerPagePanel};
  window.openSideDrawer=openSideDrawer;
  window.closeSideDrawer=closeSideDrawer;
  window.openDrawerPagePanel=openDrawerPagePanel;
  window.closeDrawerPagePanel=closeDrawerPagePanel;
})();
