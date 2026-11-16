(function () {
  'use strict';
  if (window !== window.top || window.KinojoBgmNavigation) return;
  const player = document.querySelector('[data-home-bgm]');
  if (!player) return;

  const route = /^\/(?:m\/)?(?:(?:hof|hall-of-fame|ranking|legion-tree|legion-roster|sanctuary|sanctuary-management|sanctuary-schedule|arcana|admin)\/(?:index\.html)?|index\.html|home\.html)?$/;
  const session = Math.random().toString(36).slice(2);
  let original = null, frame = null, frameActive = false, requested = '';
  let bindings, lastFrameUrl = '';
  const state = managed => ({ kinojoBgm: session, managed });
  const hrefOf = url => url.pathname + url.search + url.hash;
  const eligible = url => url.origin === location.origin && route.test(url.pathname);
  const frameLocation = () => {
    try { return new URL(frame.contentWindow.location.href); } catch { return null; }
  };

  function reflectFrame() {
    if (!frameActive) return;
    const url = frameLocation();
    if (!url || !eligible(url) || url.href === lastFrameUrl) return;
    lastFrameUrl = url.href;
    if (location.href !== url.href) history.replaceState(state(true), '', hrefOf(url));
    if (frame.contentDocument?.title) document.title = frame.contentDocument.title;
  }
  function onFrameLoad() {
    bindings?.abort();
    const url = frameLocation(), doc = frame.contentDocument;
    if (!frameActive || !doc || !url || !eligible(url)) return;
    const controller = new AbortController();
    bindings = controller;
    const options = { signal: controller.signal };
    lastFrameUrl = '';
    reflectFrame();
    doc.addEventListener('click', event => {
      if (event.isTrusted) window.dispatchEvent(new Event('kinojo:bgm-frame-activation'));
    }, { ...options, capture: true });
    doc.addEventListener('click', follow, options);
    const child = doc.defaultView;
    child.addEventListener('hashchange', reflectFrame, options);
    child.addEventListener('popstate', reflectFrame, options);
    child.navigation?.addEventListener('currententrychange', reflectFrame, options);
    if (requested && !player.contains(document.activeElement)) frame.focus({ preventScroll: true });
    requested = '';
  }
  function showFrame(url) {
    frameActive = true;
    lastFrameUrl = '';
    requested = url.href;
    document.body.classList.add('kinojo-bgm-host');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = '키노조 페이지';
      frame.className = 'kinojo-bgm-page';
      frame.addEventListener('load', onFrameLoad);
      frame.src = url.href;
      document.body.append(frame);
    } else {
      frame.hidden = false;
      frame.contentWindow.location.replace(url.href);
    }
  }
  function showOriginal() {
    frameActive = false;
    requested = '';
    bindings?.abort();
    document.body.classList.remove('kinojo-bgm-host');
    if (frame) {
      frame.hidden = true;
      frame.contentWindow.location.replace('about:blank');
    }
    document.title = original.title;
  }
  function navigate(input) {
    let url;
    try { url = new URL(input, location.href); } catch { return false; }
    if (!eligible(url)) return false;
    if (location.href === url.href && (!frameActive || frameLocation()?.href === url.href)) return true;
    if (!original) {
      original = { href: location.href, title: document.title };
      history.replaceState({ ...history.state, ...state(false) }, '', original.href);
    }
    const managed = url.href !== original.href;
    history.pushState(state(managed), '', hrefOf(url));
    if (managed) showFrame(url);
    else showOriginal();
    return true;
  }
  function follow(event) {
    if (event.defaultPrevented || !event.isTrusted || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest?.('a[href]');
    if (!a || a.hasAttribute('download') || a.relList?.contains('external') ||
        (a.target && a.target.toLowerCase() !== '_self')) return;
    let url;
    try { url = new URL(a.getAttribute('href'), a.ownerDocument.baseURI); } catch { return; }
    const current = new URL(a.ownerDocument.URL);
    if (url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) return;
    if (navigate(url)) event.preventDefault();
    else if (a.ownerDocument !== document && /^https?:$/.test(url.protocol)) {
      event.preventDefault();
      location.assign(url.href);
    }
  }
  document.addEventListener('click', follow);
  window.addEventListener('popstate', event => {
    if (!original) return;
    const url = new URL(location.href);
    if (event.state?.kinojoBgm === session && event.state.managed && eligible(url)) {
      if (!frameActive || frameLocation()?.href !== url.href) showFrame(url);
    } else if (frameActive) showOriginal();
  });
  window.KinojoBgmNavigation = Object.freeze({ navigate });
})();
