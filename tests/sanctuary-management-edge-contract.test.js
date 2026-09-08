const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edgePath = path.join(root, 'supabase/functions/sanctuary-management/index.ts');
const configPath = path.join(root, 'supabase/config.toml');
const edge = fs.readFileSync(edgePath, 'utf8');
const config = fs.readFileSync(configPath, 'utf8');

for (const token of [
  'EDGE_CONTRACT_AUTHORITY',
  'DB RPC payloads can retain legacy apiVersion/schemaVersion values',
  'JSON.stringify({...body,service:SERVICE,apiVersion,databaseContract,schemaVersion:Number(databaseContract),availableContract:DATABASE_CONTRACT})',
]) assert.ok(edge.includes(token), `Edge contract authority rule missing: ${token}`);

assert.equal(
  edge.includes('JSON.stringify({service:SERVICE,apiVersion:API_VERSION,databaseContract:DATABASE_CONTRACT,...body})'),
  false,
  'DB payload must never overwrite Edge-owned contract fields',
);
assert.ok(config.includes('[functions.sanctuary-management]'), 'sanctuary-management function config missing');
assert.ok(config.includes('entrypoint = "./functions/sanctuary-management/index.ts"'), 'sanctuary-management source entrypoint missing');

console.log('KINOJO sanctuary-management Edge contract authority: PASS');

// Exercise both client generations against the same deployed handler. Database
// payload versions must never override the negotiated browser response.
const vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
let handler;
const context=vm.createContext({
  Request,Response,Headers,URL,URLSearchParams,TextEncoder,AbortController,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
  Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-service-key':undefined},serve:fn=>{handler=fn;}},
  fetch:async()=>new Response(JSON.stringify({ok:true,apiVersion:1.8,schemaVersion:446,databaseContract:446,teams:[]})),
});
vm.runInContext(stripTypeScriptTypes(edge,{mode:'strip'}),context);
(async()=>{
 for(const modern of [false,true]){
  const result=await handler(new Request('https://fixture.invalid/sanctuary-management',{method:'POST',headers:{'content-type':'application/json',origin:'https://kinojo.info'},body:JSON.stringify({action:'bootstrap',...(modern?{clientContract:480}:{})})}));
  const data=await result.json();
  assert.equal(result.status,200);
  assert.equal(String(data.apiVersion),modern?'2.5':'2.4');
  assert.equal(Number(data.schemaVersion),modern?480:458);
  assert.equal(String(data.availableContract),'480');
 }
 console.log('Sanctuary cached/current browser contract negotiation: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
