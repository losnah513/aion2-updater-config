/*
 * KINOJO device router
 * - PC/Mobile 진입로만 분리한다.
 * - 공통 데이터/API/UI 파일은 기존 위치를 유지한다.
 * - ?view=desktop 또는 sessionStorage kinojoPreferredView=desktop 이 있으면 모바일 자동 이동을 막는다.
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var params = new URLSearchParams(window.location.search || '');
  var forcedView = params.get('view') || params.get('device') || '';

  if (forcedView === 'desktop' || forcedView === 'pc') {
    try { sessionStorage.setItem('kinojoPreferredView', 'desktop'); } catch (error) {}
  }
  if (forcedView === 'mobile') {
    try { sessionStorage.setItem('kinojoPreferredView', 'mobile'); } catch (error) {}
  }

  var preferredView = '';
  try { preferredView = sessionStorage.getItem('kinojoPreferredView') || ''; } catch (error) {}

  function isMobileDevice() {
    var ua = navigator.userAgent || navigator.vendor || '';
    var uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    var coarsePointer = false;
    try { coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (error) {}
    var narrow = window.innerWidth > 0 && window.innerWidth <= 820;
    return uaMobile || (coarsePointer && narrow);
  }

  var isMobile = preferredView === 'mobile' || (preferredView !== 'desktop' && isMobileDevice());
  html.classList.toggle('kinojo-device-mobile', isMobile);
  html.classList.toggle('kinojo-device-desktop', !isMobile);

  var currentPath = window.location.pathname.replace(/\\/g, '/');
  var isInsideMobile = /\/(mobile|m)(\/|$)/.test(currentPath);
  var isInsideDesktop = /\/desktop(\/|$)/.test(currentPath);

  if (!isMobile || isInsideMobile) return;

  var mobilePath = document.currentScript && document.currentScript.getAttribute('data-mobile-path');
  if (!mobilePath) return;

  var target = new URL(mobilePath, window.location.href);
  target.search = window.location.search || '';
  target.hash = window.location.hash || '';

  if (target.href !== window.location.href && !isInsideDesktop) {
    window.location.replace(target.href);
  }
})();
