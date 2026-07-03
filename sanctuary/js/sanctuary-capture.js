/*
 * KINOJO Sanctuary Capture Bridge
 * Version: 20260702_04
 * Role: 성역 클립보드 복사에서 웹 Canvas 합성을 제거하고 Server Edge Function이 만든 PNG를 클립보드에 넣는 전용 브릿지.
 * Rule: 복사 최소 단위는 포스, 큰 단위는 운영 팀. 파티 단위 복사는 만들지 않는다.
 */
(function(){
  'use strict';

  const EDGE_FUNCTION_NAME = 'sanctuary-copy-render';
  const state = { bound:false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  function currentSanctuaryId(){ return new URLSearchParams(location.search || '').get('id') || 'rudra'; }

  function toast(message){
    if(window.KinojoCommonUI?.toast) return window.KinojoCommonUI.toast(message);
    const el=document.createElement('div');
    el.textContent=message;
    el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:rgba(15,23,42,.88);color:#fff;padding:10px 14px;border-radius:999px;font:800 13px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16)';
    document.body.appendChild(el); setTimeout(()=>el.remove(),2100);
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
    }, 35000);
    const contentType = res.headers.get('content-type') || '';
    if(res.ok && /^image\/png/i.test(contentType)){
      return { ok:true, blob:await res.blob(), contentType:'image/png', filename:res.headers.get('x-kinojo-filename') || payload.filename || 'kinojo-sanctuary.png' };
    }
    if(res.ok && /json/i.test(contentType)){
      const data = await res.json();
      if(data && data.ok && data.dataUrl){
        const blob = await (await fetch(data.dataUrl)).blob();
        return { ok:true, blob, contentType:blob.type || 'image/png', filename:data.filename || payload.filename || 'kinojo-sanctuary.png', meta:data };
      }
      throw new Error(data && (data.message || data.error) || '서버 이미지 응답이 비어 있습니다.');
    }
    const text = await res.text().catch(()=>'');
    throw new Error('Server Copy API HTTP ' + res.status + ' / ' + text.slice(0, 240));
  }

  async function copyBlob(blob){
    if(!blob) throw new Error('복사할 이미지 Blob이 없습니다.');
    if(!navigator.clipboard || typeof navigator.clipboard.write !== 'function') throw new Error('이 브라우저는 이미지 클립보드를 지원하지 않습니다.');
    const type = blob.type || 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
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
      try{ await copyBlob(blob); toast('이미지가 클립보드에 복사되었습니다.'); close(); }
      catch(err){ console.warn('KINOJO server copy retry failed:', err); toast('브라우저가 이미지 클립보드를 막았습니다. PNG 저장을 사용해 주세요.'); }
    });
    modal.querySelector('.kinojo-copy-preview-download')?.addEventListener('click', ()=>downloadBlob(blob, filename));
  }

  async function copyServerRenderedImage(payload){
    const result = await requestServerCopyImage(payload);
    try{
      await copyBlob(result.blob);
      return 'copied';
    }catch(err){
      showServerCopyFallback(result.blob, result.filename, String(err && err.message || err));
      return 'preview';
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
      toast(result === 'copied' ? successText : '서버 이미지를 만들었습니다. 미리보기에서 다시 복사할 수 있습니다.');
    }catch(err){
      console.warn('KINOJO sanctuary server copy failed:', err);
      toast('서버 이미지 생성에 실패했습니다. Edge Function 배포와 Supabase 설정을 확인해 주세요.');
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

  window.KinojoSanctuaryCapture = { bind, version:'20260702_04_server_edge_copy' };
  document.addEventListener('DOMContentLoaded', bind);
})();
