(function(){
  'use strict';

  const WATERMARK = '해당 이미지는 KINOJO AI가 생성했습니다';
  const state = { bound: false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';
  const API_URL = (new URLSearchParams(location.search).get('api') || window.KINOJO_API_URL || window.WEB_APP_URL || DEFAULT_WEB_APP_URL);
  const profileDataUrlCache = new Map();
  const profileRetryDelayMs = 180;
  const diagnosticState = { last: null };

  function apiUrl(){ return API_URL; }

  function profileDebugEnabled(){
    return !!(window.KINOJO_SANCTUARY_PROFILE_DEBUG || new URLSearchParams(location.search).get('profileDebug') === '1');
  }

  async function readProxyJson(res, label){
    const text = await res.text();
    if(!res.ok){
      throw new Error(label + ' HTTP ' + res.status + ' / ' + text.slice(0, 160));
    }
    try{
      return JSON.parse(text);
    }catch(err){
      throw new Error(label + ' JSON parse failed / ' + text.slice(0, 160));
    }
  }

  async function fetchWithTimeout(url, options, ms){
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), ms || 12000);
    try{
      return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
    }finally{
      clearTimeout(timer);
    }
  }

  async function requestProfileProxy(payload){
    const label = 'KINOJO profile proxy GET';
    const params = new URLSearchParams({
      action:'profileImageProxy',
      url:payload.url,
      t:String(Date.now())
    });
    const res = await fetchWithTimeout(apiUrl() + (apiUrl().includes('?') ? '&' : '?') + params.toString(), {
      method:'GET',
      cache:'no-store'
    }, 15000);
    return readProxyJson(res, label);
  }

  async function proxyProfileImageUrl(src, diagnostic){
    const url = safeText(src).replace(/&amp;/g, '&');
    if(!url) return '';
    if(url.startsWith('data:image/')) {
      if(diagnostic) diagnostic.proxy = { skipped:true, reason:'already data url' };
      return url;
    }
    if(profileDataUrlCache.has(url)) {
      if(diagnostic) diagnostic.proxy = { cached:true, ok:true, length:profileDataUrlCache.get(url).length };
      return profileDataUrlCache.get(url);
    }

    let dataUrl = '';
    const failures = [];

    try{
      const data = await requestProfileProxy({ url });
      dataUrl = data && data.ok && data.dataUrl ? data.dataUrl : '';
      if(dataUrl){
        if(diagnostic) diagnostic.proxy = {
          ok:true,
          cached:!!data.cached,
          length:dataUrl.length,
          contentType:data.contentType || '',
          status:data.status || 200
        };
        if(profileDebugEnabled()){
          console.info('KINOJO profile proxy OK:', {
            mode:'get',
            url,
            length:dataUrl.length,
            cached:!!data.cached,
            contentType:data.contentType || ''
          });
        }
      }else{
        const fail = {
          mode:'get',
          ok:false,
          message:data && (data.message || data.error) || 'not ok',
          status:data && data.status || '',
          contentType:data && (data.contentType || data.headerContentType) || '',
          bodySample:data && data.bodySample || ''
        };
        failures.push(fail);
        if(diagnostic) diagnostic.proxy = fail;
      }
    }catch(err){
      failures.push({ mode:'get', message:String(err && err.message || err) });
    }

    if(dataUrl){
      profileDataUrlCache.set(url, dataUrl);
      return dataUrl;
    }

    // 실패값을 캐시에 저장하지 않습니다. 이전 버전은 빈 문자열도 캐시해서 한 번 실패하면
    // 새로고침 전까지 계속 클래스 아이콘 fallback만 표시되는 문제가 있었습니다.
    if(diagnostic && !diagnostic.proxy) diagnostic.proxy = { ok:false, failures };
    if(profileDebugEnabled()){
      console.warn('KINOJO profile proxy failed:', { url, failures });
    }
    return '';
  }

  function getMemberData(card){
    const empty = card.classList.contains('empty-slot');
    if(empty){
      return {
        empty:true,
        name:safeText(card.querySelector('strong')?.textContent || '모집중'),
        meta:safeText(card.querySelector('span')?.textContent || ''),
        icon:'',
        profileImage:''
      };
    }
    return {
      empty:false,
      name:safeText(card.querySelector('.char-name')?.textContent),
      meta:safeText(card.querySelector('.char-meta')?.textContent),
      icon:card.querySelector('.class-icon')?.src || card.querySelector('img')?.src || '',
      profileImage:safeText(card.dataset.profileImage || '')
    };
  }

  function getPartyData(party){
    const title = safeText(party.querySelector('.party-title')?.textContent || '파티');
    const count = safeText(party.querySelector('.party-count')?.textContent || '');
    const members = Array.from(party.querySelectorAll('.char-card,.empty-slot')).map(getMemberData);
    return { title, count, members };
  }

  function getTeamData(team){
    const name = safeText(team.querySelector('.team-name span')?.textContent || team.querySelector('.team-name')?.textContent || 'TEAM');
    const meta = safeText(team.querySelector('.team-meta')?.textContent || '');
    const leader = safeText(team.querySelector('.leader')?.textContent || '');
    const parties = Array.from(team.querySelectorAll('.party-card')).map(getPartyData);
    return { name, meta, leader, parties };
  }

  function roundRect(ctx,x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, maxWidth, lineHeight){
    const value = safeText(text);
    if(!value) return y;
    if(ctx.measureText(value).width <= maxWidth){ ctx.fillText(value, x, y); return y + lineHeight; }
    let line = '';
    for(const ch of value){
      const test = line + ch;
      if(ctx.measureText(test).width > maxWidth && line){
        ctx.fillText(line, x, y); y += lineHeight; line = ch;
      }else line = test;
    }
    if(line) ctx.fillText(line, x, y);
    return y + lineHeight;
  }

  async function loadImage(src){
    const url = safeText(src).replace(/&amp;/g, '&');
    if(!url) return null;
    return new Promise((resolve)=>{
      const img = new Image();
      // data URL에는 crossOrigin을 걸지 않습니다. 외부 URL은 canvas 정합성을 위해 anonymous로 시도합니다.
      if(/^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous';
      img.onload = ()=>resolve(img);
      img.onerror = ()=>resolve(null);
      img.src = url;
    });
  }

  async function loadProfileImage(profileUrl, name){
    const original = safeText(profileUrl).replace(/&amp;/g, '&');
    const diagnostic = {
      name: safeText(name),
      hasProfileUrl: !!original,
      profileUrl: original,
      direct: null,
      proxy: null,
      dataUrlLoad: null,
      finalSource: 'none'
    };
    if(!original) return { img:null, source:'none', diagnostic };

    // 1) 우선 원본 URL을 CORS anonymous로 직접 시도합니다. profileimg 서버가 CORS를 허용하면 가장 빠릅니다.
    const direct = await loadImage(original);
    diagnostic.direct = { ok: !!direct };
    if(direct){
      diagnostic.finalSource = 'direct';
      if(profileDebugEnabled()) console.info('KINOJO profile direct OK:', name || '', original);
      return { img:direct, source:'direct', diagnostic };
    }

    // 2) 직접 로딩 실패 시 Apps Script 프록시가 반환한 data URL을 시도합니다.
    const proxied = await proxyProfileImageUrl(original, diagnostic);
    if(proxied){
      diagnostic.dataUrlLoad = { tried:true, length:proxied.length };
      const proxyImg = await loadImage(proxied);
      diagnostic.dataUrlLoad.ok = !!proxyImg;
      if(proxyImg){
        diagnostic.finalSource = 'proxy';
        if(profileDebugEnabled()) console.info('KINOJO profile proxy image OK:', name || '', original);
        return { img:proxyImg, source:'proxy', diagnostic };
      }
      if(profileDebugEnabled()) console.warn('KINOJO profile proxy dataUrl load failed:', name || '', original, proxied.slice(0, 48));
    }

    diagnostic.finalSource = 'fallback';
    if(profileDebugEnabled()) console.warn('KINOJO profile all failed:', name || '', original);
    return { img:null, source:'fallback', diagnostic };
  }


  function sleep(ms){ return new Promise(resolve=>setTimeout(resolve, ms || 0)); }

  async function loadProfileImageStable(profileUrl, name){
    const first = await loadProfileImage(profileUrl, name);
    if(first && first.img) return first;

    const original = safeText(profileUrl).replace(/&amp;/g, '&');
    const mergedDiagnostic = Object.assign({}, first && first.diagnostic ? first.diagnostic : {});
    mergedDiagnostic.retry = { tried:false, ok:false };
    if(!original) return first;

    for(let attempt = 1; attempt <= 2; attempt++){
      await sleep(profileRetryDelayMs * attempt);
      const retryDiagnostic = {
        profileUrl: original,
        hasProfileUrl: true,
        direct: { skipped:true, reason:'retry uses proxy only' },
        retryAttempt: attempt
      };
      const proxied = await proxyProfileImageUrl(original, retryDiagnostic);
      if(proxied){
        retryDiagnostic.dataUrlLoad = { tried:true, length:proxied.length };
        const proxyImg = await loadImage(proxied);
        retryDiagnostic.dataUrlLoad.ok = !!proxyImg;
        if(proxyImg){
          mergedDiagnostic.retry = { tried:true, ok:true, attempt };
          return { img:proxyImg, source:'proxy-retry-' + attempt, diagnostic:Object.assign(mergedDiagnostic, retryDiagnostic) };
        }
      }
      mergedDiagnostic.retry = { tried:true, ok:false, attempt, proxy:retryDiagnostic.proxy || null, dataUrlLoad:retryDiagnostic.dataUrlLoad || null };
    }
    return { img:null, source:'fallback', diagnostic:mergedDiagnostic };
  }

  async function loadProfilesSequential(members){
    const results = [];
    for(const member of members){
      results.push(await loadProfileImageStable(member.profileImage, member.name));
      await sleep(70);
    }
    return results;
  }

  function drawCircleImage(ctx, img, x, y, size){
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    const ratio = Math.max(size / img.width, size / img.height);
    const sw = size / ratio;
    const sh = size / ratio;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2 - 2, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#d7e2f2'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2 + 1, 0, Math.PI*2); ctx.stroke();
  }

  function drawFallbackProfile(ctx, icon, x, y, size, empty){
    ctx.fillStyle = empty ? '#edf2f7' : '#eaf1fb';
    ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2 - 2, 0, Math.PI*2); ctx.stroke();
    if(icon){
      const iconSize = Math.floor(size * 0.48);
      ctx.drawImage(icon, x + (size-iconSize)/2, y + (size-iconSize)/2, iconSize, iconSize);
    }else{
      ctx.fillStyle = empty ? '#94a3b8' : '#9fb4d1';
      ctx.font = '900 13px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(empty ? '+' : 'K', x + size/2, y + size/2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  }

  function drawPartyBase(ctx, width, height, title, sub, count){
    ctx.fillStyle = '#f7f9fd';
    ctx.fillRect(0,0,width,height);
    const grad = ctx.createLinearGradient(0,0,width,height);
    grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#eef4ff');
    ctx.fillStyle = grad;
    roundRect(ctx,14,14,width-28,height-28,22); ctx.fill();
    ctx.strokeStyle = '#d9e2f0'; ctx.lineWidth = 2; ctx.stroke();

    const pad = 28;
    ctx.fillStyle = '#1f2f46'; ctx.font = '800 27px Arial, sans-serif'; ctx.textBaseline='top';
    ctx.fillText(title, pad, pad);
    ctx.fillStyle = '#667085'; ctx.font = '800 17px Arial, sans-serif';
    if(count) ctx.fillText(count, width - pad - ctx.measureText(count).width, pad + 6);
    ctx.fillStyle = '#8a5a0a'; ctx.font = '800 13px Arial, sans-serif';
    ctx.fillText(sub || 'KINOJO Sanctuary Party', pad, pad + 38);
  }

  async function renderPartyCanvas(data, options){
    const opts = options || {};
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = 540;
    const cols = 2;
    const gap = 10;
    const pad = 20;
    const headerH = 76;
    const footH = 34;
    const cellW = Math.floor((width - pad*2 - gap) / cols);
    const cellH = 68;
    const rows = Math.max(1, Math.ceil(data.members.length / cols));
    const height = pad + headerH + rows*cellH + (rows-1)*gap + footH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    drawPartyBase(ctx, width, height, data.title, opts.subtitle, data.count);

    const icons = await Promise.all(data.members.map(m=>loadImage(m.icon)));
    const profileResults = await loadProfilesSequential(data.members);
    const profiles = profileResults.map(item=>item.img);
    const diagnostics = {
      type:'party',
      title:data.title,
      createdAt:new Date().toISOString(),
      members:data.members.map((m, i)=>Object.assign({
        index:i,
        name:m.name,
        empty:!!m.empty,
        hasClassIcon:!!m.icon,
        finalProfileLoaded:!!profiles[i],
        profileSource:profileResults[i]?.source || 'none'
      }, profileResults[i]?.diagnostic || {}))
    };
    if(window.KINOJO_SANCTUARY_PROFILE_DEBUG || new URLSearchParams(location.search).get('profileDebug') === '1'){
      console.table(diagnostics.members.map((m)=>({
        name:m.name,
        hasProfileUrl:m.hasProfileUrl,
        profileSource:m.profileSource,
        loaded:m.finalProfileLoaded,
        proxyStatus:m.proxy && m.proxy.status || '',
        proxyType:m.proxy && m.proxy.contentType || '',
        proxyMessage:m.proxy && m.proxy.message || ''
      })));
    }
    let y = pad + headerH;
    data.members.forEach((m, idx)=>{
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col*(cellW + gap);
      const cy = y + row*(cellH + gap);
      const profileSize = 52;
      const profileX = x + cellW - profileSize - 10;
      const profileY = cy + Math.floor((cellH - profileSize) / 2);
      ctx.fillStyle = m.empty ? '#fbfdff' : '#ffffff';
      roundRect(ctx,x,cy,cellW,cellH,16); ctx.fill();
      ctx.strokeStyle = m.empty ? '#d6deeb' : '#dce5f2'; ctx.lineWidth = 1.4; ctx.setLineDash(m.empty ? [7,6] : []); ctx.stroke(); ctx.setLineDash([]);
      if(icons[idx]) ctx.drawImage(icons[idx], x+12, cy+18, 22, 22);
      else{ ctx.fillStyle = m.empty ? '#edf2f7' : '#eaf1fb'; roundRect(ctx,x+12,cy+18,22,22,7); ctx.fill(); }
      ctx.fillStyle = m.empty ? '#7b8798' : '#1f2f46'; ctx.font = '900 17px Arial, sans-serif';
      drawText(ctx, m.name || (m.empty?'모집중':'-'), x+42, cy+14, cellW-104, 21);
      ctx.fillStyle = '#667085'; ctx.font = '800 11px Arial, sans-serif';
      drawText(ctx, m.meta || '', x+42, cy+40, cellW-104, 15);
      if(profiles[idx]) drawCircleImage(ctx, profiles[idx], profileX, profileY, profileSize);
      else drawFallbackProfile(ctx, icons[idx], profileX, profileY, profileSize, m.empty);
    });

    ctx.fillStyle = '#718096'; ctx.font = '800 14px Arial, sans-serif';
    const wmWidth = ctx.measureText(WATERMARK).width;
    ctx.fillText(WATERMARK, width - pad - wmWidth, height - pad - 18);
    canvas.kinojoDiagnostics = diagnostics;
    diagnosticState.last = diagnostics;
    window.KinojoSanctuaryLastProfileDiagnostics = diagnostics;
    return canvas;
  }

  async function makePartyCanvas(party){
    return renderPartyCanvas(getPartyData(party));
  }

  async function makeTeamCanvas(team){
    const data = getTeamData(team);
    const partyCanvases = [];
    for(const party of data.parties){
      partyCanvases.push(await renderPartyCanvas(party, { subtitle: data.name + ' · KINOJO Sanctuary Party' }));
    }
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = 540;
    const gap = 14;
    const pad = 20;
    const headerH = 78;
    const height = headerH + partyCanvases.reduce((sum,c)=>sum + Math.round(c.height / dpr), 0) + Math.max(0, partyCanvases.length-1)*gap + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    ctx.fillStyle = '#eef4ff';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#1f2f46'; ctx.font = '900 30px Arial, sans-serif'; ctx.textBaseline='top';
    ctx.fillText(data.name, pad, 20);
    ctx.fillStyle = '#667085'; ctx.font = '800 13px Arial, sans-serif';
    ctx.fillText([data.meta, data.leader].filter(Boolean).join(' · '), pad, 56);

    let y = headerH;
    partyCanvases.forEach((partyCanvas)=>{
      ctx.drawImage(partyCanvas, 0, y, width, Math.round(partyCanvas.height / dpr));
      y += Math.round(partyCanvas.height / dpr) + gap;
    });
    return canvas;
  }

  function canvasToBlob(canvas){
    return new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
  }

  async function copyBlob(blob){
    if(!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard unsupported');
    await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
  }

  function downloadBlob(blob, filename){
    const a=document.createElement('a');
    const url=URL.createObjectURL(blob);
    a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function requireSanctuaryCopyLogin(){
    if(!window.KinojoAuth || typeof window.KinojoAuth.requireLogin !== 'function') return true;
    return window.KinojoAuth.requireLogin('로그인 후 클립보드 복사 기능을 사용할 수 있습니다.', { context:'sanctuary' });
  }

  function toast(message){
    if(window.KinojoCommonUI?.toast) return window.KinojoCommonUI.toast(message);
    const el=document.createElement('div');
    el.textContent=message;
    el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:rgba(15,23,42,.88);color:#fff;padding:10px 14px;border-radius:999px;font:800 13px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.16)';
    document.body.appendChild(el); setTimeout(()=>el.remove(),2100);
  }


  function formatDiagnosticText(diag){
    if(!diag) return '진단 정보 없음';
    const lines = [];
    lines.push('title: ' + (diag.title || '-'));
    lines.push('createdAt: ' + (diag.createdAt || '-'));
    lines.push('');
    (diag.members || []).forEach((m, idx)=>{
      lines.push('[' + (idx+1) + '] ' + (m.name || '-') + (m.empty ? ' (empty)' : ''));
      lines.push('  profileUrl: ' + (m.hasProfileUrl ? '있음' : '없음'));
      lines.push('  direct: ' + (m.direct ? (m.direct.ok ? 'OK' : 'FAIL') : '-'));
      const proxy = m.proxy || {};
      if(proxy.skipped) lines.push('  proxy: skipped / ' + (proxy.reason || ''));
      else lines.push('  proxy: ' + (proxy.ok ? 'OK' : 'FAIL') + ' status=' + (proxy.status || '-') + ' type=' + (proxy.contentType || '-'));
      if(proxy.message) lines.push('  proxyMessage: ' + proxy.message);
      if(proxy.bodySample) lines.push('  bodySample: ' + String(proxy.bodySample).slice(0, 120));
      lines.push('  dataUrlLoad: ' + (m.dataUrlLoad ? (m.dataUrlLoad.ok ? 'OK' : 'FAIL') + ' length=' + (m.dataUrlLoad.length || '-') : '-'));
      lines.push('  final: ' + (m.finalProfileLoaded ? 'PROFILE / ' + (m.profileSource || '-') : 'FALLBACK CLASS ICON'));
      lines.push('');
    });
    return lines.join('\n');
  }

  function showCopyPreview(canvas, filename){
    const diag = canvas && canvas.kinojoDiagnostics;
    let imageUrl = '';
    try{ imageUrl = canvas.toDataURL('image/png'); }
    catch(err){ console.warn('KINOJO preview toDataURL failed:', err); }

    let modal = document.getElementById('kinojoSanctuaryCopyPreview');
    if(modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'kinojoSanctuaryCopyPreview';
    modal.className = 'kinojo-copy-preview-modal';
    modal.innerHTML = ''+
      '<div class="kinojo-copy-preview-backdrop" data-preview-close></div>'+
      '<div class="kinojo-copy-preview-panel" role="dialog" aria-modal="true" aria-label="성역 복사 이미지 미리보기">'+
        '<div class="kinojo-copy-preview-head">'+
          '<strong>복사 이미지 미리보기 / 프로필 진단</strong>'+
          '<button type="button" class="kinojo-copy-preview-close" data-preview-close>×</button>'+
        '</div>'+
        '<div class="kinojo-copy-preview-body">'+
          '<div class="kinojo-copy-preview-image-wrap">'+
            (imageUrl ? '<img class="kinojo-copy-preview-image" src="'+imageUrl+'" alt="클립보드 복사 예정 이미지">' : '<div class="kinojo-copy-preview-empty">이미지 미리보기를 생성하지 못했습니다.</div>')+
          '</div>'+
          '<pre class="kinojo-copy-preview-log"></pre>'+
        '</div>'+
        '<div class="kinojo-copy-preview-foot">'+
          '<span>이 창은 원인 확인용 임시 기능입니다. 실제 클립보드 복사는 계속 진행됩니다.</span>'+
          '<button type="button" class="kinojo-copy-preview-copylog">진단 로그 복사</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(modal);
    const logText = formatDiagnosticText(diag);
    const pre = modal.querySelector('.kinojo-copy-preview-log');
    if(pre) pre.textContent = logText;
    modal.querySelectorAll('[data-preview-close]').forEach(btn=>btn.addEventListener('click', ()=>modal.remove()));
    const copyLog = modal.querySelector('.kinojo-copy-preview-copylog');
    if(copyLog){
      copyLog.addEventListener('click', async ()=>{
        try{ await navigator.clipboard.writeText(logText); toast('진단 로그를 복사했습니다.'); }
        catch(_err){ toast('진단 로그 복사에 실패했습니다.'); }
      });
    }
    console.info('KINOJO sanctuary copy diagnostics:', diag);
  }

  async function copyCanvasWithFallback(canvas, filename){
    const blob = await canvasToBlob(canvas);
    if(!blob) throw new Error('blob empty');
    try{
      await copyBlob(blob);
      return 'copied';
    }catch(err){
      downloadBlob(blob, filename);
      return 'downloaded';
    }
  }

  async function handleCopy(btn){
    if(!requireSanctuaryCopyLogin()) return;
    const party = btn.closest('.party-card');
    if(!party) return;
    const oldHtml = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-copying');
    try{
      const canvas = await makePartyCanvas(party);
      showCopyPreview(canvas, 'kinojo-party-'+safeText(party.dataset.partyNo || 'party')+'.png');
      const result = await copyCanvasWithFallback(canvas, 'kinojo-party-'+safeText(party.dataset.partyNo || 'party')+'.png');
      toast(result === 'copied' ? '파티 이미지가 클립보드에 복사되었습니다.' : '클립보드 복사 제한으로 PNG 파일을 저장했습니다.');
    }catch(err){
      console.warn('KINOJO party capture failed:', err);
      toast('파티 이미지 생성에 실패했습니다.');
    }finally{
      btn.disabled = false; btn.classList.remove('is-copying'); btn.innerHTML = oldHtml;
    }
  }

  async function handleTeamCopy(btn){
    if(!requireSanctuaryCopyLogin()) return;
    const team = btn.closest('.team-card');
    if(!team) return;
    const oldHtml = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-copying');
    try{
      const canvas = await makeTeamCanvas(team);
      showCopyPreview(canvas, 'kinojo-team-'+safeText(team.dataset.team || 'team')+'.png');
      const result = await copyCanvasWithFallback(canvas, 'kinojo-team-'+safeText(team.dataset.team || 'team')+'.png');
      toast(result === 'copied' ? '팀 전체 파티 이미지가 클립보드에 복사되었습니다.' : '클립보드 복사 제한으로 PNG 파일을 저장했습니다.');
    }catch(err){
      console.warn('KINOJO team capture failed:', err);
      toast('팀 전체 이미지 생성에 실패했습니다.');
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

  function hideFloatingTooltip(){
    const tip = document.getElementById('kinojoFloatingTooltip');
    if(tip) tip.classList.remove('show');
  }

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
    document.querySelectorAll('[data-party-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      bindFloatingTooltip(btn);
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleCopy(btn); });
    });
    document.querySelectorAll('[data-team-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      bindFloatingTooltip(btn);
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleTeamCopy(btn); });
    });
  }

  window.KinojoSanctuaryCapture = { bind, makePartyCanvas, makeTeamCanvas };
  document.addEventListener('DOMContentLoaded', bind);
})();
