'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec('create schema private;create role anon;create role authenticated;create role service_role;');
 await db.exec(fs.readFileSync('supabase/migrations/20261031042342_auth_login_attempt_budget.sql','utf8'));
 const admit=async(scope='a'.repeat(64))=>(await db.query('select public.kinojo_auth_login_admit_v546($1) r',[scope])).rows[0].r;
 for(let i=0;i<20;i++)assert.equal((await admit()).ok,true);
 let denied=await admit();assert.equal(denied.code,'AUTH_RATE_LIMITED');assert.ok(denied.retryAfter>0&&denied.retryAfter<=300);
 for(let i=0;i<99;i++)assert.equal((await admit(i.toString(16).padStart(64,'0'))).ok,true);
 assert.equal((await admit('b'.repeat(64))).ok,false,'global cap cannot be bypassed with distinct client pseudonyms');
 assert.equal((await db.query('select count(*)::int n from private.auth_login_buckets_v546')).rows[0].n,101);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.kinojo_auth_login_admit_v546(text)','execute') ok",[role])).rows[0].ok,false);
 assert.equal((await admit('invalid')).code,'AUTH_LIMIT_SCOPE_INVALID');
 let handler,issueCalls=0;const scopes=[];
 const context=vm.createContext({TextEncoder,TextDecoder,Request,Response,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
  Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://fixture.invalid':'synthetic-backend'},serve:fn=>handler=fn},
  fetch:async(url,init)=>{const b=JSON.parse(init.body);if(url.includes('admit_v546')){scopes.push(b.p_client_scope);return Response.json({ok:false,retryAfter:35});}issueCalls++;return Response.json({ok:false});}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/http-budget.ts','utf8')).replace('export async','async'),context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/kinojo-member-auth/index.ts','utf8').replace(/^import .*http-budget.*;$/m,'')),context);
 const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'192.0.2.1',origin:'https://kinojo.info'},body:JSON.stringify({action:'login',passKey:'synthetic-fixture'})}));
 assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'35');assert.equal(issueCalls,0);assert.match(scopes[0],/^[a-f0-9]{64}$/);assert.ok(!scopes[0].includes('192.0.2.1'));
 assert.equal((await r.json()).code,'AUTH_RATE_LIMITED');
 console.log('PASS: atomic client/global login caps, bounded identity-free buckets, service-only ACL and Edge fail-closed 429 before credential verification');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
