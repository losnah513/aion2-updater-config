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
  {id:'ffad2733-d0ef-4c98-8e1a-cccee1d9972a',title:'첫 번째 곡',extension:'mp3'},
  {id:'ffad2733-d0ef-4c98-8e1a-cccee1d9972b',title:'<두 번째 곡>',extension:'mp3'}
];
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
    assert.match(read(file), /data-home-bgm/);
    assert.match(read(file), /kinojo-home-bgm\.js/);
  }
  assert.doesNotMatch(read('ui/kinojo-common-ui.js'), /createNoticeStrip|loadCommonNotices|showNoticeBoardModal/);
  assert.doesNotMatch(read('ranking/index.html'), /data-home-bgm/);
  assert.match(read('home.html'), /kinojo-event-notice\.js/);
  let requests=0, commands=[];
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
      assert.equal(req.headers['x-kinojo-session'],'fixture');
      const parts=[]; for await (const part of req)parts.push(part);
      commands.push({action,body:Buffer.concat(parts).toString(),title:req.headers['x-bgm-title']});
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
    const home=read(url.pathname.startsWith('/m/')?'m/index.html':'index.html');
    const markup=home.match(/<section class="kinojo-home-bgm"[\s\S]*?<\/section>/)[0];
    res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/ui/kinojo-home-bgm.css">'+support+markup+'<script src="/ui/kinojo-home-bgm.js"></script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
  try {
    for(const width of [1440,390,320]){
      requests=0;
      const page=await browser.newPage({viewport:{width,height:840}});
      await isolatePlaywrightPage(page);
      await page.goto(base+(width===1440?'/':'/m/'));
      await page.getByText('첫 번째 곡',{exact:true}).waitFor();
      assert.equal(requests,0,'no audio before play');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      const play=page.getByRole('button',{name:'재생',exact:true});
      await play.click();
      await page.getByRole('button',{name:'일시정지'}).waitFor();
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>0);
      await page.getByRole('button',{name:'일시정지'}).click();
      assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true);
      const seek=page.getByRole('slider');
      await seek.press('End');
      await page.waitForFunction(()=>document.querySelector('audio').currentTime>7.5);
      await page.getByRole('button',{name:'다음 곡'}).click();
      await page.getByText('<두 번째 곡>',{exact:true}).waitFor();
      assert.equal(await page.locator('audio').evaluate(audio=>audio.paused),true);
      await play.click();
      await page.getByRole('button',{name:'일시정지'}).waitFor();
      await page.getByRole('button',{name:'다음 곡'}).click();
      await page.getByText('첫 번째 곡',{exact:true}).waitFor();
      await page.waitForFunction(()=>!document.querySelector('audio').paused && document.querySelector('audio').currentTime>0);
      await page.close();
    }
    for(const width of [1440,320]){
      commands=[];
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
      await row.getByLabel('재생 순서').fill('5');
      await row.getByRole('button',{name:'저장'}).click();
      await page.getByText('곡 정보를 저장했습니다.').waitFor();
      assert.deepEqual(JSON.parse(commands.find(item=>item.action==='update').body),{id:tracks[0].id,title:'제목 수정',sort_order:5});
      page.once('dialog', dialog=>dialog.accept());
      await row.getByRole('button',{name:'삭제'}).click();
      await page.getByText('곡을 삭제했습니다.').waitFor();
      assert.equal(JSON.parse(commands.find(item=>item.action==='delete').body).id,tracks[0].id);
      await page.close();
    }
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
