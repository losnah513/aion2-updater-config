'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatePlaywrightPage } = require('./helpers/visitor-traffic');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const tracks = [
  {id:'ffad2733-d0ef-4c98-8e1a-cccee1d9972a',title:'첫 번째 곡',extension:'mp3',hasLyrics:true},
  {id:'ffad2733-d0ef-4c98-8e1a-cccee1d9972b',title:'<두 번째 곡>',extension:'mp3'},
  {id:'ffad2733-d0ef-4c98-8e1a-cccee1d9972c',title:'세 번째 곡',extension:'mp3'}
];
const lyric='[00:00.00]<00:00.00>첫 번째 <00:02.00>가사\n[00:04.00]다음 가사';
function wave() {
  const data = Buffer.alloc(44 + 8000*8*2);
  data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
  data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(data.length-44,40);
  return data;
}
test('BGM player and admin controls at PC and narrow mobile widths', async () => {
  for (const file of ['index.html','home.html','m/index.html']) {
    assert.match(read(file), /kinojo-bgm-navigation\.js/);
    assert.match(read(file), /kinojo-home-bgm\.js/);
  }
  assert.doesNotMatch(read('ui/kinojo-common-ui.js'), /createNoticeStrip|loadCommonNotices|showNoticeBoardModal/);
  assert.match(read('ranking/index.html'), /kinojo-home-bgm\.js/);
  assert.match(read('home.html'), /kinojo-event-notice\.js/);
  let requests=0, lyricsRequests=0, commands=[], editedLyric=lyric;
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://127.0.0.1');
    if(url.pathname.startsWith('/storage/')){
      requests++;
      const data=wave(), start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] || 0);
      const partial=Boolean(req.headers.range);
      res.writeHead(partial?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':data.length-start,
        ...(partial?{'Content-Range':'bytes '+start+'-'+(data.length-1)+'/'+data.length}:{})});
      return res.end(data.subarray(start));
    }
    if(url.pathname.startsWith('/functions/')){
      const action=url.searchParams.get('action');
      if(action==='playlist')return res.end(JSON.stringify({ok:true,tracks}));
      if(action==='lyrics'){
        lyricsRequests++;
        return res.end(JSON.stringify({ok:true,lyrics:editedLyric}));
      }
      assert.equal(req.headers['x-kinojo-session'],'fixture');
      const parts=[]; for await (const part of req)parts.push(part);
      const body=Buffer.concat(parts).toString();
      if(action==='update-lyrics')editedLyric=JSON.parse(body).lyrics;
      commands.push({action,body,title:req.headers['x-bgm-title']});
      return res.end(JSON.stringify({ok:true,tracks:tracks.map((track,i)=>({...track,state:'READY',canDelete:true,sort_order:i+1}))}));
    }
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
      res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/css');
      return res.end(read(url.pathname.slice(1)));
    }
    const support='<script>window.KinojoSupabaseClientCore={ensureConfig:async()=>({url:location.origin}),headers:()=>({"content-type":"application/json"})};window.KinojoAuthSessionCore={getToken:()=>"fixture"};window.KinojoAdmin={esc:s=>String(s).replace(/[&<>"\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\x27":"&#39;"})[c])};</script>';
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(url.pathname.includes('admin')){
      const admin = read(url.pathname.startsWith('/m/')?'m/admin/index.html':'admin/index.html');
      const markup=admin.slice(admin.indexOf('<div class="admin-subpane active" data-admin-subpane="bgm">'),admin.indexOf('<div class="admin-subpane" data-admin-subpane="event">'));
      return res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/css/admin.css">'+support+markup+'<script src="/admin/js/admin-bgm.js"></script><script>window.KinojoAdmin.loadBgm()</script>');
    }
    const base = url.pathname.startsWith('/m/') ? '/m/' : '/';
    const label = url.pathname.includes('ranking') ? '순위 화면' : url.pathname.includes('hof') ? '명예의 전당 화면' : '홈 화면';
    res.end('<meta name="viewport" content="width=device-width"><title>'+label+'</title><link rel="stylesheet" href="/ui/kinojo-home-bgm.css"><main><h1>'+label+'</h1><button id="homeAction" onclick="this.dataset.clicked=1">홈 동작</button>'+
      '<nav><a href="'+base+'ranking/?period=week#top">순위</a> <a href="'+base+'hof/">명예의 전당</a> <a href="'+base+'">홈</a> <a href="'+base+'hof/" target="_blank">새 탭</a></nav></main>'+
      support+'<script src="/ui/kinojo-home-bgm.js"></script><script src="/ui/kinojo-bgm-navigation.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const launch=policy=>chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--autoplay-policy='+policy]});
  const browser=await launch('user-gesture-required');
  try {
    for(const width of [1440,390,320]){
      requests=0;lyricsRequests=0;editedLyric=lyric;
      const page=await browser.newPage({viewport:{width,height:840},hasTouch:width<1000});
      await isolatePlaywrightPage(page);
      await page.addInitScript(()=>{Math.random=()=>0;});
      await page.goto(base+(width===1440?'/':'/m/'));
      await page.getByText('화면을 누르면 BGM 재생을 시작합니다.').waitFor();
      assert.equal(await page.locator('[data-bgm-title]').textContent(),'<두 번째 곡>');
      assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true);
      assert.equal(lyricsRequests,0,'lyrics are fetched only for the playing track');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      const play=page.getByRole('button',{name:'재생',exact:true});
      const home=page.getByRole('button',{name:'홈 동작'});
      if(width<1000)await home.tap();else await home.click();
      assert.equal(await home.getAttribute('data-clicked'),'1');
      await page.getByRole('button',{name:'일시정지'}).waitFor();
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
      await page.getByRole('button',{name:'일시정지'}).click();
      await home.click();
      assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true);
      const seek=page.getByRole('slider');
      await seek.press('End');
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>7.5);
      const next=page.getByRole('button',{name:'다음 곡'});
      const title=page.locator('[data-bgm-title]');
      const seen=new Set([await title.textContent()]);
      for(let i=0;i<2;i++){await next.click();seen.add(await title.textContent());}
      assert.equal(seen.size,tracks.length,'all songs occur once during the first shuffle pass');
      const last=await title.textContent();
      await next.click();
      assert.notEqual(await title.textContent(),last,'no repeat across shuffle boundary');
      const listButton=page.getByRole('button',{name:'곡 목록',exact:true});
      await listButton.click();
      const dialog=page.getByRole('dialog',{name:'곡 목록'});
      assert.equal(await dialog.locator('[aria-current]').textContent(),await title.textContent());
      await dialog.getByRole('button',{name:'첫 번째 곡',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await title.textContent(),'첫 번째 곡');
      assert.equal(await listButton.evaluate(el=>el===document.activeElement),true);
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
      await page.getByText('첫 번째 가사',{exact:true}).waitFor();
      assert.ok(lyricsRequests>0&&requests>0);
      await page.getByRole('button',{name:'일시정지'}).click();
      const jump=seconds=>seek.evaluate((node,t)=>{node.value=t;node.dispatchEvent(new Event('input',{bubbles:true}));},seconds);
      await jump(1);
      const spans=page.locator('[data-bgm-lyric-line] span');
      await page.waitForFunction(()=>parseFloat(document.querySelector('[data-bgm-lyric-line] span').style.getPropertyValue('--bgm-fill'))>45);
      assert.equal(await spans.nth(1).evaluate(el=>el.style.getPropertyValue('--bgm-fill')),'0.0%');
      await jump(3);
      await page.waitForFunction(()=>parseFloat(document.querySelectorAll('[data-bgm-lyric-line] span')[1].style.getPropertyValue('--bgm-fill'))>45);
      await jump(5);
      await page.getByText('다음 가사',{exact:true}).waitFor();
      await jump(1);
      await page.getByText('첫 번째 가사',{exact:true}).waitFor();
      await listButton.click();
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
      assert.equal(await listButton.evaluate(el=>el===document.activeElement),true);
      await play.click();
      await page.getByRole('button',{name:'일시정지'}).waitFor();
      await next.click();
      assert.notEqual(await title.textContent(),'첫 번째 곡');
      assert.equal(await page.locator('[data-bgm-lyrics]').isVisible(),false);
      await page.waitForFunction(()=>!document.querySelector('audio').paused && document.querySelector('audio').currentTime>0);
      await page.close();
    }
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:840}});
      await isolatePlaywrightPage(page);
      const prefix=width===1440?'/':'/m/';
      const rank=prefix+'ranking/?period=week#top';
      const hof=prefix+'hof/';
      await page.goto(base+prefix);
      await page.getByText('화면을 누르면 BGM 재생을 시작합니다.').waitFor();
      await page.getByRole('button',{name:'홈 동작'}).click();
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
      const elapsed=await page.locator('audio').evaluate(audio=>{
        window.continuityAudio=audio;
        return audio.currentTime;
      });
      const title=await page.locator('[data-bgm-title]').textContent();
      await page.getByRole('link',{name:'순위',exact:true}).click();
      await page.waitForURL(base+rank);
      const content=page.frameLocator('.kinojo-bgm-page');
      await content.getByRole('heading',{name:'순위 화면'}).waitFor();
      assert.equal(await content.locator('[data-home-bgm]').count(),0);
      const stillPlaying=await page.locator('audio').evaluate((audio,start)=> audio===window.continuityAudio && audio.currentTime>=start && !audio.paused,elapsed);
      assert.equal(stillPlaying,true);
      assert.equal(await page.locator('[data-bgm-title]').textContent(),title);
      const player=await page.locator('[data-home-bgm]').boundingBox();
      const frame=await page.locator('.kinojo-bgm-page').boundingBox();
      assert.ok(Math.abs(frame.y+frame.height-player.y)<2,'page content fits above the player');
      await page.getByRole('button',{name:'일시정지'}).click();
      await content.getByRole('link',{name:'명예의 전당',exact:true}).click();
      await page.waitForURL(base+hof);
      await content.getByRole('heading',{name:'명예의 전당 화면'}).waitFor();
      assert.equal(await page.locator('audio').evaluate(audio=>audio===window.continuityAudio&&audio.paused),true);
      await page.evaluate(()=>history.back());
      await page.waitForURL(base+rank);
      await content.getByRole('heading',{name:'순위 화면'}).waitFor();
      await page.evaluate(()=>history.back());
      await page.waitForURL(base+prefix);
      await page.getByRole('heading',{name:'홈 화면'}).waitFor();
      assert.equal(await page.locator('.kinojo-bgm-page').isVisible(),false);
      assert.equal(await page.locator('audio').evaluate(audio=>audio===window.continuityAudio&&audio.paused),true);
      await page.evaluate(()=>history.forward());
      await page.waitForURL(base+rank);
      await content.getByRole('heading',{name:'순위 화면'}).waitFor();
      const popupPromise=page.waitForEvent('popup');
      await content.getByRole('link',{name:'새 탭'}).click();
      const popup=await popupPromise;
      await popup.waitForURL(base+hof);
      assert.equal(page.url(),base+rank);
      await popup.close();
      await page.close();
    }
    for(const width of [1440,320]){
      commands=[];editedLyric=lyric;
      const page=await browser.newPage({viewport:{width,height:840}});
      await isolatePlaywrightPage(page);
      await page.goto(base+(width===1440?'/admin/':'/m/admin/'));
      const list=page.locator('#adminBgmList');
      await list.locator('[data-track]').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      const upload=page.locator('#adminBgmUpload');
      await upload.locator('[type=file]').setInputFiles({name:'테스트.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('ID3fixture')});
      await upload.getByRole('button',{name:'업로드'}).click();
      await page.getByText('업로드 완료. 홈페이지에서 재생할 수 있습니다.').waitFor();
      assert.equal(decodeURIComponent(commands.find(row=>row.action==='upload').title),'테스트');
      const row=list.locator('[data-track]').first();
      await row.getByLabel('곡 제목').fill('제목 수정');
      await row.getByLabel('목록 순서').fill('5');
      await row.getByRole('button',{name:'저장'}).click();
      await page.getByText('곡 정보를 저장했습니다.').waitFor();
      assert.deepEqual(JSON.parse(commands.find(item=>item.action==='update').body),{id:tracks[0].id,title:'제목 수정',sort_order:5});
      await row.getByRole('button',{name:'가사 수정'}).click();
      const lyricDialog=page.getByRole('dialog',{name:'LRC 가사 관리'});
      const editor=lyricDialog.getByLabel('LRC 가사',{exact:true});
      await editor.waitFor();
      await page.waitForFunction(value=>document.querySelector('#adminBgmLyricsForm textarea').value===value,lyric);
      const nextLyric='[00:00.00]새 가사';
      await lyricDialog.locator('[type=file]').setInputFiles({name:'test.lrc',mimeType:'text/plain',buffer:Buffer.from(nextLyric)});
      await lyricDialog.getByText('가져온 내용을 확인한 뒤 가사 저장을 눌러 주세요.').waitFor();
      await lyricDialog.getByRole('button',{name:'가사 저장'}).click();
      await lyricDialog.waitFor({state:'hidden'});
      await page.getByText('가사를 저장했습니다.').waitFor();
      assert.deepEqual(JSON.parse(commands.find(item=>item.action==='update-lyrics').body),{id:tracks[0].id,lyrics:nextLyric});
      page.once('dialog', dialog=>dialog.accept());
      await row.getByRole('button',{name:'삭제'}).click();
      await page.getByText('곡을 삭제했습니다.').waitFor();
      assert.equal(JSON.parse(commands.find(item=>item.action==='delete').body).id,tracks[0].id);
      await page.close();
    }
    const allowed=await launch('no-user-gesture-required');
    try {
      const page=await allowed.newPage();
      await isolatePlaywrightPage(page);
      await page.goto(base);
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0&&!document.querySelector('audio').muted);
      assert.equal(await page.getByRole('button',{name:'일시정지'}).isVisible(),true);
    } finally { await allowed.close(); }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
