'use strict';
// Production read-only ACL probes. Never submit a mutation to test its denial.
const fs=require('node:fs'),assert=require('node:assert/strict');
if(process.env.KINOJO_LIVE_ACL!=='1'){console.log('SKIP: explicit live ACL readback only');process.exit(0);}
(async()=>{
 const c=JSON.parse(fs.readFileSync('config.json','utf8')).supabase;
 for(const relation of ['v_kinojo_admin_members','member_codes','updater_sessions','character_master','announcements','hall_suggestions']){
  const res=await fetch(c.url+'/rest/v1/'+relation+'?select=id&limit=0',{headers:{apikey:c.publishableKey},signal:AbortSignal.timeout(10000)});
  await res.arrayBuffer();
  assert.ok([401,403].includes(res.status),relation+' must deny direct public reads; HTTP '+res.status);
 }
 const res=await fetch(c.url+'/rest/v1/rpc/kinojo_web_character_summary_v548',{method:'POST',headers:{apikey:c.publishableKey,'content-type':'application/json'},body:JSON.stringify({p_name:'CODEX_UNKNOWN_READ_ONLY_548',p_server_id:2002,p_server_name:null}),signal:AbortSignal.timeout(10000)});
 assert.equal(res.status,200,'explicit public getter remains callable');assert.equal(await res.json(),null);
 console.log('PASS: six protected relations deny zero-row public reads; explicit public getter remains available; no writes performed');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
