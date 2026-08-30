'use strict';

const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');

const BASE=String(process.env.LIVE_BASE||'https://kinojo.info').replace(/\/$/,'');
const CHROME=String(process.env.CHROME_BIN||'').trim();
assert.ok(CHROME,'CHROME_BIN is required');

const pages=[
  {name:'HOME',path:'/',slots:['LEFT','RIGHT']},
  {name:'HOF',path:'/hof/',slots:['LEFT','RIGHT']},
  {name:'RANKING',path:'/ranking/',slots:['LEFT','RIGHT']},
  {name:'LEGION_TREE',path:'/legion-tree/',slots:['LEFT','RIGHT']},
  {name:'METER',path:'/meter/',slots:['LEFT','RIGHT']},
  {name:'SANCTUARY',path:'/sanctuary/',slots:['LEFT','RIGHT']},
];
const widths=[1839,1840,1920,2560];
const height=1080;
const approx=(actual,expected,tolerance=1)=>Math.abs(actual-expected)<=tolerance;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function snapshot(page){
  return page.evaluate(()=>{
    const slots=[...document.querySelectorAll('[data-kinojo-pc-banner]')].map(slot=>{
      const rect=slot.getBoundingClientRect();
      const host=slot.closest('.kinojo-pc-banner-host');
      const hostRect=host?.getBoundingClientRect?.();
      const style=getComputedStyle(slot);
      const code=slot.classList.contains('is-left')?'LEFT':slot.classList.contains('is-right')?'RIGHT':'';
      const image=slot.querySelector('.kinojo-pc-banner-image');
      return {
        code,
        display:style.display,
        position:style.position,
        overflow:style.overflow,
        borderRadius:style.borderRadius,
        width:rect.width,
        height:rect.height,
        left:rect.left,
        right:rect.right,
        top:rect.top,
        bottom:rect.bottom,
        target:slot.dataset.kinojoPcBannerTarget||'',
        state:slot.dataset.kinojoPcBannerState||'',
        text:String(slot.textContent||'').trim(),
        ariaHidden:slot.getAttribute('aria-hidden'),
        mediaCount:slot.querySelectorAll('.kinojo-pc-banner-media').length,
        imageCount:slot.querySelectorAll('.kinojo-pc-banner-image').length,
        imageSrc:String(image?.currentSrc||image?.src||''),
        host:hostRect?{left:hostRect.left,right:hostRect.right,top:hostRect.top,bottom:hostRect.bottom,width:hostRect.width,height:hostRect.height}:null,
      };
    });
    return {href:location.href,pathname:location.pathname,width:innerWidth,height:innerHeight,scrollY,slots};
  });
}

function verify(pageSpec,width,data){
  assert.equal(data.width,width,`${pageSpec.name} viewport width`);
  assert.deepEqual(data.slots.map(s=>s.code),pageSpec.slots,`${pageSpec.name} slot mapping`);
  assert.equal(data.slots.some(s=>s.code==='RIGHT'),pageSpec.slots.includes('RIGHT'),`${pageSpec.name} RIGHT presence`);

  for(const slot of data.slots){
    if(width<1840){
      assert.equal(slot.target,'',`${pageSpec.name}:${slot.code} hidden slot must not bind or fetch a manifest`);
      assert.equal(slot.display,'none',`${pageSpec.name}:${slot.code} hidden below 1840`);
      assert.equal(slot.width,0,`${pageSpec.name}:${slot.code} hidden width`);
      assert.equal(slot.height,0,`${pageSpec.name}:${slot.code} hidden height`);
      continue;
    }

    assert.equal(slot.target,`${pageSpec.name}:${slot.code}`,`${pageSpec.name}:${slot.code} manifest target`);
    assert.equal(slot.display,'grid',`${pageSpec.name}:${slot.code} display at ${width}`);
    assert.equal(slot.position,'fixed',`${pageSpec.name}:${slot.code} fixed`);
    assert.equal(slot.overflow,'hidden',`${pageSpec.name}:${slot.code} overflow`);
    assert.equal(slot.borderRadius,'4px',`${pageSpec.name}:${slot.code} corner`);
    assert.ok(approx(slot.width,300),`${pageSpec.name}:${slot.code} width=${slot.width}`);
    assert.ok(approx(slot.height,715),`${pageSpec.name}:${slot.code} height=${slot.height}`);
    assert.ok(slot.left>=-1&&slot.right<=width+1,`${pageSpec.name}:${slot.code} inside viewport ${slot.left}..${slot.right}/${width}`);
    assert.ok(slot.top>=13&&slot.bottom<=height-13,`${pageSpec.name}:${slot.code} vertical viewport ${slot.top}..${slot.bottom}`);
    assert.ok(slot.host,`${pageSpec.name}:${slot.code} host exists`);
    const gap=slot.code==='LEFT'?slot.host.left-slot.right:slot.left-slot.host.right;
    assert.ok(approx(gap,14,2),`${pageSpec.name}:${slot.code} host gap=${gap}`);
    assert.ok(slot.state==='empty'||slot.state==='rendered',`${pageSpec.name}:${slot.code} state=${slot.state}`);
    if(slot.state==='empty'){
      assert.equal(slot.text,'300 × 715',`${pageSpec.name}:${slot.code} empty label`);
      assert.equal(slot.ariaHidden,'true',`${pageSpec.name}:${slot.code} empty aria-hidden`);
      assert.equal(slot.mediaCount,0,`${pageSpec.name}:${slot.code} empty media`);
    }else{
      assert.equal(slot.ariaHidden,null,`${pageSpec.name}:${slot.code} rendered aria-hidden`);
      assert.equal(slot.mediaCount,1,`${pageSpec.name}:${slot.code} rendered media`);
      assert.equal(slot.imageCount,1,`${pageSpec.name}:${slot.code} rendered image`);
      assert.ok(/^https?:\/\//.test(slot.imageSrc),`${pageSpec.name}:${slot.code} rendered image URL`);
    }
  }
}

(async()=>{
  const browser=await puppeteer.launch({
    executablePath:CHROME,
    headless:true,
    args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],
  });
  const failures=[];
  try{
    for(const pageSpec of pages){
      const page=await browser.newPage();
      page.setDefaultNavigationTimeout(45000);
      await page.setViewport({width:1839,height,deviceScaleFactor:1});
      const response=await page.goto(BASE+pageSpec.path,{waitUntil:'domcontentloaded'});
      assert.ok(response&&response.status()>=200&&response.status()<400,`${pageSpec.name} HTTP ${response?.status()}`);
      await page.waitForSelector('[data-kinojo-pc-banner]',{timeout:15000});
      await sleep(1200);

      for(const width of widths){
        await page.setViewport({width,height,deviceScaleFactor:1});
        await sleep(350);
        const data=await snapshot(page);
        try{
          verify(pageSpec,width,data);
          console.log(`PASS ${pageSpec.name} ${width}x${height} slots=${data.slots.map(s=>`${s.code}:${s.state}`).join(',')}`);
        }catch(error){
          failures.push(`${pageSpec.name} ${width}x${height}: ${error.message}`);
          console.error('FAIL',pageSpec.name,width,JSON.stringify(data));
        }
      }

      await page.setViewport({width:1920,height,deviceScaleFactor:1});
      await sleep(250);
      const before=await snapshot(page);
      await page.evaluate(()=>window.scrollTo(0,Math.min(600,Math.max(0,document.documentElement.scrollHeight-innerHeight))));
      await sleep(250);
      const after=await snapshot(page);
      for(const slot of before.slots){
        const moved=after.slots.find(s=>s.code===slot.code);
        if(!moved||!approx(moved.top,slot.top,1))failures.push(`${pageSpec.name}:${slot.code} fixed top moved ${slot.top} -> ${moved?.top}`);
      }
      console.log(`PASS ${pageSpec.name} fixed-scroll check`);
      await page.close();
    }
  }finally{
    await browser.close();
  }

  if(failures.length){
    console.error('\nKINOJO PC SIDE live E2E failures:');
    for(const failure of failures)console.error('- '+failure);
    process.exit(1);
  }
  console.log(`KINOJO PC SIDE live E2E: PASS (${pages.length} pages × ${widths.length} widths + fixed scroll)`);
})().catch(error=>{console.error(error?.stack||error);process.exit(1)});
