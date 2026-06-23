(function(){
  'use strict';

  const WATERMARK = '해당 이미지는 KINOJO AI가 생성했습니다';
  const state = { bound: false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

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
    if(!src) return null;
    return new Promise((resolve)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>resolve(img);
      img.onerror = ()=>resolve(null);
      img.src = src;
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
    ctx.fillStyle = '#1f2f46'; ctx.font = '800 31px Arial, sans-serif'; ctx.textBaseline='top';
    ctx.fillText(title, pad, pad);
    ctx.fillStyle = '#667085'; ctx.font = '800 17px Arial, sans-serif';
    if(count) ctx.fillText(count, width - pad - ctx.measureText(count).width, pad + 8);
    ctx.fillStyle = '#8a5a0a'; ctx.font = '800 14px Arial, sans-serif';
    ctx.fillText(sub || 'KINOJO Sanctuary Party', pad, pad + 43);
  }

  async function renderPartyCanvas(data, options){
    const opts = options || {};
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = 900;
    const cols = 2;
    const gap = 14;
    const pad = 28;
    const headerH = 86;
    const footH = 46;
    const cellW = Math.floor((width - pad*2 - gap) / cols);
    const cellH = 104;
    const rows = Math.max(1, Math.ceil(data.members.length / cols));
    const height = pad + headerH + rows*cellH + (rows-1)*gap + footH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    drawPartyBase(ctx, width, height, data.title, opts.subtitle, data.count);

    const icons = await Promise.all(data.members.map(m=>loadImage(m.icon)));
    const profiles = await Promise.all(data.members.map(m=>loadImage(m.profileImage)));
    let y = pad + headerH;
    data.members.forEach((m, idx)=>{
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col*(cellW + gap);
      const cy = y + row*(cellH + gap);
      const profileSize = 62;
      const profileX = x + cellW - profileSize - 15;
      const profileY = cy + Math.floor((cellH - profileSize) / 2);
      ctx.fillStyle = m.empty ? '#fbfdff' : '#ffffff';
      roundRect(ctx,x,cy,cellW,cellH,16); ctx.fill();
      ctx.strokeStyle = m.empty ? '#d6deeb' : '#dce5f2'; ctx.lineWidth = 1.5; ctx.setLineDash(m.empty ? [7,6] : []); ctx.stroke(); ctx.setLineDash([]);
      if(icons[idx]) ctx.drawImage(icons[idx], x+17, cy+23, 28, 28);
      else{ ctx.fillStyle = m.empty ? '#edf2f7' : '#eaf1fb'; roundRect(ctx,x+17,cy+23,28,28,8); ctx.fill(); }
      ctx.fillStyle = m.empty ? '#7b8798' : '#1f2f46'; ctx.font = '900 19px Arial, sans-serif';
      drawText(ctx, m.name || (m.empty?'모집중':'-'), x+55, cy+19, cellW-140, 23);
      ctx.fillStyle = '#667085'; ctx.font = '800 13px Arial, sans-serif';
      drawText(ctx, m.meta || '', x+55, cy+51, cellW-140, 17);
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
    const width = 900;
    const gap = 20;
    const pad = 28;
    const headerH = 92;
    const height = headerH + partyCanvases.reduce((sum,c)=>sum + Math.round(c.height / dpr), 0) + Math.max(0, partyCanvases.length-1)*gap + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    ctx.fillStyle = '#eef4ff';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#1f2f46'; ctx.font = '900 34px Arial, sans-serif'; ctx.textBaseline='top';
    ctx.fillText(data.name, pad, 24);
    ctx.fillStyle = '#667085'; ctx.font = '800 15px Arial, sans-serif';
    ctx.fillText([data.meta, data.leader].filter(Boolean).join(' · '), pad, 64);

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
    const party = btn.closest('.party-card');
    if(!party) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = '생성중';
    try{
      const canvas = await makePartyCanvas(party);
      const result = await copyCanvasWithFallback(canvas, 'kinojo-party-'+safeText(party.dataset.partyNo || 'party')+'.png');
      toast(result === 'copied' ? '파티 이미지가 클립보드에 복사되었습니다.' : '클립보드 복사 제한으로 PNG 파일을 저장했습니다.');
    }catch(err){
      console.warn('KINOJO party capture failed:', err);
      toast('파티 이미지 생성에 실패했습니다.');
    }finally{
      btn.disabled = false; btn.textContent = old;
    }
  }

  async function handleTeamCopy(btn){
    const team = btn.closest('.team-card');
    if(!team) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = '생성중';
    try{
      const canvas = await makeTeamCanvas(team);
      const result = await copyCanvasWithFallback(canvas, 'kinojo-team-'+safeText(team.dataset.team || 'team')+'.png');
      toast(result === 'copied' ? '팀 전체 파티 이미지가 클립보드에 복사되었습니다.' : '클립보드 복사 제한으로 PNG 파일을 저장했습니다.');
    }catch(err){
      console.warn('KINOJO team capture failed:', err);
      toast('팀 전체 이미지 생성에 실패했습니다.');
    }finally{
      btn.disabled = false; btn.textContent = old;
    }
  }

  function bind(){
    document.querySelectorAll('[data-party-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleCopy(btn); });
    });
    document.querySelectorAll('[data-team-copy]').forEach((btn)=>{
      if(btn.dataset.captureBound === '1') return;
      btn.dataset.captureBound = '1';
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); handleTeamCopy(btn); });
    });
  }

  window.KinojoSanctuaryCapture = { bind, makePartyCanvas, makeTeamCanvas };
  document.addEventListener('DOMContentLoaded', bind);
})();
