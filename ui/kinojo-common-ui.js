/* KINOJO common UI v1.c2.04 / work 260607_00 */
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
    return {key:'home',label:'메인',root:'./'};
  }
  function q(s,root=document){return root.querySelector(s)}
  function detach(el){if(el&&el.parentNode)el.parentNode.removeChild(el);return el}
  function removeLegacy(){
    const legacyTop=q('.top-utility');
    const slot=q('#kinojoCommonSlot');
    const visit=slot?q('#visitCard',slot):(legacyTop?q('#visitCard',legacyTop):q('#visitCard'));
    const admin=slot?q('.admin-menu-wrap',slot):(legacyTop?q('.admin-menu-wrap',legacyTop):q('.admin-menu-wrap'));
    const rescued={visit:detach(visit),admin:detach(admin)};
    if(slot)slot.remove();
    if(legacyTop)legacyTop.remove();
    document.querySelectorAll('.side-drawer,.drawer-page-panel,.info-drawer,.info-drawer-overlay,.kinojo-common-drawer,.kinojo-side-panel').forEach(el=>el.remove());
    return rescued;
  }
  function createVisitCard(){
    const el=document.createElement('section');
    el.className='visit-mini';
    el.id='visitCard';
    el.innerHTML='<span class="visit-line visit-line-today">👀 방문자 통계 준비중</span><span class="visit-line visit-line-total">🏛 누적 방문 기록 준비중</span>';
    return el;
  }
  function createAdminMenu(info){
    const wrap=document.createElement('div');
    wrap.className='admin-menu-wrap';
    const isHall=info.key==='hall';
    wrap.innerHTML=`
      <button aria-expanded="false" aria-haspopup="true" aria-label="관리 패널 열기" class="admin-menu-btn" id="adminMenuBtn" type="button">관리</button>
      <section aria-hidden="true" class="admin-dropdown admin-panel-modal" id="adminDropdown">
        <div class="admin-dropdown-head admin-panel-head">
          <div>
            <strong>관리 패널</strong>
            <span>권한에 맞는 운영 기능만 표시됩니다.</span>
          </div>
          <button aria-label="닫기" class="admin-dropdown-close kinojo-common-close" id="adminDropdownClose" type="button">×</button>
        </div>
        ${isHall?`
        <div class="admin-control-panel admin-shell" id="adminControlPanel" style="display:grid">
          <nav class="admin-panel-tabs" aria-label="관리 패널 메뉴">
            <button class="admin-panel-tab active" data-admin-panel="mvp" type="button">🏆 MVP</button>
            <button class="admin-panel-tab" data-admin-panel="growth" type="button">📈 성장</button>
            <button class="admin-panel-tab" data-admin-panel="account" type="button">👥 회원</button>
            <button class="admin-panel-tab" data-admin-panel="system" type="button">⚙ 시스템</button>
          </nav>
          <div class="admin-panel-content">
            <section class="admin-panel-pane active" data-admin-pane="mvp">
              <div class="admin-pane-title"><strong>MVP 관리</strong><span>후보와 집계 상태를 확인합니다.</span></div>
              <div class="admin-pane-actions">
                <button class="btn" id="adminMvpBtn" type="button">MVP 후보 확인</button>
              </div>
              <div class="admin-pane-result" data-admin-result="mvp"></div>
            </section>
            <section class="admin-panel-pane" data-admin-pane="growth">
              <div class="admin-pane-title"><strong>성장 데이터</strong><span>성장왕/벌크업 스냅샷과 자동 집계를 확인합니다.</span></div>
              <div class="admin-pane-actions">
                <button class="btn" id="adminSnapshotBtn" type="button">성장왕 스냅샷 생성</button>
                <button class="btn" id="adminSnapshotStatusBtn" type="button">스냅샷 상태 확인</button>
                <button class="btn" id="adminSnapshotTriggerBtn" type="button">주간 성장 자동 집계 활성화</button>
              </div>
              <div class="admin-pane-result" data-admin-result="growth"></div>
            </section>
            <section class="admin-panel-pane" data-admin-pane="account">
              <div class="admin-pane-title"><strong>회원 관리</strong><span>코드 생성, 등급, 권한을 관리합니다.</span></div>
              <div class="admin-pane-actions">
                <button class="btn" id="adminAccountBtn" type="button">회원 코드 관리</button>
              </div>
              <div class="admin-pane-result" data-admin-result="account"></div>
            </section>
            <section class="admin-panel-pane" data-admin-pane="system">
              <div class="admin-pane-title"><strong>시스템</strong><span>마스터 전용 기능과 캐릭터 소유정보를 관리합니다.</span></div>
              <div class="admin-pane-actions">
                <button class="btn" id="adminOwnerMapQuickBtn" type="button">캐릭터 소유정보 갱신</button>
              </div>
              <div class="admin-visit-control master-only" id="adminVisitControl">
                <div class="admin-visit-title">방문자수 조정 <span>MASTER 전용</span></div>
                <div class="admin-visit-line admin-visit-row-main">
                  <div aria-label="증감 선택" class="admin-swap admin-sign-swap">
                    <button class="admin-swap-btn active" data-visit-sign="plus" type="button">+</button>
                    <button class="admin-swap-btn" data-visit-sign="minus" type="button">-</button>
                  </div>
                  <input aria-label="조정 인원수" class="search admin-visit-amount" id="adminVisitAmount" inputmode="numeric" max="9999" min="1" type="number" value="1"/>
                  <span class="admin-visit-unit">명</span>
                  <div aria-label="조정 대상" class="admin-swap">
                    <button class="admin-swap-btn active" data-visit-target="daily" type="button">일일</button>
                    <button class="admin-swap-btn" data-visit-target="total" type="button">누적</button>
                  </div>
                </div>
                <div class="admin-status" id="adminVisitStatus"></div>
                <div class="admin-visit-line admin-visit-actions">
                  <button class="btn" id="adminVisitApplyBtn" type="button">반영</button>
                  <button class="btn admin-close" id="adminVisitCancelBtn" type="button">취소</button>
                </div>
              </div>
              <div class="admin-pane-result" data-admin-result="system"></div>
            </section>
          </div>
        </div>`:`
        <div class="admin-login-panel admin-placeholder-panel">
          <div class="admin-status">관리자 기능은 명예의 전당에서 우선 지원됩니다.</div>
        </div>`}
      </section>`;
    return wrap;
  }
  function pageTimeId(info){
    if(info.key==='sanctuary')return 'syncChip';
    if(info.key==='hall')return 'topbarUpdateTime';
    return 'topbarUpdateTime';
  }
  function makeTopbar(rescued,info){
    const bar=document.createElement('section');
    bar.className='kinojo-topbar';
    bar.setAttribute('aria-label','KINOJO INFO 공통 상단 메뉴');
    const timeText=info.key==='home'?'정보 허브':(info.key==='hall'?'업데이트 확인 중':'업데이트 확인 중');
    bar.innerHTML=`
      <div class="kinojo-top-left">
        <button class="kinojo-menu-toggle" id="drawerToggleBtn" type="button" aria-label="메뉴 열기" aria-expanded="false">
          <svg class="kinojo-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
            <g class="menu-dots"><circle cx="6" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="18" cy="12" r="1.9"></circle></g>
            <g class="menu-lines"><path d="M5 7.5H19"></path><path d="M5 12H19"></path><path d="M5 16.5H19"></path></g>
          </svg>
        </button>
        <span class="kinojo-top-page"><strong>${info.label}</strong><small id="${pageTimeId(info)}">${timeText}</small></span>
      </div>
      <div class="kinojo-top-center kinojo-auth-status" id="kinojoUserStatus">
        <button class="kinojo-login-btn" id="kinojoLoginBtn" type="button">로그인</button>
        <span class="kinojo-auth-label" id="kinojoAuthLabel">비회원 · 열람만 가능</span>
        <button class="kinojo-logout-btn" id="kinojoLogoutBtn" type="button" style="display:none">로그아웃</button>
      </div>
      <div class="kinojo-top-tools" id="kinojoTopTools"></div>`;
    const tools=q('#kinojoTopTools',bar);
    const auth=q('#kinojoUserStatus',bar);
    const admin=rescued.admin||createAdminMenu(info);
    const visit=rescued.visit||createVisitCard();
    const adminBtn=admin.querySelector('#adminMenuBtn');
    if(adminBtn){adminBtn.textContent='관리';adminBtn.setAttribute('aria-label','관리 패널 열기');}
    admin.style.display='none';
    if(auth)auth.appendChild(admin);
    tools.appendChild(visit);
    document.body.insertBefore(bar,document.body.firstChild);
  }
  function toggleAdminMenu(){
    const menu=q('#adminDropdown');const btn=q('#adminMenuBtn');
    if(!menu)return;
    const open=!menu.classList.contains('open');
    menu.classList.toggle('open',open);
    menu.setAttribute('aria-hidden',open?'false':'true');
    if(btn)btn.setAttribute('aria-expanded',open?'true':'false');
  }
  function closeAdminMenuCommon(){
    const menu=q('#adminDropdown');const btn=q('#adminMenuBtn');
    if(menu){menu.classList.remove('open');menu.setAttribute('aria-hidden','true');}
    if(btn)btn.setAttribute('aria-expanded','false');
  }
  function bindCommonAdmin(info){
    if(info.key==='hall')return;
    q('#adminMenuBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleAdminMenu();});
    q('#adminDropdownClose')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeAdminMenuCommon();});
    document.addEventListener('click',e=>{const menu=q('#adminDropdown');if(menu&&menu.classList.contains('open')&&!menu.contains(e.target)&&!e.target.closest('#adminMenuBtn'))closeAdminMenuCommon();});
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
          <a id="drawerTitle" class="kinojo-drawer-title" href="https://bit.ly/kinojo-index">KINOJO INFO</a>
          <button class="kinojo-common-close kinojo-drawer-close" id="drawerCloseBtn" type="button" aria-label="메뉴 닫기">×</button>
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
          <button class="kinojo-common-close kinojo-panel-close" id="drawerPageCloseBtn" type="button" aria-label="닫기">×</button>
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
    if(drawer){drawer.classList.remove('open','standalone-open');drawer.setAttribute('aria-hidden','true');}
    if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-drawer-open','drawer-open','kinojo-standalone-panel-open');
    if(btn)btn.setAttribute('aria-expanded','false');
  }
  function setGuideContent(type){
    const data=DOCS[type]||DOCS.about;
    const title=q('#drawerPageTitle');const body=q('#drawerPageBody');
    if(title)title.textContent=data.title;
    if(body)body.innerHTML=data.html;
  }
  function openDrawerPagePanel(type){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');
    if(!drawer||!panel)return;
    drawer.classList.remove('standalone-open');
    setGuideContent(type);
    if(!drawer.classList.contains('open'))openSideDrawer();
    panel.classList.add('open','from-menu');
    panel.classList.remove('standalone');
    panel.setAttribute('aria-hidden','false');
  }
  function openStandalonePagePanel(type){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');const btn=q('#drawerToggleBtn');
    if(!drawer||!panel)return;
    setGuideContent(type);
    drawer.classList.add('standalone-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','false');
    document.body.classList.remove('kinojo-drawer-open','drawer-open');
    document.body.classList.add('kinojo-standalone-panel-open');
    if(btn)btn.setAttribute('aria-expanded','false');
    panel.classList.add('open','standalone');
    panel.classList.remove('from-menu');
    panel.setAttribute('aria-hidden','false');
  }
  function closeDrawerPagePanel(){
    const drawer=q('#sideDrawer');const panel=q('#drawerPagePanel');
    if(panel){panel.classList.remove('open','standalone','from-menu');panel.setAttribute('aria-hidden','true');}
    if(drawer){drawer.classList.remove('standalone-open');if(!drawer.classList.contains('open'))drawer.setAttribute('aria-hidden','true');}
    document.body.classList.remove('kinojo-standalone-panel-open');
  }
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
      const fromFooter=btn.dataset.guideMode==='standalone'||!!btn.closest('.common-footer');
      if(type==='contact'&&typeof window.openSuggestionPanel==='function'&&!fromFooter){
        window.openSuggestionPanel();
        return;
      }
      if(fromFooter)openStandalonePagePanel(type);
      else openDrawerPagePanel(type);
    },true);
    document.querySelectorAll('.common-footer').forEach(footer=>{
      footer.classList.add('kinojo-common-footer-bound');
      footer.querySelectorAll('a[href*="about.html"],a[href*="terms.html"],a[href*="privacy.html"],a[href*="contact.html"]').forEach(a=>{
        const href=a.getAttribute('href')||'';
        let type=href.includes('terms')?'terms':href.includes('privacy')?'privacy':href.includes('contact')?'contact':'about';
        a.setAttribute('href','#');a.dataset.pagePanel=type;a.dataset.guideMode='standalone';
      });
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=q('#drawerPagePanel');if(p?.classList.contains('open'))return closeDrawerPagePanel();const d=q('#sideDrawer');if(d?.classList.contains('open'))return closeSideDrawer();}});
  }
  const rescued=removeLegacy();
  const info=pageInfo();
  makeTopbar(rescued,info);
  makeDrawer(info);
  bind();
  bindCommonAdmin(info);
  window.KinojoCommonUI={openSideDrawer,closeSideDrawer,openDrawerPagePanel,openStandalonePagePanel,closeDrawerPagePanel};
  window.openSideDrawer=openSideDrawer;
  window.closeSideDrawer=closeSideDrawer;
  window.openDrawerPagePanel=openDrawerPagePanel;
  window.closeDrawerPagePanel=closeDrawerPagePanel;
  window.openStandalonePagePanel=openStandalonePagePanel;
})();
