'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {isVisitRequest,isolatePlaywrightPage,interceptPuppeteerVisit}=require('./helpers/visitor-traffic');
const source=fs.readFileSync('core/kinojo-supabase-features.js','utf8');
async function run(hostname,webdriver=false,marker=false){
 const calls=[],storage=new Map();
 const window={KinojoSupabaseClientCore:{},KinojoSupabaseRpcCore:{rpc:async(...args)=>{calls.push(args);return {ok:true};}},__KINOJO_TEST_TRAFFIC__:marker};
 vm.runInNewContext(source,{window,location:{hostname,href:'https://'+hostname+'/',pathname:'/'},navigator:{webdriver,userAgent:'Chrome'},document:{referrer:''},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},console,URL});
 await window.KinojoSupabase.logPageView('home');return calls;
}
(async()=>{
 for(const host of ['localhost','127.0.0.1','[::1]','preview.example',''])assert.equal((await run(host)).length,0,host);
 assert.equal((await run('kinojo.info',true)).length,0);
 assert.equal((await run('kinojo.info',false,true)).length,0);
 for(const host of ['kinojo.info','www.kinojo.info'])assert.equal((await run(host)).length,1,host);
 for(const name of ['kinojo_log_page_view','kinojo_log_page_view_v329','kinojo_log_page_view_266'])assert.ok(isVisitRequest('https://example/rest/v1/rpc/'+name));
 assert.equal(isVisitRequest('https://example/rest/v1/rpc/kinojo_public_visit_summary_266'),false);
 let handler,fulfilled=0,fallback=0;
 await isolatePlaywrightPage({addInitScript:async()=>{},route:async(_,fn)=>handler=fn});
 await handler({request:()=>({url:()=>'/rest/v1/rpc/kinojo_log_page_view_v329'}),fulfill:async()=>fulfilled++,fallback:async()=>fallback++});
 await handler({request:()=>({url:()=>'/rest/v1/rpc/kinojo_public_visit_summary_266'}),fulfill:async()=>fulfilled++,fallback:async()=>fallback++});
 assert.equal(fulfilled,1);assert.equal(fallback,1);
 let responded=0;assert.equal(interceptPuppeteerVisit({url:()=>'/rest/v1/rpc/kinojo_log_page_view_v329',respond:async()=>responded++}),true);assert.equal(responded,1);
 console.log('PASS: visitor transport isolation and normal production visits');
})().catch(e=>{console.error(e);process.exit(1)});
