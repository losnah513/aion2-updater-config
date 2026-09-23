const fs=require('node:fs');
module.exports=async function setup(db){
 await db.exec("set time zone 'UTC';create schema private;create schema cron;create role anon;create role authenticated;create role service_role;create sequence lookup_snapshots_id_seq");
 const schema=JSON.parse(fs.readFileSync('tests/fixtures/snapshot-retention-schema.json','utf8'));
 await db.exec('create table lookup_snapshots('+schema.snapshots.map(c=>'"'+c.name+'" '+c.type+(c.notnull?' not null':'')+(c.default?' default '+c.default:'')).join(',')+',primary key(id))');
 for(const table of new Set(schema.tables.map(x=>x.table)))await db.exec('create table '+table+'('+schema.tables.filter(c=>c.table===table).map(c=>'"'+c.column+'" '+c.type).join(',')+')');
 await db.exec('alter table character_skill_current_state add primary key(character_master_id)');
 // PGlite/native local fixtures track scheduling contracts; only production uses pg_cron.
 await db.exec("create table cron.test_jobs(name text primary key,schedule text,command text);create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.test_jobs values($1,$2,$3) returning 1::bigint$$;create function cron.unschedule(text) returns boolean language sql as $$delete from cron.test_jobs where name=$1 returning true$$");
 for(const f of ['tests/fixtures/character-payload-helpers.sql','tests/fixtures/snapshot-retention-audit.sql','tests/fixtures/snapshot-retention-triggers.sql'])await db.exec(fs.readFileSync(f,'utf8'));
 const parser=fs.readFileSync('tests/fixtures/character-refresh-parser.sql','utf8');await db.exec(parser.slice(parser.indexOf('CREATE OR REPLACE FUNCTION')));
};
