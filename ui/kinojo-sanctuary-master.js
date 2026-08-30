/*
 * KINOJO Sanctuary Master Renderer
 * Role: sanctuary_master Server 응답을 PC/Mobile/관리자/공통 메뉴에 반복 렌더링합니다.
 * Rule: 성역 이름·코드·개수를 이 파일에 직접 작성하지 않습니다.
 */
(function(){
  'use strict';

  const CACHE_KEY = 'kinojo_sanctuary_master_v229';
  const CACHE_TTL = 5 * 60 * 1000;
  let loadPromise = null;

  function esc(value){
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function safeClass(value){
    return String(value || '').split(/\s+/).filter(part=>/^[a-zA-Z0-9_-]+$/.test(part)).join(' ');
  }

  function safeCode(value){
    const code = String(value || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]*$/.test(code) ? code : '';
  }

  function safeAssetUrl(value){
    const url = String(value || '').trim();
    if(!url) return '';
    if(url.startsWith('/') || /^https:\/\//i.test(url)) return url.replace(/["'()]/g, encodeURIComponent);
    return '';
  }

  function safeBackground(value){
    const bg = String(value || '').trim();
    if(!bg) return '';
    if(/^#[0-9a-f]{3,8}$/i.test(bg)) return bg;
    if(/^(radial-gradient|linear-gradient)\(/i.test(bg) && !/[;{}]/.test(bg)) return bg;
    const url = safeAssetUrl(bg);
    return url ? 'url("' + url + '")' : '';
  }

  function normalizeItem(item, index){
    const code = safeCode(item?.code || item?.sanctuaryId);
    if(!code) return null;
    const order = Number(item?.order ?? item?.sanctuaryNo ?? index + 1);
    return {
      id:item?.id ?? null,
      code,
      name:String(item?.name || item?.sanctuaryName || code),
      shortName:String(item?.shortName || ''),
      bossName:String(item?.bossName || ''),
      sheetName:String(item?.sheetName || ''),
      order:Number.isFinite(order) ? order : index + 1,
      enabled:item?.enabled !== false,
      bannerImage:safeAssetUrl(item?.bannerImage),
      cardClass:safeClass(item?.cardClass),
      mobileCardClass:safeClass(item?.mobileCardClass),
      cardBackground:safeBackground(item?.cardBackground),
      cardSymbol:String(item?.cardSymbol || ''),
      cardLayout:['symbol','layered','image'].includes(String(item?.cardLayout || '')) ? String(item.cardLayout) : 'symbol',
      cardLayers:Array.isArray(item?.cardLayers) ? item.cardLayers.map(layer=>({
        className:safeClass(layer?.className),
        url:safeAssetUrl(layer?.url)
      })).filter(layer=>layer.url) : [],
      accentColor:/^#[0-9a-f]{3,8}$/i.test(String(item?.accentColor || '')) ? String(item.accentColor) : ''
    };
  }

  function normalizePayload(data){
    const items = (Array.isArray(data?.items) ? data.items : [])
      .map(normalizeItem)
      .filter(Boolean)
      .filter(item=>item.enabled)
      .sort((a,b)=>a.order-b.order || a.code.localeCompare(b.code));
    const requestedDefault = safeCode(data?.defaultCode);
    return {
      ok:data?.ok !== false,
      source:String(data?.source || ''),
      defaultCode:items.some(item=>item.code===requestedDefault) ? requestedDefault : (items[0]?.code || ''),
      items,
      generatedAt:String(data?.generatedAt || '')
    };
  }

  function readCache(){
    try{
      const raw = sessionStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const cached = JSON.parse(raw);
      if(!cached?.savedAt || Date.now()-cached.savedAt > CACHE_TTL) return null;
      return normalizePayload(cached.data);
    }catch(_err){ return null; }
  }

  function writeCache(data){
    try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({savedAt:Date.now(),data})); }
    catch(_err){}
  }

  async function waitForApi(){
    for(let i=0;i<80;i+=1){
      if(window.KinojoApi && window.KinojoSupabase && typeof window.KinojoApi.getAction === 'function') return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Kinojo Server API 준비 시간 초과');
  }

  async function fetchMaster(){
    await waitForApi();
    const data = await window.KinojoApi.getAction('sanctuaryMaster', {});
    const normalized = normalizePayload(data || {});
    if(!normalized.ok || !normalized.items.length){
      throw new Error(data?.message || '활성화된 성역 Master가 없습니다.');
    }
    writeCache(data);
    return normalized;
  }

  function load(force){
    if(!force){
      const cached = readCache();
      if(cached?.items?.length) return Promise.resolve(cached);
      if(loadPromise) return loadPromise;
    }
    loadPromise = fetchMaster().finally(()=>{ loadPromise = null; });
    return loadPromise;
  }

  function layerHtml(item){
    return item.cardLayers.map(layer=>{
      const className = layer.className ? ' ' + layer.className : '';
      return '<span class="sanctuary-master-layer'+className+'" aria-hidden="true" style="background-image:url(&quot;'+esc(layer.url)+'&quot;)"></span>';
    }).join('');
  }
  function canonicalHomeLayers(item){
    const code=safeCode(item.code);if(!['rudra','bagot','kaldrix'].includes(code))return '';
    return '<span class="sanctuary-home-background" aria-hidden="true" style="background-image:url(&quot;/assets/images/sanctuary/backgrounds/'+code+'.webp&quot;)"></span>'+
      '<span class="sanctuary-home-boss" aria-hidden="true" style="background-image:url(&quot;/assets/images/sanctuary/bosses-v2/'+code+'.webp&quot;)"></span>'+
      '<span class="sanctuary-home-vignette" aria-hidden="true"></span>';
  }

  function desktopCardHtml(item, basePath){
    const href = String(basePath || 'sanctuary/') + '?id=' + encodeURIComponent(item.code);
    const cardClass = item.cardClass ? ' ' + item.cardClass : '';
    const bgStyle = item.cardBackground ? ' style="--sanctuary-master-bg:'+esc(item.cardBackground)+';'+(item.accentColor?'--sanctuary-master-accent:'+esc(item.accentColor)+';':'')+'"' : '';
    const aria = '성역 ' + item.order + ' ' + (item.shortName || item.name) + ' 파티 확인';

    if(item.cardLayout === 'layered'){
      return '<a class="card sanctuary-master-card sanctuary-master-card-layered sanctuary-home-card sanctuary-home-'+esc(item.code)+cardClass+'" data-sanctuary-home-card href="'+esc(href)+'" aria-label="'+esc(aria)+'"'+bgStyle+'>'+
        canonicalHomeLayers(item)+layerHtml(item)+
        '<div class="rudra-content sanctuary-master-content"><div><div class="rudra-title sanctuary-master-title">성역 '+esc(item.order)+'</div><div class="rudra-sub sanctuary-master-sub">'+esc(item.name)+'</div></div><div class="rudra-enter sanctuary-master-enter">›</div></div>'+
      '</a>';
    }

    return '<a class="card sanctuary-master-card sanctuary-master-card-symbol sanctuary-home-card sanctuary-home-'+esc(item.code)+cardClass+'" data-sanctuary-home-card href="'+esc(href)+'" aria-label="'+esc(aria)+'"'+bgStyle+'>'+
      canonicalHomeLayers(item)+'<span class="sanctuary-symbol" aria-hidden="true">'+esc(item.cardSymbol || '✦')+'</span>'+
      '<div class="sanctuary-card-content sanctuary-master-content"><div><div class="sanctuary-title sanctuary-master-title">성역 '+esc(item.order)+'</div><div class="sanctuary-sub sanctuary-master-sub">'+esc(item.name)+(item.bossName?' · '+esc(item.bossName):'')+'</div></div><div class="sanctuary-enter sanctuary-master-enter">›</div></div>'+
    '</a>';
  }

  function mobileSlideHtml(item, basePath, index){
    const href = String(basePath || 'sanctuary/') + '?id=' + encodeURIComponent(item.code);
    const mobileClass = item.mobileCardClass ? ' ' + item.mobileCardClass : '';
    const bg = item.bannerImage ? 'url("'+item.bannerImage+'")' : item.cardBackground;
    const style = bg ? ' style="--sanctuary-master-bg:'+esc(bg)+';'+(item.accentColor?'--sanctuary-master-accent:'+esc(item.accentColor)+';':'')+'"' : '';
    return '<a class="mobile-sanctuary-slide sanctuary-master-mobile-slide sanctuary-home-mobile-'+esc(item.code)+mobileClass+(index===0?' is-active':'')+'" data-sanctuary-slide data-sanctuary-home-mobile data-arrow-name="'+esc(item.order+'성역')+'" href="'+esc(href)+'" aria-label="'+esc(item.order+'성역 파티 정보 확인')+'"'+style+'>'+
      '<span class="mobile-card-bg sanctuary-master-mobile-bg" aria-hidden="true" style="background-image:url(&quot;/assets/images/sanctuary/backgrounds/'+esc(item.code)+'.webp&quot;)"></span>'+
      '<span class="mobile-sanctuary-boss" aria-hidden="true" style="background-image:url(&quot;/assets/images/sanctuary/bosses-v2/'+esc(item.code)+'.webp&quot;)"></span>'+
      '<span class="mobile-card-shade" aria-hidden="true"></span>'+
      '<span class="mobile-card-copy"><strong>성역 '+esc(item.order)+'</strong><span>'+esc(item.name)+'</span></span>'+
    '</a>';
  }

  function renderDesktop(payload){
    document.querySelectorAll('[data-sanctuary-master-list="desktop"]').forEach(root=>{
      const basePath = root.dataset.sanctuaryBase || 'sanctuary/';
      root.innerHTML = payload.items.map(item=>desktopCardHtml(item, basePath)).join('');
      root.dataset.sanctuaryMasterReady = 'true';
    });
  }

  function renderMobile(payload){
    document.querySelectorAll('[data-sanctuary-master-list="mobile"]').forEach(root=>{
      const basePath = root.dataset.sanctuaryBase || 'sanctuary/';
      root.innerHTML = payload.items.map((item,index)=>mobileSlideHtml(item,basePath,index)).join('');
      root.dataset.sanctuaryMasterReady = 'true';
    });
    document.querySelectorAll('[data-sanctuary-master-dots]').forEach(root=>{
      root.innerHTML = payload.items.map((_,index)=>'<span'+(index===0?' class="active"':'')+' data-sanctuary-dot></span>').join('');
    });
  }

  function populateSelects(payload){
    document.querySelectorAll('[data-sanctuary-master-select]').forEach(select=>{
      const keepAll = select.dataset.includeAll !== 'false';
      const previous = String(select.value || '');
      select.innerHTML = (keepAll ? '<option value="all">전체 성역</option>' : '') + payload.items.map(item=>
        '<option value="'+esc(item.code)+'">'+esc(item.order+'. '+(item.shortName || item.name))+'</option>'
      ).join('');
      if(Array.from(select.options).some(option=>option.value===previous)) select.value = previous;
      else if(!keepAll && payload.defaultCode) select.value = payload.defaultCode;
      select.dataset.sanctuaryDefaultCode = payload.defaultCode;
    });
  }

  function renderNavigation(payload){
    const currentCode=safeCode(new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('sanctuary'));
    document.querySelectorAll('[data-sanctuary-master-nav]').forEach(root=>{
      const basePath = root.dataset.sanctuaryBase || '/sanctuary/';
      root.innerHTML = payload.items.map(item=>
        '<a class="'+(currentCode===item.code?'active':'')+'" href="'+esc(basePath+'?id='+encodeURIComponent(item.code))+'" data-sanctuary-link="'+esc(item.code)+'">'+esc(item.order+'. '+item.name)+'</a>'
      ).join('');
    });
    document.querySelectorAll('[data-sanctuary-master-default-link]').forEach(link=>{
      const basePath = link.dataset.sanctuaryBase || link.getAttribute('href') || '/sanctuary/';
      link.setAttribute('href', basePath.split('?')[0] + (payload.defaultCode ? '?id='+encodeURIComponent(payload.defaultCode) : ''));
    });
  }

  function showError(message){
    document.querySelectorAll('[data-sanctuary-master-list]').forEach(root=>{
      if(root.dataset.sanctuaryMasterReady==='true') return;
      root.innerHTML = '<div class="sanctuary-master-error">'+esc(message || '성역 목록을 불러오지 못했습니다.')+'</div>';
    });
  }

  function renderAll(payload){
    renderDesktop(payload);
    renderMobile(payload);
    populateSelects(payload);
    renderNavigation(payload);
    window.dispatchEvent(new CustomEvent('kinojo:sanctuary-master-rendered',{detail:payload}));
    return payload;
  }

  async function init(){
    try{
      const cached = readCache();
      if(cached?.items?.length) renderAll(cached);
      const fresh = await load(true);
      renderAll(fresh);
    }catch(err){
      if(!readCache()) showError(err?.message || String(err));
    }
  }

  window.KinojoSanctuaryMaster = { load, renderAll, normalizePayload };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
