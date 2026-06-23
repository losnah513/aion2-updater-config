(function(){
  'use strict';

  const WATERMARK = '해당 이미지는 KINOJO AI가 생성했습니다';
  const state = { bound: false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';
  const API_URL = (window.KINOJO_API_URL || new URLSearchParams(location.search).get('api') || DEFAULT_WEB_APP_URL);
  const profileDataUrlCache = new Map();

  function apiUrl(){ return API_URL; }

  async function requestProfileProxy(payload, mode){
    if(mode === 'get'){
      const params = new URLSearchParams({ action:'profileImageProxy', url:payload.url });
      const res = await fetch(apiUrl() + (apiUrl().includes('?') ? '&' : '?') + params.toString(), { method:'GET' });
      return res.json();
    }
    const res = await fetch(apiUrl(), {
      method:'POST',
      body:JSON.stringify({ action:'profileImageProxy', url:payload.url })
    });
    return res.json();
  }

  async function proxyProfileImageUrl(src){
    const url = safeText(src).replace(/&amp;/g, '&');
    if(!url) return '';
    if(url.startsWith('data:image/')) return url;
    if(profileDataUrlCache.has(url)) return profileDataUrlCache.get(url);

    let dataUrl = '';
    try{
      // 1차: 기존 POST 방식. 로그인/관리 API와 같은 경로를 사용합니다.
      const data = await requestProfileProxy({ url }, 'post');
      dataUrl = data && data.ok && data.dataUrl ? data.dataUrl : '';
      if(!dataUrl && data && !data.ok){
        console.warn('KINOJO profile proxy POST returned not ok:', data.message || data.status || data);
      }
    }catch(err){
      console.warn('KINOJO profile proxy POST failed:', err);
    }

    if(!dataUrl){
      try{
        // 2차: POST가 브라우저/배포 환경에서 막히는 경우를 대비한 GET 보정.
        const data = await requestProfileProxy({ url }, 'get');
        dataUrl = data && data.ok && data.dataUrl ? data.dataUrl : '';
        if(!dataUrl && data && !data.ok){
          console.warn('KINOJO profile proxy GET returned not ok:', data.message || data.status || data);
        }
      }catch(err){
        console.warn('KINOJO profile proxy GET failed:', err);
      }
    }

    profileDataUrlCache.set(url, dataUrl || '');
    return dataUrl || '';
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
      // data URL에는 crossOrigin을 걸지 않습니다. 일부 브라우저에서 data URL + crossOrigin 조합이
      // 로딩 실패로 처리되어 프로필 대신 클래스 아이콘 fallback이 뜨는 문제가 있었습니다.
      if(/^https?:\/\//i.test(url)) img.crossOrigin = 'anonymous';
      img.onload = ()=>resolve(img);
      img.onerror = ()=>resolve(null);
      img.src = url;
    });
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
    const width = 620;
    const cols = 2;
    const gap = 10;
    const pad = 20;
    const headerH = 76;
    const footH = 34;
    const cellW = Math.floor((width - pad*2 - gap) / cols);
    const cellH = 76;
    const rows = Math.max(1, Math.ceil(data.members.length / cols));
    const height = pad + headerH + rows*cellH + (rows-1)*gap + footH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    drawPartyBase(ctx, width, height, data.title, opts.subtitle, data.count);

    const icons = await Promise.all(data.members.map(m=>loadImage(m.icon)));
    const profileUrls = await Promise.all(data.members.map(m=>proxyProfileImageUrl(m.profileImage)));
    const profiles = await Promise.all(profileUrls.map(src=>loadImage(src)));
    if(window.KINOJO_SANCTUARY_PROFILE_DEBUG){
      console.table(data.members.map((m, i)=>({
        name:m.name,
        hasProfileUrl:!!m.profileImage,
        proxied:!!profileUrls[i],
        loaded:!!profiles[i]
      })));
    }
    let y = pad + headerH;
    data.members.forEach((m, idx)=>{
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col*(cellW + gap);
      const cy = y + row*(cellH + gap);
      const profileSize = 56;
      const profileX = x + cellW - profileSize - 10;
      const profileY = cy + Math.floor((cellH - profileSize) / 2);
      ctx.fillStyle = m.empty ? '#fbfdff' : '#ffffff';
      roundRect(ctx,x,cy,cellW,cellH,16); ctx.fill();
      ctx.strokeStyle = m.empty ? '#d6deeb' : '#dce5f2'; ctx.lineWidth = 1.4; ctx.setLineDash(m.empty ? [7,6] : []); ctx.stroke(); ctx.setLineDash([]);
      if(icons[idx]) ctx.drawImage(icons[idx], x+12, cy+18, 22, 22);
      else{ ctx.fillStyle = m.empty ? '#edf2f7' : '#eaf1fb'; roundRect(ctx,x+12,cy+18,22,22,7); ctx.fill(); }
      ctx.fillStyle = m.empty ? '#7b8798' : '#1f2f46'; ctx.font = '900 17px Arial, sans-serif';
      drawText(ctx, m.name || (m.empty?'모집중':'-'), x+42, cy+16, cellW-112, 21);
      ctx.fillStyle = '#667085'; ctx.font = '800 11px Arial, sans-serif';
      drawText(ctx, m.meta || '', x+42, cy+44, cellW-112, 15);
      if(profiles[idx]) drawCircleImage(ctx, profiles[idx], profileX, profileY, profileSize);
      else drawFallbackProfile(ctx, icons[idx], profileX, profileY, profileSize, m.empty);
    });

    ctx.fillStyle = '#718096'; ctx.font = '800 14px Arial, sans-serif';
    const wmWidth = ctx.measureText(WATERMARK).width;
    ctx.fillText(WATERMARK, width - pad - wmWidth, height - pad - 18);
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
    const width = 620;
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
