/* KINOJO Admin modular loader v2026082301 */
(function(){
  'use strict';
  const current=document.currentScript;
  const base=new URL('./',current?.src||location.href);
  const modules=[
    'admin-shared.js',
    'admin-members.js',
    'admin-member-image-download.js',
    'admin-characters.js',
    'admin-sanctuary.js',
    'admin-notices.js',
    'admin-system.js',
    'admin-images.js',
    'admin-banner-delete.js',
    'admin-side-banners.js',
    'admin-banner-quality.js',
    'admin-bootstrap.js'
  ];
  function loadScript(name){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const cache=name==='admin-banner-delete.js'?'2026082301':'2026082202';
      script.src=new URL(name+'?cache='+cache,base).href;
      script.async=false;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('관리자 모듈을 불러오지 못했습니다: '+name));
      document.head.appendChild(script);
    });
  }
  (async()=>{
    try{
      for(const name of modules)await loadScript(name);
    }catch(error){
      console.error('[KINOJO ADMIN]',error);
      const root=document.querySelector('.kinojo-admin-console')||document.body;
      const box=document.createElement('div');
      box.className='admin-access-block';
      box.innerHTML='<h1>관리자 화면을 불러오지 못했습니다</h1><p>'+String(error?.message||error)+'</p><button class="admin-btn primary" type="button">새로고침</button>';
      box.querySelector('button').addEventListener('click',()=>location.reload());
      root.replaceChildren(box);
    }
  })();
})();
