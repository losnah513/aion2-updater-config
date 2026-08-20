/* KINOJO ROUTE GUARD ENGINE - 공통 접근 제어 보조 */
(function(){
  'use strict';
  function requireLogin(message, options){
    if(window.KinojoAuth?.isLoggedIn?.()) return true;
    if(window.KinojoModal?.openLogin) window.KinojoModal.openLogin(message || '로그인 후 이용할 수 있습니다.', options);
    else window.KinojoAuth?.openLoginModal?.(message || '로그인 후 이용할 수 있습니다.', options);
    return false;
  }
  function requireLevel(level, message){
    const account = window.KinojoAuth?.getAccount?.() || null;
    if(window.KinojoPermissions?.hasLevel?.(account, level)) return true;
    window.KinojoToast?.error?.(message || '권한이 부족합니다.');
    return false;
  }
  function loadCommonNavigation(){
    const path=location.pathname.replace(/\\/g,'/');
    if(path.includes('/admin/')) return;
    if(window.__KINOJO_COMMON_NAVIGATION_INIT_DONE__) return;
    if(document.querySelector('script[data-kinojo-common-navigation]')) return;
    const script=document.createElement('script');
    script.src='/ui/kinojo-common-navigation.js?cache=2026082003';
    script.async=true;
    script.dataset.kinojoCommonNavigation='true';
    document.head.appendChild(script);
  }
  loadCommonNavigation();
  window.KinojoRouteGuard = { version:'1.3.1.18', requireLogin, requireLevel };
})();
