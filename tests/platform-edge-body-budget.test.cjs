'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const context=vm.createContext({TextDecoder,Uint8Array,setTimeout,clearTimeout});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/http-budget.ts','utf8')).replace('export async','async'),context);
(async()=>{
 const read=context.readRequestText;
 assert.equal(await read(new Request('https://fixture.invalid',{method:'POST',body:'한글'}),8),'한글');
 await assert.rejects(read(new Request('https://fixture.invalid',{method:'POST',body:'한글한글'}),8),e=>e.message==='REQUEST_TOO_LARGE');
 await assert.rejects(read(new Request('https://fixture.invalid',{method:'POST',headers:{'content-length':'1000000'},body:'small'}),8),e=>e.message==='REQUEST_TOO_LARGE');
 let cancelled=false;
 const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 await assert.rejects(read(new Request('https://fixture.invalid',{method:'POST',body:stream,duplex:'half'}),8,10),e=>e.message==='REQUEST_BODY_TIMEOUT');
 assert.equal(cancelled,true,'slow uploads must stop reading');
 console.log('PASS: UTF-8 byte cap while streaming, declared oversize rejection and timed cancellation of slow uploads');
})().catch(e=>{console.error(e);process.exitCode=1;});
