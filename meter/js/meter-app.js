/* KINOJO Meter Web Prototype
 * 역할: Server Engine 261의 집계 결과 표시. 계산·백분위·구간 분류는 WEB에서 수행하지 않습니다.
 */
(function(){
  'use strict';
  const classes=['전체','검성','수호성','살성','궁성','마도성','정령성','치유성','호법성','사격성','기갑성','음유성','권성'];
  const $=id=>document.getElementById(id);
  const fmt=value=>{
    const n=Number(value||0);
    if(!Number.isFinite(n))return '-';
    if(n>=1000000)return (n/1000000).toFixed(n>=10000000?1:2)+'m';
    if(n>=1000)return Math.round(n/1000).toLocaleString('ko-KR')+'k';
    return Math.round(n).toLocaleString('ko-KR');
  };
  const demo={ok:true,isDemo:true,updatedAt:new Date().toISOString(),encounterCount:1842,characterCount:416,medianDps:1120300,p90Dps:1542800,buckets:[
    {bucketStart:300000,bucketEnd:349999,sampleCount:118,medianDps:742000,p90Dps:983000},
    {bucketStart:350000,bucketEnd:399999,sampleCount:264,medianDps:884000,p90Dps:1176000},
    {bucketStart:400000,bucketEnd:449999,sampleCount:438,medianDps:1038000,p90Dps:1384000},
    {bucketStart:450000,bucketEnd:499999,sampleCount:517,medianDps:1216000,p90Dps:1623000},
    {bucketStart:500000,bucketEnd:549999,sampleCount:331,medianDps:1398000,p90Dps:1847000},
    {bucketStart:550000,bucketEnd:599999,sampleCount:174,medianDps:1583000,p90Dps:2079000}
  ]};
  function initFilters(){
    $('meterClass').innerHTML=classes.map(name=>`<option value="${name==='전체'?'':name}">${name}</option>`).join('');
    $('meterClass').value='궁성';
    $('meterQueryBtn').addEventListener('click',loadStats);
    $('meterLoginGuideBtn')?.addEventListener('click',()=>window.KinojoToast?.show?.('상단 PASS KEY 로그인 후 내 기록을 불러올 수 있습니다.'));
  }
  async function loadRelease(){
    try{
      const res=await fetch(new URL('/config.json',location.origin).toString()+'?meter='+Date.now(),{cache:'no-store'});
      const config=await res.json();
      const meter=config?.meter||{};
      if(meter.version)$('meterVersion').textContent=meter.version;
      if(meter.installerSize)$('meterInstallerSize').textContent=meter.installerSize;
      const url=String(meter.downloadUrl||'').trim();
      if(url){
        const link=$('meterDirectDownload');link.href=url;link.textContent='Windows 테스트 버전 다운로드';link.removeAttribute('aria-disabled');
        $('meterDownloadBtn').href=url;
        const sha=String(meter.sha256||'').trim();
        $('meterDownloadNote').textContent=sha&&!sha.startsWith('REPLACE_')?'SHA-256 '+sha:'다운로드 후 게시된 SHA-256과 파일을 확인해 주세요.';
      }
    }catch(_err){}
  }
  function filterParams(){return {className:$('meterClass').value,bossName:$('meterBoss').value,bucketSize:Number($('meterBucket').value||50000),days:Number($('meterDays').value||30)};}
  async function loadStats(){
    $('meterBucketChart').innerHTML='<div class="meter-loading">Server Engine 통계를 불러오는 중...</div>';
    let data=null;
    try{
      data=await window.KinojoApi.getAction('meterStats',filterParams());
      if(!data||data.ok===false)throw new Error(data?.message||'통계 응답 없음');
      $('meterNotice').innerHTML='<strong>Server Engine</strong><span>완료·검증된 전투만 집계하고 있습니다.</span>';
    }catch(err){
      data=demo;
      $('meterNotice').innerHTML='<strong>샘플 데이터</strong><span>261 SQL 배포 또는 유효 표본 수집 전이라 UI 검증용 샘플을 표시합니다.</span>';
    }
    renderStats(data);
    loadMine();
  }
  function renderStats(data){
    $('meterEncounterCount').textContent=Number(data.encounterCount||0).toLocaleString('ko-KR');
    $('meterCharacterCount').textContent=Number(data.characterCount||0).toLocaleString('ko-KR');
    $('meterMedianDps').textContent=fmt(data.medianDps);
    $('meterP90Dps').textContent=fmt(data.p90Dps);
    $('meterUpdatedAt').textContent=data.updatedAt?new Date(data.updatedAt).toLocaleString('ko-KR'):'업데이트 완료';
    const rows=Array.isArray(data.buckets)?data.buckets:[];
    const max=Math.max(1,...rows.map(row=>Number(row.p90Dps||0)));
    $('meterBucketChart').innerHTML=rows.length?rows.map(row=>{
      const median=Math.max(3,Math.min(100,Number(row.medianDps||0)/max*100));
      const p90=Math.max(3,Math.min(100,Number(row.p90Dps||0)/max*100));
      return `<div class="meter-bucket-row"><div class="meter-bucket-label"><strong>${Number(row.bucketStart||0).toLocaleString('ko-KR')}~</strong><small>표본 ${Number(row.sampleCount||0).toLocaleString('ko-KR')}전</small></div><div class="meter-bars"><div class="meter-bar"><i style="width:${median}%"></i><span>중앙 ${fmt(row.medianDps)}</span></div><div class="meter-bar p90"><i style="width:${p90}%"></i><span>상위 10% ${fmt(row.p90Dps)}</span></div></div></div>`;
    }).join(''):'<div class="meter-empty">선택한 조건에 공개 가능한 표본이 없습니다.</div>';
  }
  async function loadMine(){
    try{
      const result=await window.KinojoApi.getAction('meterMyComparison',filterParams());
      if(!result||result.ok===false||!result.hasRecord)throw new Error('no-record');
      $('meterMyEmpty').hidden=true;$('meterMyResult').hidden=false;
      $('meterMyTop').textContent='상위 '+Number(result.topPercent||0).toFixed(1)+'%';
      $('meterMySample').textContent='표본 '+Number(result.sampleCount||0).toLocaleString('ko-KR')+'전';
      $('meterMyDps').textContent=fmt(result.myDps);$('meterMyMedian').textContent=fmt(result.medianDps);
      const diff=Number(result.diffPercent||0);$('meterMyDiff').textContent=(diff>=0?'+':'')+diff.toFixed(1)+'%';
    }catch(_err){$('meterMyEmpty').hidden=false;$('meterMyResult').hidden=true;}
  }
  document.addEventListener('DOMContentLoaded',()=>{initFilters();loadRelease();loadStats();});
})();
