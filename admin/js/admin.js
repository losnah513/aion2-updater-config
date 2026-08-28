/* KINOJO Admin modular loader v2026082901 */
(function(){
  'use strict';
  const current=document.currentScript;
  const currentUrl=new URL(current?.src||location.href,location.href);
  const base=new URL('./',currentUrl);
  const CACHE=String(currentUrl.searchParams.get('cache')||'2026082901').trim()||'2026082901';
  const modulePromises=new Map();
  const coreModules=[
    'admin-shared.js'
  ];
  const featureModules={
    requests:['admin-members.js'],
    members:['admin-members.js','admin-member-image-download.js'],
    characters:['admin-characters.js'],
    sanctuary:[],
    notices:['admin-notices.js'],
    meter:['admin-system.js'],
    system:['admin-system.js'],
    logs:['admin-system.js'],
    images:[
      'admin-images.js',
      'admin-banner-delete.js',
      'admin-side-banners.js',
      'admin-banner-event-workflow.js',
      'admin-banner-events.js',
      'admin-banner-quality.js',
      'admin-banner-tabs.js',
      'admin-banner-library.js',
      'admin-banner-auto-pool.js'
    ]
  };
  function loadScript(name){
    if(modulePromises.has(name))return modulePromises.get(name);
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=new URL(name+'?cache='+encodeURIComponent(CACHE),base).href;
      script.async=false;
      script.onload=()=>resolve(name);
      script.onerror=()=>{
        modulePromises.delete(name);
        reject(new Error('관리자 모듈을 불러오지 못했습니다: '+name));
      };
      document.head.appendChild(script);
    });
    modulePromises.set(name,promise);
    return promise;
  }
  async function ensureFeatureModules(tab){
    for(const name of featureModules[String(tab||'')]||[])await loadScript(name);
  }
  function showLoadError(error){
    console.error('[KINOJO ADMIN]',error);
    const root=document.querySelector('.kinojo-admin-console')||document.body;
    const box=document.createElement('div');
    box.className='admin-access-block';
    box.innerHTML='<h1>관리자 화면을 불러오지 못했습니다</h1><p>'+String(error?.message||error)+'</p><button class="admin-btn primary" type="button">새로고침</button>';
    box.querySelector('button').addEventListener('click',()=>location.reload());
    root.replaceChildren(box);
  }
  (async()=>{
    try{
      for(const name of coreModules)await loadScript(name);
      window.KinojoAdmin.ensureFeatureModules=ensureFeatureModules;
      await loadScript('admin-bootstrap.js');
    }catch(error){
      showLoadError(error);
    }
  })();
})();
