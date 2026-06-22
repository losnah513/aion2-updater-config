(function(){
  'use strict';
  const WATERMARK = '해당 이미지는 KINOJO AI가 생성했습니다';
  const state = { bound: false };

  function safeText(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function getPartyData(party){
    const title = safeText(party.querySelector('.party-title')?.textContent || '파티');
    const count = safeText(party.querySelector('.party-count')?.textContent || '');
    const members = Array.from(party.querySelectorAll('.char-card,.empty-slot')).map((card)=>{
      const empty = card.classList.contains('empty-slot');
      if(empty){
        return { empty:true, name:safeText(card.querySelector('strong')?.textContent || '모집중'), meta:safeText(card.querySelector('span')?.textContent || '') };
      }
      return {
        empty:false,
        name:safeText(card.querySelector('.char-name')?.textContent),
        meta:safeText(card.querySelector('.char-meta')?.textContent),
        icon:card.querySelector('.class-icon')?.src || card.querySelector('img')?.src || ''
      };
    });
    return { title, count, members };
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

  async function makePartyCanvas(party){
    const data = getPartyData(party);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = 900;
    const cols = 2;
    const gap = 14;
    const pad = 28;
    const headerH = 86;
    const footH = 46;
    const cellW = Math.floor((width - pad*2 - gap) / cols);
    const cellH = 86;
    const rows = Math.max(1, Math.ceil(data.members.length / cols));
    const height = pad + headerH + rows*cellH + (rows-1)*gap + footH + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    canvas.style.width = width+'px'; canvas.style.height = height+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);

    ctx.fillStyle = '#f7f9fd';
    ctx.fillRect(0,0,width,height);
    const grad = ctx.createLinearGradient(0,0,width,height);
    grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#eef4ff');
    ctx.fillStyle = grad;
    roundRect(ctx,14,14,width-28,height-28,22); ctx.fill();
    ctx.strokeStyle = '#d9e2f0'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#1f2f46'; ctx.font = '800 31px Arial, sans-serif'; ctx.textBaseline='top';
    ctx.fillText(data.title, pad, pad);
    ctx.fillStyle = '#667085'; ctx.font = '800 17px Arial, sans-serif';
    if(data.count) ctx.fillText(data.count, width - pad - ctx.measureText(data.count).width, pad + 8);
    ctx.fillStyle = '#8a5a0a'; ctx.font = '800 14px Arial, sans-serif';
    ctx.fillText('KINOJO Sanctuary Party', pad, pad + 43);

    const icons = await Promise.all(data.members.map(m=>loadImage(m.icon)));
    let y = pad + headerH;
    data.members.forEach((m, idx)=>{
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = pad + col*(cellW + gap);
      const cy = y + row*(cellH + gap);
      ctx.fillStyle = m.empty ? '#fbfdff' : '#ffffff';
      roundRect(ctx,x,cy,cellW,cellH,14); ctx.fill();
      ctx.strokeStyle = m.empty ? '#d6deeb' : '#dce5f2'; ctx.lineWidth = 1.5; ctx.setLineDash(m.empty ? [7,6] : []); ctx.stroke(); ctx.setLineDash([]);
      if(icons[idx]){
        ctx.drawImage(icons[idx], x+16, cy+24, 30, 30);
      }else{
        ctx.fillStyle = m.empty ? '#edf2f7' : '#eaf1fb';
        roundRect(ctx,x+16,cy+24,30,30,8); ctx.fill();
      }
      ctx.fillStyle = m.empty ? '#7b8798' : '#1f2f46'; ctx.font = '900 18px Arial, sans-serif';
      drawText(ctx, m.name || (m.empty?'모집중':'-'), x+56, cy+17, cellW-72, 22);
      ctx.fillStyle = '#667085'; ctx.font = '800 13px Arial, sans-serif';
      drawText(ctx, m.meta || '', x+56, cy+47, cellW-72, 17);
    });

    ctx.fillStyle = '#718096'; ctx.font = '800 14px Arial, sans-serif';
    const wmWidth = ctx.measureText(WATERMARK).width;
    ctx.fillText(WATERMARK, width - pad - wmWidth, height - pad - 18);
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

  async function handleCopy(btn){
    const party = btn.closest('.party-card');
    if(!party) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = '생성중';
    try{
      const canvas = await makePartyCanvas(party);
      const blob = await canvasToBlob(canvas);
      try{
        await copyBlob(blob);
        toast('파티 이미지가 클립보드에 복사되었습니다.');
      }catch(err){
        downloadBlob(blob, 'kinojo-party-'+safeText(party.dataset.partyNo || 'party')+'.png');
        toast('클립보드 복사 제한으로 PNG 파일을 저장했습니다.');
      }
    }catch(err){
      console.warn('KINOJO party capture failed:', err);
      toast('파티 이미지 생성에 실패했습니다.');
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
  }

  window.KinojoSanctuaryCapture = { bind, makePartyCanvas };
  document.addEventListener('DOMContentLoaded', bind);
})();
