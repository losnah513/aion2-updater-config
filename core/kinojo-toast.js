/*
 * KINOJO TOAST ENGINE
 * Role: 저장 완료/실패/권한 없음 등 공통 알림.
 */
(function(){
  'use strict';
  function show(message, options){
    const text = String(message || '');
    if(!text) return;
    const el = document.createElement('div');
    el.className = 'kinojo-common-toast kinojo-toast ' + (options?.type ? 'is-' + options.type : '');
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    const duration = Number(options?.duration || 2100);
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 240); }, duration);
  }
  window.KinojoToast = { version:'1.3.1.17', show, success:(m)=>show(m,{type:'success'}), error:(m)=>show(m,{type:'error',duration:2600}) };
})();
