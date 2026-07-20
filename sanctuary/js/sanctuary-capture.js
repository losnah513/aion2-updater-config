/*
 * KINOJO Sanctuary Capture Bridge
 * Version: 20260715_18
 * Role: Edge Function SVG를 PNG Blob으로 변환해 클립보드에 넣는 전용 브릿지.
 * Rule: 복사 최소 단위는 포스, 큰 단위는 운영 팀. 파티 단위 복사는 만들지 않는다.
 */
(function(){
  'use strict';

  const EDGE_FUNCTION_NAME = 'sanctuary-copy-render';
  const state = { bound:false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  function currentSanctuaryId(){ return String(new URLSearchParams(location.search || '').get('id') || window.KinojoSanctuaryCurrentId || '').trim().toLowerCase(); }

  function toast(message, type){
    let host = document.getElementById('kinojoSanctuaryCenterToastHost');
    if(!host){
      host = document.createElement('div');
      host.id = 'kinojoSanctuaryCenterToastHost';
      host.className = 'kinojo-sanctuary-center-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'kinojo-sanctuary-center-toast ' + (type === 'error' ? 'is-error' : type === 'warn' ? 'is-warn' : 'is-success');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('is-visible'));
    setTimeout(()=>{
      el.classList.remove('is-visible');
      el.classList.add('is-leaving');
      setTimeout(()=>{ el.remove(); if(!host.children.length) host.remove(); }, 280);
    }, type === 'error' ? 4200 : 2200);
  }

  function compactErrorMessage(err){
    const raw = safeText(err && err.message ? err.message : err);
    if(!raw) return '알 수 없는 오류';
    return raw.replace(/^Server Copy API HTTP\s*/i, 'HTTP ').slice(0, 160);
  }

  function requireSanctuaryCopyLogin(){
    if(!window.KinojoAuth || typeof window.KinojoAuth.requireLogin !== 'function') return true;
    return window.KinojoAuth.requireLogin('로그인 후 클립보드 복사 기능을 사용할 수 있습니다.', { context:'sanctuary' });
  }

  async function ensureSupabaseConfig(){
    if(window.KinojoSupabase && typeof window.KinojoSupabase.ensureReady === 'function'){
      await window.KinojoSupabase.ensureReady();
    }
    const cfg = window.KinojoSupabase && typeof window.KinojoSupabase.getConfig === 'function'
      ? window.KinojoSupabase.getConfig()
      : ((window.KINOJO_SUPABASE_CONFIG || {}).supabase || window.KINOJO_SUPABASE_CONFIG || {});
    const url = String(cfg.url || '').replace(/\/$/, '');
    const key = String(cfg.publishableKey || cfg.anonKey || '').trim();
    if(!url || !key) throw new Error('Supabase 설정이 준비되지 않았습니다.');
    return { url, key };
  }

  function functionUrl(cfg){
    return cfg.url.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '') + '/functions/v1/' + EDGE_FUNCTION_NAME;
  }

  async function fetchWithTimeout(url, options, ms){
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), ms || 25000);
    try{ return await fetch(url, Object.assign({}, options || {}, { signal:controller.signal })); }
    finally{ clearTimeout(timer); }
  }


  async function svgBlobToPng(svgBlob){
    const svgText = await svgBlob.text();
    const sizeMatch = svgText.match(/<svg[^>]*\bwidth=["']([0-9.]+)["'][^>]*\bheight=["']([0-9.]+)["']/i)
      || svgText.match(/<svg[^>]*\bviewBox=["'][^"']*?([0-9.]+)\s+([0-9.]+)["']/i);
    const width = Math.max(1, Math.round(Number(sizeMatch?.[1] || 1200)));
    const height = Math.max(1, Math.round(Number(sizeMatch?.[2] || 800)));
    const url = URL.createObjectURL(new Blob([svgText], {type:'image/svg+xml'}));
    try{
      const image = await new Promise((resolve,reject)=>{
        const img = new Image();
        img.onload = ()=>resolve(img);
        img.onerror = ()=>reject(new Error('서버 SVG 이미지를 불러오지 못했습니다.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if(!context) throw new Error('PNG 변환 Canvas를 만들지 못했습니다.');
      context.drawImage(image,0,0,width,height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
    }finally{ URL.revokeObjectURL(url); }
  }

  async function requestServerCopyImage(payload){
    const cfg = await ensureSupabaseConfig();
    const res = await fetchWithTimeout(functionUrl(cfg), {
      method:'POST',
      cache:'no-store',
      headers:{
        'content-type':'application/json',
        'apikey':cfg.key,
        'authorization':'Bearer ' + cfg.key
      },
      body:JSON.stringify(payload || {})
    }, 45000);
    const contentType = res.headers.get('content-type') || '';
    if(res.ok && /^image\/png/i.test(contentType)){
      const blob = await res.blob();
      if(!blob || blob.type !== 'image/png') throw new Error('서버 PNG Blob이 올바르지 않습니다.');
      return { ok:true, blob, contentType:'image/png', filename:res.headers.get('x-kinojo-filename') || payload.filename || 'kinojo-sanctuary.png' };
    }
    if(res.ok && /^image\/svg\+xml/i.test(contentType)){
      const svgBlob = await res.blob();
      const blob = await svgBlobToPng(svgBlob);
      const rawName = res.headers.get('x-kinojo-filename') || payload.filename || 'kinojo-sanctuary.png';
      const filename = String(rawName).replace(/\.svg$/i,'.png');
      return { ok:true, blob, contentType:'image/png', filename };
    }
    if(/json/i.test(contentType)){
      const data = await res.json().catch(()=>null);
      throw new Error(data && (data.message || data.error) || '서버 PNG 응답이 아닙니다.');
    }
    const text = await res.text().catch(()=>'');
    throw new Error('Server Copy API HTTP ' + res.status + ' / ' + text.slice(0, 240));
  }

  function assertClipboardReady(){
    if(!window.isSecureContext) throw new Error('HTTPS 보안 컨텍스트에서만 이미지 클립보드를 사용할 수 있습니다.');
    if(!navigator.clipboard || typeof navigator.clipboard.write !== 'function') throw new Error('이 브라우저는 이미지 클립보드를 지원하지 않습니다.');
    if(typeof ClipboardItem === 'undefined') throw new Error('ClipboardItem을 사용할 수 없습니다.');
  }

  async function copyBlob(blob){
    assertClipboardReady();
    if(!blob || blob.type !== 'image/png') throw new Error('복사할 PNG Blob이 없습니다.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  async function copyImagePromiseToClipboard(imagePromise){
    // 중요: Chrome/Edge는 서버 호출/이미지 변환 후 clipboard.write()를 호출하면
    // 사용자 클릭 활성화(user activation)가 끊겨 붙여넣기가 실패하거나 빈 클립보드가 될 수 있다.
    // 따라서 클릭 이벤트 안에서 즉시 clipboard.write()를 호출하고, Blob은 Promise로 지연 공급한다.
    assertClipboardReady();
    const pngPromise = Promise.resolve(imagePromise).then(async (result)=>{
      const blob = result && result.blob ? result.blob : result;
      if(!blob) throw new Error('서버 이미지 Blob이 없습니다.');
      if(blob.type !== 'image/png') throw new Error('서버가 image/png가 아닌 응답을 반환했습니다.');
      return blob;
    });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
    return await pngPromise;
  }

  function downloadBlob(blob, filename){
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url; a.download=filename || 'kinojo-sanctuary.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function showServerCopyFallback(blob, filename, reason){
    let imageUrl = '';
    try{ imageUrl = blob ? URL.createObjectURL(blob) : ''; }catch(_err){}
    let modal = document.getElementById('kinojoSanctuaryCopyPreview');
    if(modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'kinojoSanctuaryCopyPreview';
    modal.className = 'kinojo-copy-preview-modal';
    modal.innerHTML = ''+
      '<div class="kinojo-copy-preview-backdrop" data-preview-close></div>'+ 
      '<div class="kinojo-copy-preview-panel" role="dialog" aria-modal="true" aria-label="성역 복사 이미지 미리보기">'+
        '<div class="kinojo-copy-preview-head"><strong>서버 생성 이미지 / 클립보드 재시도</strong><button type="button" class="kinojo-copy-preview-close" data-preview-close>×</button></div>'+ 
        '<div class="kinojo-copy-preview-body">'+
          '<div class="kinojo-copy-preview-image-wrap">'+(imageUrl ? '<img class="kinojo-copy-preview-image" src="'+imageUrl+'" alt="서버가 생성한 성역 복사 이미지">' : '<div class="kinojo-copy-preview-empty">이미지를 표시하지 못했습니다.</div>')+'</div>'+ 
          '<pre class="kinojo-copy-preview-log"></pre>'+ 
        '</div>'+ 
        '<div class="kinojo-copy-preview-foot"><span>브라우저가 자동 클립보드를 막은 경우 아래 버튼으로 다시 복사합니다.</span><button type="button" class="kinojo-copy-preview-copyimage">이미지 복사</button><button type="button" class="kinojo-copy-preview-download">PNG 저장</button></div>'+ 
      '</div>';
    document.body.appendChild(modal);
    const pre = modal.querySelector('.kinojo-copy-preview-log');
    if(pre) pre.textContent = 'serverRender: OK\ncopyError: ' + (reason || '-') + '\nfile: ' + (filename || '-');
    function close(){ if(imageUrl) URL.revokeObjectURL(imageUrl); modal.remove(); }
    modal.querySelectorAll('[data-preview-close]').forEach(btn=>btn.addEventListener('click', close));
    modal.querySelector('.kinojo-copy-preview-copyimage')?.addEventListener('click', async ()=>{
      try{ await copyBlob(blob); toast('이미지가 클립보드에 복사되었습니다.', 'success'); close(); }
      catch(err){ console.warn('KINOJO server copy retry failed:', err); toast('브라우저가 이미지 클립보드를 막았습니다. PNG 저장을 사용해 주세요.', 'error'); }
    });
    modal.querySelector('.kinojo-copy-preview-download')?.addEventListener('click', ()=>downloadBlob(blob, filename));
  }

  async function copyServerRenderedImage(payload){
    const imagePromise = requestServerCopyImage(payload);
    try{
      await copyImagePromiseToClipboard(imagePromise);
      return 'copied';
    }catch(err){
      let result = null;
      try{ result = await imagePromise; }catch(_err){}
      if(result && result.blob){
        showServerCopyFallback(result.blob, result.filename, String(err && err.message || err));
        return 'preview';
      }
      throw err;
    }
  }

  function forcePayload(btn){
    const team = btn.closest('.team-card');
    if(!team) return null;
    return {
      sanctuaryId:currentSanctuaryId(),
      scope:'force',
      forceNo:Number(team.dataset.force || team.dataset.team || 0) || null,
      forceId:safeText(team.dataset.force || ''),
      filename:'kinojo-force-' + safeText(team.dataset.force || team.dataset.team || 'force') + '.png'
    };
  }

  function teamGroupPayload(btn){
    const group = btn.closest('.san-team-group');
    if(!group) return null;
    return {
      sanctuaryId:currentSanctuaryId(),
      scope:'team',
      teamGroupNo:Number(group.dataset.teamGroup || 0) || null,
      teamGroupName:safeText(group.dataset.teamGroupName || ''),
      filename:'kinojo-team-' + safeText(group.dataset.teamGroup || 'team') + '.png'
    };
  }

  async function handleCopy(btn, buildPayload, successText){
    if(!requireSanctuaryCopyLogin()) return;
    const payload = buildPayload(btn);
    if(!payload) return;
    const oldHtml = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-copying');
    try{
      const result = await copyServerRenderedImage(payload);
      toast(result === 'copied' ? successText : '서버 이미지를 만들었습니다. 미리보기에서 다시 복사할 수 있습니다.', result === 'copied' ? 'success' : 'warn');
    }catch(err){
      console.warn('KINOJO sanctuary server copy failed:', err);
      toast('서버 이미지 생성 실패: ' + compactErrorMessage(err), 'error');
    }finally{
      btn.disabled = false; btn.classList.remove('is-copying'); btn.innerHTML = oldHtml;
    }
  }

  function ensureFloatingTooltip(){
    let tip = document.getElementById('kinojoFloatingTooltip');
    if(!tip){
      tip = document.createElement('div');
      tip.id = 'kinojoFloatingTooltip';
      tip.className = 'kinojo-floating-tooltip';
      tip.setAttribute('role','tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showFloatingTooltip(btn){
    const text = btn?.dataset?.kinojoTooltip || btn?.getAttribute('title') || '';
    if(!text) return;
    const tip = ensureFloatingTooltip();
    tip.textContent = text;
    tip.classList.add('show');
    const rect = btn.getBoundingClientRect();
    const pad = 10;
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = clamp(left, pad, window.innerWidth - tipRect.width - pad);
    let top = rect.top - tipRect.height - 10;
    if(top < pad) top = rect.bottom + 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideFloatingTooltip(){ document.getElementById('kinojoFloatingTooltip')?.classList.remove('show'); }
  function bindFloatingTooltip(btn){
    if(!btn || btn.dataset.floatingTooltipBound === '1') return;
    btn.dataset.floatingTooltipBound = '1';
    btn.addEventListener('mouseenter', ()=>showFloatingTooltip(btn));
    btn.addEventListener('focus', ()=>showFloatingTooltip(btn));
    btn.addEventListener('mouseleave', hideFloatingTooltip);
    btn.addEventListener('blur', hideFloatingTooltip);
    btn.addEventListener('click', hideFloatingTooltip);
  }

  function bind(){
    document.querySelectorAll('[data-force-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      bindFloatingTooltip(btn);
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleCopy(btn, forcePayload, '포스 이미지가 클립보드에 복사되었습니다.'); });
    });
    document.querySelectorAll('[data-team-group-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      bindFloatingTooltip(btn);
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleCopy(btn, teamGroupPayload, '팀 전체 이미지가 클립보드에 복사되었습니다.'); });
    });
  }

  window.KinojoSanctuaryCapture = { bind, version:'20260715_18_native_svg_png_bridge' };
  document.addEventListener('DOMContentLoaded', bind);
})();
