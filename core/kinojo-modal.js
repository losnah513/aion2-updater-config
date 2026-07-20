/*
 * KINOJO MODAL ENGINE
 * Role: 공통 안내/확인 모달. 로그인 전용 모달은 kinojo-auth.js가 담당하고, 이후 단계에서 이 엔진으로 흡수합니다.
 */
(function(){
  'use strict';
  function alertBox(message, title){
    window.alert((title ? title + '\n\n' : '') + String(message || ''));
  }
  function confirmBox(message, title){
    return window.confirm((title ? title + '\n\n' : '') + String(message || ''));
  }
  function openLogin(reason, options){
    if(window.KinojoAuth?.openLoginModal) return window.KinojoAuth.openLoginModal(reason, options);
    alertBox(reason || '로그인이 필요합니다.');
  }
  window.KinojoModal = { version:'1.3.1.17', alert:alertBox, confirm:confirmBox, openLogin };
})();
