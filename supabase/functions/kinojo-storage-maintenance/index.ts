import { readRequestText } from '../_shared/http-budget.ts';
import {runMaintenance,directConnectionUrl,nativeOptions,nativeReclaimer,type NativeSql} from './reclaim.ts';
declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
type RecordValue=Record<string,unknown>;
const encoder=new TextEncoder(),BUCKET='kinojo-db-backups';
const json=(body:RecordValue,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const sha=async(bytes:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function boundedFetch(url:string,init:RequestInit={},kind:'json'|'bytes'='json'):Promise<{status:number;value:any}>{
 const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Error('UPSTREAM_TIMEOUT'));abort.abort();void reader?.cancel().catch(()=>{});},60000);});
 try{return await Promise.race([deadline,(async()=>{const r=await fetch(url,{...init,signal:abort.signal});
  reader=r.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(reader){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>24000000){void reader.cancel().catch(()=>{});throw Error('UPSTREAM_BODY_LIMIT');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
  return{status:r.status,value:kind==='bytes'?bytes:JSON.parse(new TextDecoder().decode(bytes)||'{}')};})()]);
 }finally{clearTimeout(timer);}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
 let maintenance=false;
 try{
  let body:RecordValue;try{body=JSON.parse(await readRequestText(req,4096,5000));}catch(e){const code=String((e as Error).message);return json({ok:false,code:['REQUEST_TOO_LARGE','REQUEST_BODY_TIMEOUT'].includes(code)?code:'INVALID_JSON'},400);}
  if(body.action==='health')return json({ok:true,service:'kinojo-storage-maintenance',apiVersion:'1.1',boundary:'SERVICE_DB_AND_CRON_TOKEN',databaseContract:'551+553',backupBucketPrivate:true});
  if(body.action==='maintain'||body.action==='maintenanceProbe'){
   maintenance=true;
   const deadline=Date.now()+45000;
   if(Object.keys(body).some(k=>!['action','cronToken'].includes(k)))return json({ok:false,code:'INVALID_MAINTENANCE_ACTION'},400);
   const base=String(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,''),key=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
   if(!base||!key)return json({ok:false,code:'CONFIGURATION_MISSING'},503);
   const rpc=async(step:string,lease?:string,result?:RecordValue)=>{
    const remaining=Math.min(10000,deadline-Date.now());if(remaining<=0)throw Object.assign(Error('WORKER_TIMEOUT'),{safeCode:'WORKER_TIMEOUT'});
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),remaining);
    try{
     const r=await fetch(base+'/rest/v1/rpc/kinojo_storage_maintenance_v553',{method:'POST',signal:abort.signal,
      headers:{apikey:key,Authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify({p_cron_token:String(body.cronToken||''),p_step:step,p_lease:lease||null,p_result:result||null})});
     const value=JSON.parse(await readRequestText(r as unknown as Request,16384,10000));
     if(r.status!==200)throw Error('MAINTENANCE_RPC_FAILED');return value;
    }finally{clearTimeout(timer);}
   };
   let timer:ReturnType<typeof setTimeout>|undefined;
   const result=await Promise.race([runMaintenance(body.action,rpc,async()=>{
    const url=directConnectionUrl(String(Deno.env.get('SUPABASE_DB_URL')||''),base);
    const postgres=(await import('npm:postgres@3.4.7')).default;
    return nativeReclaimer(postgres(url,nativeOptions) as unknown as NativeSql,deadline);
   }),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('WORKER_TIMEOUT')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
   return json(result,result.ok===true?200:result.code==='STORAGE_MAINTENANCE_DENIED'?403:503);
  }
  if(body.action!=='backupPage')return json({ok:false,code:'UNKNOWN_ACTION'},400);
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(String(body.backupRun||'')))return json({ok:false,code:'INVALID_BACKUP_RUN'},400);
  const base=String(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,''),key=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
  if(!base||!key)throw Error('CONFIGURATION_MISSING');
  const headers={apikey:key,Authorization:'Bearer '+key,'content-type':'application/json'};
  const exported=await boundedFetch(base+'/rest/v1/rpc/kinojo_storage_backup_page_v551',{method:'POST',headers,body:JSON.stringify({p_cron_token:String(body.cronToken||''),p_kind:body.kind,p_after:body.after,p_until:body.until,p_before:body.before,p_limit:body.limit||200})});
  const page=exported.value;if(exported.status!==200||page.ok!==true)return json({ok:false,code:page.code||'EXPORT_FAILED'},403);
  if(page.rows===0)return json({ok:true,rows:0,lastId:page.lastId,kind:page.kind});
  const source=encoder.encode(String(page.data));if(source.byteLength!==page.sourceBytes||await sha(source)!==page.sourceSha256)throw Error('EXPORT_HASH_MISMATCH');
  const compressed=new Uint8Array(await new Response(new Blob([source]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bucket=await boundedFetch(base+'/storage/v1/bucket/'+BUCKET,{headers});
  if([400,404].includes(bucket.status)&&(['Bucket not found','The resource was not found'].includes(String(bucket.value.message))||String(bucket.value.statusCode)==='404')){const created=await boundedFetch(base+'/storage/v1/bucket',{method:'POST',headers,body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:24000000,allowed_mime_types:['application/gzip']})});if(created.status>=300)throw Error('PRIVATE_BUCKET_CREATE_FAILED');bucket=await boundedFetch(base+'/storage/v1/bucket/'+BUCKET,{headers});}
  if(bucket.status!==200||bucket.value.public!==false)throw Error('PRIVATE_BUCKET_REQUIRED');
  const path=String(body.backupRun)+'/'+page.kind+'-'+String(body.after)+'-'+page.lastId+'-'+page.sourceSha256+'.jsonl.gz';
  const stored=await boundedFetch(base+'/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{...headers,'content-type':'application/gzip','x-upsert':'false'},body:compressed});
  if(stored.status>=300&&stored.status!==409&&!(stored.status===400&&(stored.value.error==='Duplicate'||String(stored.value.statusCode)==='409')))throw Error('BACKUP_UPLOAD_FAILED');
  const checked=await boundedFetch(base+'/storage/v1/object/authenticated/'+BUCKET+'/'+path,{headers},'bytes');
  if(checked.status!==200)throw Error('BACKUP_READBACK_FAILED');
  const restored=new Uint8Array(await new Response(new Blob([checked.value]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(restored.byteLength!==source.byteLength||await sha(restored)!==page.sourceSha256)throw Error('BACKUP_READBACK_HASH_MISMATCH');
  const signed=await boundedFetch(base+'/storage/v1/object/sign/'+BUCKET+'/'+path,{method:'POST',headers,body:JSON.stringify({expiresIn:600})});
  if(signed.status!==200||!String(signed.value.signedURL||'').startsWith('/object/sign/'+BUCKET+'/'))throw Error('BACKUP_DOWNLOAD_LINK_FAILED');
  return json({ok:true,kind:page.kind,rows:page.rows,lastId:page.lastId,sourceBytes:source.byteLength,sourceSha256:page.sourceSha256,gzipBytes:compressed.byteLength,storagePath:path,signedUrl:base+'/storage/v1'+signed.value.signedURL,verified:true});
 }catch{return json({ok:false,code:maintenance?'STORAGE_MAINTENANCE_FAILED':'STORAGE_BACKUP_FAILED'},502);}
});
