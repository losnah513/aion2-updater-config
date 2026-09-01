export type SanctuaryAsset = Readonly<{
  code:string;
  order:number;
  bossKey:string;
  bossName:string;
  directory:string;
}>;

const SANCTUARY_ASSETS: Readonly<Record<string,SanctuaryAsset>> = Object.freeze({
  rudra:Object.freeze({code:'rudra',order:1,bossKey:'rudra',bossName:'루드라',directory:'sanctuary-1-rudra'}),
  bagot:Object.freeze({code:'bagot',order:2,bossKey:'bagot',bossName:'중합체 바고트',directory:'sanctuary-2-bagot'}),
  kaldrix:Object.freeze({code:'kaldrix',order:3,bossKey:'kaldrix',bossName:'지저의 재앙 칼드릭스',directory:'sanctuary-3-kaldrix'}),
  sanctuary4:Object.freeze({code:'sanctuary4',order:4,bossKey:'deltras',bossName:'델트라스',directory:'sanctuary-4-deltras'})
});

const SANCTUARY_ALIASES: Readonly<Record<string,string>> = Object.freeze({
  '1':'rudra',sanctuary1:'rudra',rudra:'rudra',
  '2':'bagot',sanctuary2:'bagot',bagot:'bagot',
  '3':'kaldrix',sanctuary3:'kaldrix',kaldrix:'kaldrix',
  '4':'sanctuary4',sanctuary4:'sanctuary4',deltras:'sanctuary4'
});

export function normalizeSanctuaryCode(value:unknown){
  const key=String(value??'').replace(/\s+/g,' ').trim().toLowerCase();
  return SANCTUARY_ALIASES[key]||key;
}

export function sanctuaryAsset(value:unknown){
  return SANCTUARY_ASSETS[normalizeSanctuaryCode(value)]||null;
}

export function sanctuaryAssetPath(value:unknown,kind:'background'|'boss'){
  const item=sanctuaryAsset(value);
  return item?`/assets/images/sanctuary/${item.directory}/${kind}.webp`:'';
}
