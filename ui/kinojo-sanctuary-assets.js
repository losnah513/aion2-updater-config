/*
 * KINOJO Sanctuary asset registry
 * Keep every browser-side Sanctuary image lookup behind this single map.
 */
(function(){
  'use strict';

  const ROOT='/assets/images/sanctuary';
  const ITEMS=Object.freeze({
    rudra:Object.freeze({code:'rudra',order:1,bossKey:'rudra',bossName:'루드라',directory:'sanctuary-1-rudra'}),
    bagot:Object.freeze({code:'bagot',order:2,bossKey:'bagot',bossName:'중합체 바고트',directory:'sanctuary-2-bagot'}),
    kaldrix:Object.freeze({code:'kaldrix',order:3,bossKey:'kaldrix',bossName:'지저의 재앙 칼드릭스',directory:'sanctuary-3-kaldrix'}),
    sanctuary4:Object.freeze({code:'sanctuary4',order:4,bossKey:'deltras',bossName:'델트라스',directory:'sanctuary-4-deltras'})
  });
  const ALIASES=Object.freeze({
    '1':'rudra',sanctuary1:'rudra',rudra:'rudra',
    '2':'bagot',sanctuary2:'bagot',bagot:'bagot',
    '3':'kaldrix',sanctuary3:'kaldrix',kaldrix:'kaldrix',
    '4':'sanctuary4',sanctuary4:'sanctuary4',deltras:'sanctuary4'
  });

  function normalize(value){
    const key=String(value??'').trim().toLowerCase();
    return ALIASES[key]||key;
  }

  function get(value){
    const item=ITEMS[normalize(value)];
    if(!item)return null;
    const base=ROOT+'/'+item.directory;
    return Object.freeze({
      ...item,
      background:base+'/background.webp',
      boss:base+'/boss.webp'
    });
  }

  function list(){return Object.keys(ITEMS).map(get);}

  window.KinojoSanctuaryAssets=Object.freeze({get,list,normalize,version:'20260901_01'});
})();
