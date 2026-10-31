// SQL553 owns selection/retention. This adapter only executes fixed physical utilities.
type Query=PromiseLike<any> & {cancel?:()=>Promise<unknown>};
export type NativeSql={unsafe:(query:string,params?:unknown[])=>Query;end:(options:{timeout:number})=>Promise<unknown>};
export const RECLAIM_TABLES=Object.freeze([
 'public.lookup_snapshots','public.extension_character_payloads','public.master_sync_events',
 'public.growth_reviews','public.updater_runtime_events','public.snapshot_intake_events',
 'public.updater_session_progress_current','public.lookup_session_targets','public.character_history',
 'public.google_list_sheet_sync_queue','public.kinojo_page_view_events',
 'private.kinojo_ranking_snapshot_items_v390','private.kinojo_ranking_snapshot_owner_metrics_v390',
 'private.kinojo_ranking_snapshot_scopes_v390']);
const error=(code:string)=>Object.assign(new Error(code),{safeCode:code});
export function safeFailure(value:unknown):string{
 const e=value as {code?:string;safeCode?:string;message?:string};
 if(e?.code==='P0001'&&String(e.message).includes('STORAGE_PROTECTED_STATE_CHANGED'))return 'PROTECTED_STATE_CHANGED';
 if(e?.code==='57014')return 'QUERY_TIMEOUT';if(e?.code==='55P03')return 'BUSY';
 return ['CONFIGURATION_MISSING','UNVERIFIED_CONNECTION','LEASE_LOST','WORKER_TIMEOUT','BUSY','QUERY_TIMEOUT','RECLAIM_FAILED'].includes(String(e?.safeCode))?String(e.safeCode):'CONNECTION_UNAVAILABLE';
}
export function directConnectionUrl(dbUrl:string,apiUrl:string):string{
 if(!dbUrl)throw error('CONFIGURATION_MISSING');
 let source:URL,api:URL;try{source=new URL(dbUrl);api=new URL(apiUrl);}catch{throw error('UNVERIFIED_CONNECTION');}
 const project=api.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
 if(!project||!['postgres:','postgresql:'].includes(source.protocol)||source.pathname!=='/postgres'||!source.username||!source.password)
  throw error('UNVERIFIED_CONNECTION');
 const direct='db.'+project+'.supabase.co';
 const pool=source.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(source.username).endsWith('.'+project);
 if(source.hostname!==direct&&!pool)throw error('UNVERIFIED_CONNECTION');
 // Reuse only this project's existing credential; never use transaction pooling for session settings/locks.
 if(pool)source.username=decodeURIComponent(source.username).slice(0,-project.length-1);
 source.hostname=direct;source.port='5432';source.search='';source.hash='';return source.toString();
}
export const nativeOptions=Object.freeze({max:1,prepare:false,connect_timeout:5,idle_timeout:2,max_lifetime:60,
 ssl:{rejectUnauthorized:true},connection:{application_name:'kinojo-storage-maintenance',statement_timeout:5000,lock_timeout:300,idle_in_transaction_session_timeout:5000,TimeZone:'UTC'},
 onnotice:()=>{}});
export function nativeReclaimer(sql:NativeSql,deadline=Date.now()+45000){
 let pid:number|null=null,active:Query|undefined;
 const query=async(text:string,params:unknown[]=[])=>{
  const remaining=Math.min(6500,deadline-Date.now());if(remaining<=0)throw error('WORKER_TIMEOUT');
  active=sql.unsafe(text,params);let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([Promise.resolve(active),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void active?.cancel?.().catch(()=>{});reject(error('WORKER_TIMEOUT'));},remaining);})]);}
  finally{clearTimeout(timer);active=undefined;}
 };
 const verify=async()=>{
  const [r]=await query("select pg_backend_pid() pid,current_database() db,current_setting('statement_timeout') statement_timeout,current_setting('lock_timeout') lock_timeout,has_function_privilege(current_user,'private.kinojo_storage_reclaim_fence_v553(uuid)','execute') and has_function_privilege(current_user,'private.kinojo_storage_compact_v549(boolean,integer,jsonb)','execute') and not exists(select 1 from unnest($1::text[]) rel where to_regclass(rel) is not null and not has_table_privilege(current_user,to_regclass(rel),'MAINTAIN')) native_access",[RECLAIM_TABLES]);
  if(r.db!=='postgres'||r.native_access!==true||r.statement_timeout!=='5s'||r.lock_timeout!=='300ms'||(pid!==null&&pid!==Number(r.pid)))throw error('UNVERIFIED_CONNECTION');
  pid=Number(r.pid);return {statementTimeoutMs:5000,lockTimeoutMs:300,directSession:true,permissionsVerified:true};
 };
 return{
  verify,
  async acquire(){await verify();return Boolean((await query('select pg_try_advisory_lock(501,501) allowed'))[0].allowed);},
  async cleanup(lease:string){await verify();if(!(await query('select private.kinojo_storage_reclaim_fence_v553($1::uuid) allowed',[lease]))[0].allowed)throw error('LEASE_LOST');
   return (await query('select private.kinojo_storage_compact_v549(false,500,null) result'))[0].result;},
  async reclaim(relation:string,lease:string){
   if(!RECLAIM_TABLES.includes(relation))throw error('UNVERIFIED_CONNECTION');await verify();
   if(!(await query('select private.kinojo_storage_reclaim_fence_v553($1::uuid) allowed',[lease]))[0].allowed)throw error('LEASE_LOST');
   const before=(await query('select pg_relation_filenode($1::regclass)::text node,pg_total_relation_size($1::regclass)::text bytes',[relation]))[0];
   try{
    const quoted=relation.split('.').map(x=>'"'+x+'"').join('.');
    await query('VACUUM (FULL, ANALYZE, SKIP_LOCKED) '+quoted);
    const after=(await query('select pg_relation_filenode($1::regclass)::text node,pg_total_relation_size($1::regclass)::text bytes',[relation]))[0];
    return {relation,status:after.node!==before.node?'REWRITTEN':'BUSY',bytesBefore:Number(before.bytes),bytesAfter:Number(after.bytes)};
   }catch(e){const code=safeFailure(e);if(code==='QUERY_TIMEOUT'||code==='BUSY')return {relation,status:code};throw e;}
  },
  async close(){void active?.cancel?.().catch(()=>{});await sql.end({timeout:1}).catch(()=>{});}
 };
}
export async function runMaintenance(action:'maintain'|'maintenanceProbe',rpc:(step:string,lease?:string,result?:Record<string,unknown>)=>Promise<any>,connect:()=>Promise<ReturnType<typeof nativeReclaimer>>){
 const claim=await rpc(action==='maintenanceProbe'?'probe':'claim');
 if(claim.ok!==true||(!['PROBE','RECLAIM'].includes(claim.operation)))return claim;
 let db:ReturnType<typeof nativeReclaimer>|undefined;let failure:string|undefined;const tables:unknown[]=[];
 try{
  db=await connect();const readiness=await db.verify();
  if(action==='maintenanceProbe')return {ok:true,operation:'PROBE',...readiness};
  if(!await db.acquire())throw error('BUSY');
  if(!Array.isArray(claim.tables)||claim.tables.length>2||!claim.tables.every((t:string)=>RECLAIM_TABLES.includes(t)))throw error('UNVERIFIED_CONNECTION');
  if(claim.mode==='AUTOMATIC'){const cleaned=await db.cleanup(claim.lease);if(cleaned?.busy)throw error('BUSY');if(cleaned?.ok!==true)throw error('RECLAIM_FAILED');}
  for(const relation of claim.tables)tables.push(await db.reclaim(relation,claim.lease));
 }catch(e){failure=safeFailure(e);}
 finally{await db?.close();}
 if(action==='maintenanceProbe')return {ok:false,code:failure||'UNVERIFIED_CONNECTION'};
 return await rpc('finish',claim.lease,{tables,errorCode:failure});
}
