const fs=require('node:fs');
module.exports=async function setup(db){
 const schema=require('../fixtures/storage-budget-schema.json');
 const tables=[...new Set(schema.columns.filter(c=>c.schema==='public').map(c=>'public.'+c.table)),'private.character_growth_rollups'];
 await require('./storage-budget-db.cjs')(db,tables);
 const base=fs.readFileSync('supabase/migrations/20261031054426_storage_budget_current_and_retention.sql','utf8');
 await db.exec(base.slice(base.indexOf('CREATE TABLE private.kinojo_storage_budget_control_v549'),base.indexOf('CREATE FUNCTION private.kinojo_storage_review_summary_v549')));
 await db.exec(`create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz default now());insert into vault.decrypted_secrets(name,decrypted_secret) values('kinojo_server_automation_cron_token','offline-storage-control');
 create schema net;create table net.calls(body jsonb);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int)returns bigint language plpgsql as $$begin insert into net.calls values(body);return 1;end$$;
 create schema cron;create table cron.job(jobid int generated always as identity,jobname text,schedule text,command text,active boolean default true);create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid::bigint$$;
 create function cron.unschedule(text) returns boolean language sql as $$delete from cron.job where jobname=$1 returning true$$;
 create function private.kinojo_storage_compact_v549(boolean,integer,jsonb) returns jsonb language sql as $$select '{"ok":true,"counts":{}}'::jsonb$$;`);
 await db.exec('begin;'+fs.readFileSync('supabase/migrations/20261031092317_automatic_storage_reclaim.sql','utf8')+'commit;');
 await db.exec('update private.kinojo_storage_budget_control_v549 set enabled=true');
 const rpc=async function rpc(step,lease=null,result=null,key='offline-storage-control'){
  return (await db.query('select public.kinojo_storage_maintenance_v553($1,$2,$3,$4) value',[key,step,lease,result?JSON.stringify(result):null])).rows[0].value;
 };
 rpc.seed=async function seed(table,given){const v={...given};for(const c of schema.columns.filter(c=>c.schema+'.'+c.table===table&&c.notnull&&!c.default&&!c.generated))if(!(c.name in v))v[c.name]=c.type==='jsonb'?{}:c.type==='boolean'?false:c.type.includes('timestamp')?'2026-10-01T00:00:00Z':c.type==='date'?'2026-10-01':/int|numeric/.test(c.type)?1:'fixture';const cols=Object.keys(v);return db.query('insert into '+table+'('+cols.map(x=>'"'+x+'"').join(',')+') values('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',cols.map(c=>typeof v[c]==='object'&&v[c]!==null?JSON.stringify(v[c]):v[c]));};
 return rpc;
};
