'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const calls=[],token='kws_'+('A'.repeat(43));let failSuggestion=false;let uuid=0;
const client={normalizePassKey:x=>x,normalizeRole:x=>x,roleToLevel:()=>5,getRoleLabel:x=>x,
 request(){throw Error('DIRECT_TABLE_REQUEST_FORBIDDEN');},getConfig:()=>({enabled:true}),isConfigured:()=>true};
const window={KinojoSupabaseClientCore:client,KinojoSupabaseRpcCore:{rpc:async(name,body)=>{
 calls.push({name,body});
 if(name==='kinojo_web_get_notices')return {ok:true,notices:[{id:1,notice_type:'공지',content:'public'}]};
 if(name==='kinojo_admin_notice_list')return {ok:true,notices:[{id:1,noticeType:'이벤트',isActive:false,createdAt:'fixture'}]};
 if(name==='kinojo_web_hall_suggestion_submit_v544'){if(failSuggestion){failSuggestion=false;throw Error('network-response-lost');}return {ok:true,suggestion:{id:1}};}
 return {ok:true,notice:{id:1,notice_type:'공지'},character:{className:'치유성'}};
 }},KinojoAuth:{getAccount:()=>({role:'MASTER',level:5}),getSession:()=>({token})},
 KinojoAuthService:{verifyPassKey:async()=>({ok:true,session:{token},profile:{role:'MASTER'}})},crypto:{randomUUID:()=>('fixture-request-'+String(++uuid).padStart(4,'0'))}};
vm.runInNewContext(fs.readFileSync('core/kinojo-supabase-features.js','utf8'),{window,localStorage:{getItem:()=>null},URLSearchParams,URL,location:{pathname:'/hof/'},console,Date,Math,setTimeout,clearTimeout});
(async()=>{const api=window.KinojoSupabase;
 await api.lookupMainCharacter('Root[지켈]');assert.equal(calls.at(-1).name,'kinojo_web_lookup_main_character_v544');
 assert.equal(calls.at(-1).body.p_server_id,2002);
 await api.webAction('notices',{});assert.equal(calls.at(-1).name,'kinojo_web_get_notices');
 const list=await api.adminNotice('listNotices');assert.equal(list.notices[0].noticeType,'이벤트');assert.equal(list.notices[0].isActive,false);
 await api.adminNotice('createNotice',{content:'Hello'});assert.equal(calls.at(-1).name,'kinojo_admin_notice_create');assert.equal(calls.at(-1).body.p_pass_key,token);
 await api.adminNotice('updateNotice',{id:1,content:'Update'});assert.equal(calls.at(-1).name,'kinojo_admin_notice_update');
 await api.adminNotice('disableNotice',{id:1});assert.equal(calls.at(-1).name,'kinojo_admin_notice_disable');
 failSuggestion=true;await assert.rejects(api.submitHallSuggestion({title:'Idea',memo:'Memo'}),/response-lost/);
 const firstKey=calls.at(-1).body.p_request_key;
 await api.submitHallSuggestion({title:'Idea',memo:'Memo'});assert.equal(calls.at(-1).body.p_request_key,firstKey,'ambiguous failure must reuse the request key');
 assert.equal('session_token' in calls.at(-1).body,false);
 assert.equal((await api.verifyPassKey('fixture')).session.token,token);
 assert.equal((await api.adminVisit()).code,'LEGACY_VISIT_ADJUSTMENT_RETIRED');
 console.log('PASS: notice/lookup/suggestion RPC projection, retry key reuse and canonical auth delegation; direct REST disabled');
})().catch(e=>{console.error(e);process.exitCode=1;});
